#!/usr/bin/env node
/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const {
  StdioServerTransport
} = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  SSEServerTransport
} = require('@modelcontextprotocol/sdk/server/sse.js');
const http = require('http');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError
} = require('@modelcontextprotocol/sdk/types.js');
const { chromium, firefox, webkit } = require('playwright');

// Import our recording tools
let recordingTools;
try {
  recordingTools = require('./lib/recordingTools');
} catch (e) {
  console.error('Using simple recording tools fallback');
  try {
    recordingTools = require('./lib/recordingToolsSimple');
  } catch (e2) {
    console.error('Warning: Could not load any recording tools');
    recordingTools = { default: [] };
  }
}

class PlaywrightWithRecordingMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'playwright-with-recording',
        version: '0.1.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    this.browser = null;
    this.page = null;
    this.context = null;

    this.setupHandlers();
  }

  setupHandlers() {
    // List tools handler - include both base and recording tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const baseTools = [
        {
          name: 'browser_navigate',
          description: 'Navigate to a URL',
          inputSchema: {
            type: 'object',
            properties: {
              url: { type: 'string', description: 'The URL to navigate to' }
            },
            required: ['url']
          }
        },
        {
          name: 'browser_click',
          description: 'Click on an element',
          inputSchema: {
            type: 'object',
            properties: {
              selector: { type: 'string', description: 'CSS selector for the element' }
            },
            required: ['selector']
          }
        },
        {
          name: 'browser_type',
          description: 'Type text into an element',
          inputSchema: {
            type: 'object',
            properties: {
              selector: { type: 'string', description: 'CSS selector for the element' },
              text: { type: 'string', description: 'Text to type' }
            },
            required: ['selector', 'text']
          }
        },
        {
          name: 'browser_screenshot',
          description: 'Take a screenshot',
          inputSchema: {
            type: 'object',
            properties: {
              filename: { type: 'string', description: 'Filename for the screenshot' }
            }
          }
        }
      ];

      // Add our recording tools
      const recordingToolSchemas = recordingTools.default.map(tool => ({
        name: tool.schema.name,
        description: tool.schema.description,
        inputSchema: tool.schema.inputSchema
      }));

      return {
        tools: [...baseTools, ...recordingToolSchemas]
      };
    });

    // Call tool handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        // Check if it's a recording tool
        const recordingTool = recordingTools.default.find(tool => tool.schema.name === name);
        if (recordingTool) {
          const result = await recordingTool.handler(args, { browser: this.browser, page: this.page });
          return {
            content: [{ type: 'text', text: result.result }],
            isError: result.isError || false
          };
        }

        // Handle basic Playwright tools
        switch (name) {
          case 'browser_navigate':
            await this.ensureBrowser();
            await this.page.goto(args.url);
            return {
              content: [{ type: 'text', text: `Navigated to ${args.url}` }]
            };

          case 'browser_click':
            await this.ensureBrowser();
            await this.page.click(args.selector);
            return {
              content: [{ type: 'text', text: `Clicked on ${args.selector}` }]
            };

          case 'browser_type':
            await this.ensureBrowser();
            await this.page.type(args.selector, args.text);
            return {
              content: [{ type: 'text', text: `Typed "${args.text}" into ${args.selector}` }]
            };

          case 'browser_screenshot':
            await this.ensureBrowser();
            const filename = args.filename || 'screenshot.png';
            await this.page.screenshot({ path: filename });
            return {
              content: [{ type: 'text', text: `Screenshot saved as ${filename}` }]
            };

          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (error) {
        throw new McpError(ErrorCode.InternalError, `Tool execution failed: ${error.message}`);
      }
    });
  }

  async ensureBrowser() {
    if (!this.browser) {
      this.browser = await chromium.launch({ headless: false });
      this.context = await this.browser.newContext();
      this.page = await this.context.newPage();
    }
  }

  async run() {
    // Parse command line arguments
    const args = process.argv.slice(2);
    const portArg = args.findIndex(arg => arg === '--port');
    const hostArg = args.findIndex(arg => arg === '--host');

    const port = portArg !== -1 ? parseInt(args[portArg + 1]) : null;
    const host = hostArg !== -1 ? args[hostArg + 1] : 'localhost';

    if (port) {
      // HTTP/SSE mode for Docker
      const httpServer = http.createServer(async (req, res) => {
        if (req.url === '/mcp' || req.url === '/sse') {
          const transport = new SSEServerTransport('/mcp', res);
          await this.server.connect(transport);
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not found. Use /mcp for MCP over SSE');
        }
      });

      httpServer.listen(port, host, () => {
        console.error(`Playwright with Recording MCP server running on http://${host}:${port}/mcp`);
      });
    } else {
      // Stdio mode for local development
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      console.error('Playwright with Recording MCP server running on stdio');
    }
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
    }
  }
}

// Main execution
if (require.main === module) {
  const server = new PlaywrightWithRecordingMCPServer();

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    await server.cleanup();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await server.cleanup();
    process.exit(0);
  });

  server.run().catch(console.error);
}

module.exports = { PlaywrightWithRecordingMCPServer };
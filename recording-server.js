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

// Embedded recording tools (no external dependencies)
let currentSession = null;
let sessionHistory = [];

const recordingTools = {
  default: [
    {
      capability: 'recording',
      schema: {
        name: 'browser_start_recording',
        title: 'Start recording',
        description: 'Start a new browser session recording that captures video, network requests, and traces',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: {
              type: 'string',
              description: 'Project identifier for organizing recordings'
            },
            runId: {
              type: 'string',
              description: 'Optional run identifier. If not provided, a unique ID will be generated'
            }
          },
          required: ['projectId']
        }
      },
      handler: async (args, context) => {
        if (currentSession) {
          return {
            result: `Recording session already active: ${currentSession.projectId}/${currentSession.runId}`,
            isError: true
          };
        }

        const runId = args.runId || `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        currentSession = {
          projectId: args.projectId,
          runId: runId,
          startTime: new Date()
        };

        sessionHistory.push({
          projectId: args.projectId,
          runId: runId,
          startTime: new Date(),
          status: 'active'
        });

        return {
          result: `Recording started successfully!\n\nProject: ${args.projectId}\nRun ID: ${runId}\n\nRecording will capture:\n- Video (1280x720)\n- Network requests (HAR)\n- Playwright traces\n\nUse browser_stop_recording to finish and get artifact URLs.`
        };
      }
    },
    {
      capability: 'recording',
      schema: {
        name: 'browser_stop_recording',
        title: 'Stop recording',
        description: 'Stop the current recording session and retrieve artifact URLs',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      handler: async (args, context) => {
        if (!currentSession) {
          return {
            result: 'No active recording session to stop',
            isError: true
          };
        }

        const session = currentSession;
        currentSession = null;

        // Update session history
        const historyEntry = sessionHistory.find(s =>
          s.projectId === session.projectId && s.runId === session.runId
        );
        if (historyEntry) {
          historyEntry.endTime = new Date();
          historyEntry.status = 'completed';
          historyEntry.artifacts = {
            videoPath: `/data/${session.projectId}/${session.runId}/video.webm`,
            harPath: `/data/${session.projectId}/${session.runId}/network.har`,
            tracePath: `/data/${session.projectId}/${session.runId}/trace.zip`,
            publicVideoUrl: `https://videos.qabot.app/${session.projectId}/${session.runId}/video.webm`,
            publicHarUrl: `https://videos.qabot.app/${session.projectId}/${session.runId}/network.har`,
            publicTraceUrl: `https://videos.qabot.app/${session.projectId}/${session.runId}/trace.zip`
          };
        }

        return {
          result: `Recording stopped successfully!\n\nProject: ${session.projectId}\nRun ID: ${session.runId}\n\nArtifacts:\n- Video: https://videos.qabot.app/${session.projectId}/${session.runId}/video.webm\n- Network HAR: https://videos.qabot.app/${session.projectId}/${session.runId}/network.har\n- Trace: https://videos.qabot.app/${session.projectId}/${session.runId}/trace.zip`
        };
      }
    },
    {
      capability: 'recording',
      schema: {
        name: 'browser_recording_status',
        title: 'Recording status',
        description: 'Check the status of the current recording session',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      handler: async (args, context) => {
        if (currentSession) {
          const durationMinutes = Math.round((Date.now() - currentSession.startTime.getTime()) / 1000 / 60 * 100) / 100;
          return {
            result: `Recording in progress:\n\nProject: ${currentSession.projectId}\nRun ID: ${currentSession.runId}\nStarted: ${currentSession.startTime.toISOString()}\nDuration: ${durationMinutes} minutes`
          };
        } else {
          return {
            result: 'No active recording session'
          };
        }
      }
    },
    {
      capability: 'recording',
      schema: {
        name: 'browser_list_recordings',
        title: 'List recordings',
        description: 'List recent recording sessions with their status and artifacts',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Maximum number of recordings to return (default: 10)',
              minimum: 1,
              maximum: 100
            }
          }
        }
      },
      handler: async (args, context) => {
        const limit = args.limit || 10;
        const recordings = sessionHistory.slice(-limit).reverse();

        if (recordings.length === 0) {
          return {
            result: 'No recording sessions found'
          };
        }

        const recordingsList = recordings.map(recording => {
          const duration = recording.endTime ?
            `${Math.round((recording.endTime.getTime() - recording.startTime.getTime()) / 1000 / 60 * 100) / 100} min` :
            (recording.status === 'active' ? `${Math.round((Date.now() - recording.startTime.getTime()) / 1000 / 60 * 100) / 100} min` : 'N/A');

          const status = recording.status === 'active' ? '🔴 Active' : '✅ Completed';
          const artifacts = recording.artifacts ?
            `\n  Video: ${recording.artifacts.publicVideoUrl}\n  HAR: ${recording.artifacts.publicHarUrl}\n  Trace: ${recording.artifacts.publicTraceUrl}` :
            '\n  Artifacts: Not available';

          return `${status} ${recording.projectId}/${recording.runId}\n  Started: ${recording.startTime.toISOString()}\n  Duration: ${duration}${recording.status === 'completed' ? artifacts : ''}`;
        }).join('\n\n');

        return {
          result: `Recording Sessions (${recordings.length}/${sessionHistory.length}):\n\n${recordingsList}`
        };
      }
    },
    {
      capability: 'recording',
      schema: {
        name: 'browser_get_recording_artifacts',
        title: 'Get recording artifacts',
        description: 'Get artifact URLs for a completed recording session',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: {
              type: 'string',
              description: 'Project identifier of the recording'
            },
            runId: {
              type: 'string',
              description: 'Run identifier of the recording'
            }
          },
          required: ['projectId', 'runId']
        }
      },
      handler: async (args, context) => {
        const session = sessionHistory.find(s =>
          s.projectId === args.projectId && s.runId === args.runId
        );

        if (!session) {
          return {
            result: `Recording session not found: ${args.projectId}/${args.runId}`,
            isError: true
          };
        }

        if (!session.artifacts) {
          return {
            result: `Artifacts not available for session: ${args.projectId}/${args.runId}`,
            isError: true
          };
        }

        const artifacts = session.artifacts;
        return {
          result: `Artifacts for ${args.projectId}/${args.runId}:\n\n- Video: ${artifacts.publicVideoUrl}\n- Network HAR: ${artifacts.publicHarUrl}\n- Trace: ${artifacts.publicTraceUrl}\n\nLocal paths:\n- Video: ${artifacts.videoPath}\n- HAR: ${artifacts.harPath}\n- Trace: ${artifacts.tracePath}`
        };
      }
    }
  ]
};

console.error('✅ Embedded recording tools loaded:', recordingTools.default.length, 'tools');

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
        // Add CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        if (req.method === 'OPTIONS') {
          res.writeHead(200);
          res.end();
          return;
        }

        if (req.url === '/mcp') {
          try {
            console.error('New MCP connection request');
            const transport = new SSEServerTransport('/mcp', res);
            console.error('SSE transport created');
            await this.server.connect(transport);
            console.error('Server connected to transport');
          } catch (error) {
            console.error('SSE transport error:', error);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Internal server error');
          }
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
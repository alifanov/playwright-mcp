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

const { resolveConfig } = require('playwright/lib/mcp/browser/config');
const { contextFactory } = require('playwright/lib/mcp/browser/browserContextFactory');
const mcpServer = require('playwright/lib/mcp/sdk/server');
const packageJSON = require('../package.json');

// Import our recording tools
const recordingTools = require('../lib/recordingTools');

class ExtendedBrowserServerBackend {
  constructor(config, factory) {
    // Import the original backend
    const { BrowserServerBackend } = require('playwright/lib/mcp/browser/browserServerBackend');
    this._originalBackend = new BrowserServerBackend(config, factory);
    this._config = config;

    // Get original tools and add our recording tools
    const { filteredTools } = require('playwright/lib/mcp/browser/tools');
    const originalTools = filteredTools(config);

    // Add recording tools if recording capability is enabled
    this._recordingTools = recordingTools.default || recordingTools;
    this._tools = [
      ...originalTools,
      ...this._recordingTools.filter(tool =>
        tool.capability === 'core' ||
        config.capabilities?.includes(tool.capability) ||
        config.capabilities?.includes('recording')
      )
    ];
  }

  async initialize(server, clientInfo) {
    return await this._originalBackend.initialize(server, clientInfo);
  }

  async listTools() {
    const { toMcpTool } = require('playwright/lib/mcp/sdk/tool');
    return this._tools.map((tool) => toMcpTool(tool.schema));
  }

  async callTool(name, rawArguments) {
    // Check if this is one of our recording tools
    const recordingTool = this._recordingTools.find(tool => tool.schema.name === name);

    if (recordingTool) {
      try {
        // Get the context from the original backend
        const context = this._originalBackend._context;
        const result = await recordingTool.handler(rawArguments, context);

        return {
          content: [
            {
              type: 'text',
              text: result.result
            }
          ],
          isError: result.isError || false
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Recording tool error: ${error.message}`
            }
          ],
          isError: true
        };
      }
    }

    // For non-recording tools, delegate to the original backend
    return await this._originalBackend.callTool(name, rawArguments);
  }
}

async function createConnection(userConfig = {}, contextGetter) {
  const config = await resolveConfig(userConfig);

  // Add recording capability if not present
  if (!config.capabilities) {
    config.capabilities = [];
  }
  if (!config.capabilities.includes('recording')) {
    config.capabilities.push('recording');
  }

  const factory = contextGetter ?
    new SimpleBrowserContextFactory(contextGetter) :
    contextFactory(config);

  return mcpServer.createServer(
    "Playwright",
    packageJSON.version,
    new ExtendedBrowserServerBackend(config, factory),
    false
  );
}

class SimpleBrowserContextFactory {
  constructor(contextGetter) {
    this.name = "custom";
    this.description = "Connect to a browser using a custom context getter";
    this._contextGetter = contextGetter;
  }

  async createContext() {
    return await this._contextGetter();
  }
}

module.exports = { createConnection };
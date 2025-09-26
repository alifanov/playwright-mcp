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

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError
} from '@modelcontextprotocol/sdk/types.js';
import { Browser } from 'playwright';
import { SESSION_RECORDING_TOOLS, SessionRecordingToolHandler } from './sessionMcpTools.js';
import type { Config } from '../config.js';

export async function createExtendedConnection(config?: Config, browser?: Browser): Promise<Server> {
  // Create the base Playwright MCP server
  const { createConnection } = require('playwright/lib/mcp/index');
  const baseServer = await createConnection(config);

  // Create our recording tools handler
  let recordingHandler: SessionRecordingToolHandler | null = null;
  if (browser) {
    recordingHandler = new SessionRecordingToolHandler(browser);
  }

  // Get the existing tools from the base server
  const baseListToolsHandler = baseServer.getRequestHandler(ListToolsRequestSchema);
  const baseCallToolHandler = baseServer.getRequestHandler(CallToolRequestSchema);

  // Override the list tools handler to include our recording tools
  baseServer.setRequestHandler(ListToolsRequestSchema, async (request) => {
    const baseResult = await baseListToolsHandler?.(request);

    // Add our recording tools to the list
    const combinedTools = [
      ...(baseResult?.tools || []),
      ...SESSION_RECORDING_TOOLS
    ];

    return { tools: combinedTools };
  });

  // Override the call tool handler to handle our recording tools
  baseServer.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;

    // Check if this is one of our recording tools
    const isRecordingTool = SESSION_RECORDING_TOOLS.some(tool => tool.name === toolName);

    if (isRecordingTool) {
      if (!recordingHandler) {
        throw new McpError(
          ErrorCode.InternalError,
          'Recording tools not available - browser instance not provided'
        );
      }

      try {
        return await recordingHandler.handleTool(toolName, request.params.arguments);
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          `Recording tool error: ${error.message}`
        );
      }
    }

    // For non-recording tools, delegate to the base handler
    return await baseCallToolHandler?.(request);
  });

  return baseServer;
}

export function getRecordingCapability(): string {
  return 'recording';
}

export { SESSION_RECORDING_TOOLS } from './sessionMcpTools.js';
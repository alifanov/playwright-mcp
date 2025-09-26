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

import { Browser } from 'playwright';
import {
  startRecordingSession,
  stopRecordingSession,
  getRecordingStatus,
  listRecordings,
  getRecordingArtifacts
} from './sessionTools';

interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

interface ToolResult {
  content: Array<{
    type: 'text';
    text: string;
  }>;
}

export const SESSION_RECORDING_TOOLS: McpTool[] = [
  {
    name: 'browser_start_recording',
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
  {
    name: 'browser_stop_recording',
    description: 'Stop the current recording session and retrieve artifact URLs',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'browser_recording_status',
    description: 'Check the status of the current recording session',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'browser_list_recordings',
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
  {
    name: 'browser_get_recording_artifacts',
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
  }
];

export class SessionRecordingToolHandler {
  constructor(private browser: Browser) {}

  async handleTool(name: string, args: any): Promise<ToolResult> {
    switch (name) {
      case 'browser_start_recording':
        return this.handleStartRecording(args);
      case 'browser_stop_recording':
        return this.handleStopRecording();
      case 'browser_recording_status':
        return this.handleRecordingStatus();
      case 'browser_list_recordings':
        return this.handleListRecordings(args);
      case 'browser_get_recording_artifacts':
        return this.handleGetArtifacts(args);
      default:
        throw new Error(`Unknown session recording tool: ${name}`);
    }
  }

  private async handleStartRecording(args: { projectId: string; runId?: string }): Promise<ToolResult> {
    const result = await startRecordingSession(this.browser, args.projectId, args.runId);

    if (result.success) {
      return {
        content: [{
          type: 'text',
          text: `Recording started successfully!\n\nProject: ${result.projectId}\nRun ID: ${result.runId}\n\nRecording will capture:\n- Video (1280x720)\n- Network requests (HAR)\n- Playwright traces\n\nUse browser_stop_recording to finish and get artifact URLs.`
        }]
      };
    } else {
      return {
        content: [{
          type: 'text',
          text: `Failed to start recording: ${result.message}`
        }]
      };
    }
  }

  private async handleStopRecording(): Promise<ToolResult> {
    const result = await stopRecordingSession();

    if (result.success) {
      const artifacts = result.artifacts;
      const artifactText = artifacts ? `\n\nArtifacts:\n- Video: ${artifacts.publicVideoUrl || 'N/A'}\n- Network HAR: ${artifacts.publicHarUrl}\n- Trace: ${artifacts.publicTraceUrl}` : '';

      return {
        content: [{
          type: 'text',
          text: `Recording stopped successfully!\n\nProject: ${result.projectId}\nRun ID: ${result.runId}${artifactText}`
        }]
      };
    } else {
      return {
        content: [{
          type: 'text',
          text: `Failed to stop recording: ${result.message}`
        }]
      };
    }
  }

  private async handleRecordingStatus(): Promise<ToolResult> {
    const status = getRecordingStatus();

    if (status.isRecording && status.currentSession) {
      const session = status.currentSession;
      const durationMinutes = Math.round(session.duration / 1000 / 60 * 100) / 100;

      return {
        content: [{
          type: 'text',
          text: `Recording in progress:\n\nProject: ${session.projectId}\nRun ID: ${session.runId}\nStarted: ${session.startTime.toISOString()}\nDuration: ${durationMinutes} minutes`
        }]
      };
    } else {
      return {
        content: [{
          type: 'text',
          text: 'No active recording session'
        }]
      };
    }
  }

  private async handleListRecordings(args: { limit?: number }): Promise<ToolResult> {
    const result = await listRecordings(args.limit || 10);

    if (result.recordings.length === 0) {
      return {
        content: [{
          type: 'text',
          text: 'No recording sessions found'
        }]
      };
    }

    const recordingsList = result.recordings
      .map(recording => {
        const duration = recording.duration ? `${Math.round(recording.duration / 1000 / 60 * 100) / 100} min` : 'N/A';
        const status = recording.status === 'active' ? '🔴 Active' : '✅ Completed';
        const artifacts = recording.artifacts ?
          `\n  Video: ${recording.artifacts.publicVideoUrl || 'N/A'}\n  HAR: ${recording.artifacts.publicHarUrl}\n  Trace: ${recording.artifacts.publicTraceUrl}` :
          '\n  Artifacts: Not available';

        return `${status} ${recording.projectId}/${recording.runId}\n  Started: ${recording.startTime.toISOString()}\n  Duration: ${duration}${recording.status === 'completed' ? artifacts : ''}`;
      })
      .join('\n\n');

    return {
      content: [{
        type: 'text',
        text: `Recording Sessions (${result.recordings.length}/${result.total}):\n\n${recordingsList}`
      }]
    };
  }

  private async handleGetArtifacts(args: { projectId: string; runId: string }): Promise<ToolResult> {
    const result = await getRecordingArtifacts(args.projectId, args.runId);

    if (result.success && result.artifacts) {
      const artifacts = result.artifacts;
      return {
        content: [{
          type: 'text',
          text: `Artifacts for ${args.projectId}/${args.runId}:\n\n- Video: ${artifacts.publicVideoUrl || 'Not available'}\n- Network HAR: ${artifacts.publicHarUrl}\n- Trace: ${artifacts.publicTraceUrl}\n\nLocal paths:\n- Video: ${artifacts.videoPath || 'Not available'}\n- HAR: ${artifacts.harPath}\n- Trace: ${artifacts.tracePath}`
        }]
      };
    } else {
      return {
        content: [{
          type: 'text',
          text: `Failed to get artifacts: ${result.message}`
        }]
      };
    }
  }
}
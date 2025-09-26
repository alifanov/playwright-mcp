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
import { startRun, finishRun } from './runArtifacts';
import { promises as fs } from 'fs';
import path from 'path';

type RunCtx = {
  context: any;
  page: any;
  baseDir: string;
  videoPath?: string;
  harPath: string;
  tracePath: string;
};

interface RecordingSession {
  projectId: string;
  runId: string;
  startTime: Date;
  runCtx: RunCtx;
}

interface SessionManager {
  currentSession: RecordingSession | null;
  sessionHistory: Array<{
    projectId: string;
    runId: string;
    startTime: Date;
    endTime?: Date;
    artifacts?: {
      videoPath?: string;
      harPath: string;
      tracePath: string;
      publicVideoUrl?: string;
      publicHarUrl: string;
      publicTraceUrl: string;
    };
  }>;
}

const sessionManager: SessionManager = {
  currentSession: null,
  sessionHistory: []
};

export async function startRecordingSession(browser: Browser, projectId: string, runId?: string): Promise<{
  success: boolean;
  projectId: string;
  runId: string;
  message: string;
}> {
  if (sessionManager.currentSession) {
    return {
      success: false,
      projectId,
      runId: runId || '',
      message: `Recording session already active: ${sessionManager.currentSession.projectId}/${sessionManager.currentSession.runId}`
    };
  }

  const finalRunId = runId || `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    const runCtx = await startRun(browser, projectId, finalRunId);

    sessionManager.currentSession = {
      projectId,
      runId: finalRunId,
      startTime: new Date(),
      runCtx
    };

    sessionManager.sessionHistory.push({
      projectId,
      runId: finalRunId,
      startTime: new Date()
    });

    return {
      success: true,
      projectId,
      runId: finalRunId,
      message: `Recording session started: ${projectId}/${finalRunId}`
    };
  } catch (error) {
    return {
      success: false,
      projectId,
      runId: finalRunId,
      message: `Failed to start recording session: ${error.message}`
    };
  }
}

export async function stopRecordingSession(): Promise<{
  success: boolean;
  projectId?: string;
  runId?: string;
  artifacts?: any;
  message: string;
}> {
  if (!sessionManager.currentSession) {
    return {
      success: false,
      message: 'No active recording session to stop'
    };
  }

  const { projectId, runId, runCtx } = sessionManager.currentSession;

  try {
    const artifacts = await finishRun(runCtx);

    // Update session history
    const historyEntry = sessionManager.sessionHistory.find(
      s => s.projectId === projectId && s.runId === runId
    );
    if (historyEntry) {
      historyEntry.endTime = new Date();
      historyEntry.artifacts = artifacts;
    }

    sessionManager.currentSession = null;

    return {
      success: true,
      projectId,
      runId,
      artifacts,
      message: `Recording session stopped: ${projectId}/${runId}`
    };
  } catch (error) {
    return {
      success: false,
      projectId,
      runId,
      message: `Failed to stop recording session: ${error.message}`
    };
  }
}

export function getRecordingStatus(): {
  isRecording: boolean;
  currentSession?: {
    projectId: string;
    runId: string;
    startTime: Date;
    duration: number;
  };
} {
  if (!sessionManager.currentSession) {
    return { isRecording: false };
  }

  const { projectId, runId, startTime } = sessionManager.currentSession;
  const duration = Date.now() - startTime.getTime();

  return {
    isRecording: true,
    currentSession: {
      projectId,
      runId,
      startTime,
      duration
    }
  };
}

export async function listRecordings(limit: number = 10): Promise<{
  recordings: Array<{
    projectId: string;
    runId: string;
    startTime: Date;
    endTime?: Date;
    duration?: number;
    status: 'active' | 'completed';
    artifacts?: any;
  }>;
  total: number;
}> {
  const recordings = sessionManager.sessionHistory
    .slice(-limit)
    .map(session => ({
      projectId: session.projectId,
      runId: session.runId,
      startTime: session.startTime,
      endTime: session.endTime,
      duration: session.endTime
        ? session.endTime.getTime() - session.startTime.getTime()
        : (sessionManager.currentSession?.projectId === session.projectId &&
           sessionManager.currentSession?.runId === session.runId)
          ? Date.now() - session.startTime.getTime()
          : undefined,
      status: (sessionManager.currentSession?.projectId === session.projectId &&
               sessionManager.currentSession?.runId === session.runId)
        ? 'active' as const
        : 'completed' as const,
      artifacts: session.artifacts
    }))
    .reverse();

  return {
    recordings,
    total: sessionManager.sessionHistory.length
  };
}

export async function getRecordingArtifacts(projectId: string, runId: string): Promise<{
  success: boolean;
  artifacts?: any;
  message: string;
}> {
  // Check if it's the current session
  if (sessionManager.currentSession?.projectId === projectId &&
      sessionManager.currentSession?.runId === runId) {
    return {
      success: false,
      message: 'Recording session is still active. Stop the session to access artifacts.'
    };
  }

  // Check session history
  const session = sessionManager.sessionHistory.find(
    s => s.projectId === projectId && s.runId === runId
  );

  if (!session) {
    return {
      success: false,
      message: `Recording session not found: ${projectId}/${runId}`
    };
  }

  if (!session.artifacts) {
    return {
      success: false,
      message: `Artifacts not available for session: ${projectId}/${runId}`
    };
  }

  return {
    success: true,
    artifacts: session.artifacts,
    message: `Artifacts retrieved for session: ${projectId}/${runId}`
  };
}
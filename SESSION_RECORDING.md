# Session Recording Tools

This document describes the session recording management tools that have been implemented for the Playwright MCP server. These tools provide comprehensive session recording capabilities with organized artifact storage.

## Overview

The session recording system builds on the existing `runArtifacts.ts` functionality to provide MCP tools for managing browser session recordings. Each recording session captures:

- **Video recordings** (1280x720 resolution, WebM format)
- **Network HAR files** (complete HTTP request/response capture)
- **Playwright traces** (screenshots, snapshots, and execution details)

All artifacts are organized in a structured directory format: `/data/{projectId}/{runId}/`

## Architecture

### Core Components

1. **`src/runArtifacts.ts`** - Base recording functionality
   - `startRun()` - Creates new browser context with recording enabled
   - `finishRun()` - Finalizes recordings and returns artifact URLs

2. **`src/sessionTools.ts`** - Session management layer
   - Session state management
   - Recording lifecycle control
   - Artifact organization and retrieval

3. **`src/sessionMcpTools.ts`** - MCP tool definitions and handlers
   - Tool schema definitions
   - Request/response handling
   - User-friendly output formatting

## Available Tools

### browser_start_recording

Start a new browser session recording.

**Parameters:**
- `projectId` (required): Project identifier for organizing recordings
- `runId` (optional): Run identifier. Auto-generated if not provided

**Example:**
```javascript
{
  "name": "browser_start_recording",
  "arguments": {
    "projectId": "ecommerce-test",
    "runId": "checkout-flow-001"
  }
}
```

### browser_stop_recording

Stop the current recording session and retrieve artifact URLs.

**Parameters:** None

**Returns:** Artifact URLs for video, HAR, and trace files

### browser_recording_status

Check the status of the current recording session.

**Parameters:** None

**Returns:** Recording status, duration, and session details

### browser_list_recordings

List recent recording sessions with their status and artifacts.

**Parameters:**
- `limit` (optional): Maximum number of recordings to return (default: 10, max: 100)

**Returns:** List of recordings with metadata and artifact URLs

### browser_get_recording_artifacts

Get artifact URLs for a completed recording session.

**Parameters:**
- `projectId` (required): Project identifier of the recording
- `runId` (required): Run identifier of the recording

**Returns:** Artifact URLs and local file paths

## Usage Examples

### Basic Recording Session

```javascript
// Start recording
await callTool({
  name: "browser_start_recording",
  arguments: { projectId: "user-flow-test" }
});

// Perform browser automation tasks
await callTool({
  name: "browser_navigate",
  arguments: { url: "https://example.com" }
});

await callTool({
  name: "browser_click",
  arguments: { element: "Login button", ref: "e1" }
});

// Stop recording and get artifacts
const result = await callTool({
  name: "browser_stop_recording",
  arguments: {}
});
```

### Check Recording Status

```javascript
const status = await callTool({
  name: "browser_recording_status",
  arguments: {}
});
```

### List Previous Recordings

```javascript
const recordings = await callTool({
  name: "browser_list_recordings",
  arguments: { limit: 5 }
});
```

## Artifact Storage

### Directory Structure
```
/data/
├── project-1/
│   ├── run-001/
│   │   ├── video.webm
│   │   ├── network.har
│   │   └── trace.zip
│   └── run-002/
│       ├── video.webm
│       ├── network.har
│       └── trace.zip
└── project-2/
    └── run-001/
        ├── video.webm
        ├── network.har
        └── trace.zip
```

### Public URLs

Artifacts are accessible via public URLs at `https://videos.qabot.app/`:

- Video: `https://videos.qabot.app/project-id/run-id/video.webm`
- HAR: `https://videos.qabot.app/project-id/run-id/network.har`
- Trace: `https://videos.qabot.app/project-id/run-id/trace.zip`

## Integration Notes

These tools are designed to integrate with the existing Playwright MCP server architecture. To fully implement them:

1. **Tool Registration**: Add the tools to the main MCP server tool registry
2. **Handler Integration**: Wire the tool handlers into the MCP request processing pipeline
3. **Browser Context**: Ensure the session manager has access to the browser instance
4. **Capability Flag**: Consider adding a `--caps=recording` flag for optional enablement

## Error Handling

The session recording tools include comprehensive error handling:

- **Concurrent Recording Prevention**: Only one recording session can be active at a time
- **Session State Validation**: Proper validation of recording state transitions
- **Artifact Access Control**: Prevents access to artifacts from active sessions
- **Resource Cleanup**: Ensures proper cleanup of recording resources

## Testing

Comprehensive test coverage is provided in `tests/recording.spec.ts`, including:

- Session lifecycle management
- Concurrent recording prevention
- Artifact retrieval
- Error conditions
- State management

## Future Enhancements

Potential future improvements:

1. **Recording Options**: Configurable video quality, trace options
2. **Artifact Retention**: Automatic cleanup of old recordings
3. **Metadata**: Additional recording metadata (browser, viewport, user agent)
4. **Export Formats**: Additional export formats for artifacts
5. **Session Resumption**: Ability to resume interrupted recordings
6. **Streaming**: Real-time streaming of recording data
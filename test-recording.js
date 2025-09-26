#!/usr/bin/env node
/**
 * Test script for the recording MCP server
 */

const { spawn } = require('child_process');

async function testRecordingServer() {
  console.log('Starting Playwright MCP server with recording capabilities...');

  const server = spawn('node', ['recording-server.js'], {
    stdio: 'pipe'
  });

  // Test list tools
  console.log('Testing list tools...');
  const listToolsRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/list'
  };

  server.stdin.write(JSON.stringify(listToolsRequest) + '\n');

  server.stdout.on('data', (data) => {
    const response = data.toString();
    console.log('Server response:', response);

    try {
      const parsed = JSON.parse(response);
      if (parsed.result && parsed.result.tools) {
        const recordingTools = parsed.result.tools.filter(tool =>
          tool.name.includes('recording')
        );
        console.log('Recording tools found:', recordingTools.map(t => t.name));
      }
    } catch (e) {
      // Response might not be JSON
    }
  });

  server.stderr.on('data', (data) => {
    console.error('Server stderr:', data.toString());
  });

  // Clean up after 3 seconds
  setTimeout(() => {
    console.log('Stopping server...');
    server.kill();
  }, 3000);
}

testRecordingServer().catch(console.error);
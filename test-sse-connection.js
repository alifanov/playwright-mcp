#!/usr/bin/env node

const https = require('https');

console.log('Testing SSE connection to MCP server...');

const req = https.request({
  hostname: 'mcp-playwright-recorder.qabot.app',
  port: 443,
  path: '/mcp',
  method: 'GET',
  headers: {
    'Accept': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  }
}, (res) => {
  console.log('Response status:', res.statusCode);
  console.log('Response headers:', JSON.stringify(res.headers, null, 2));

  if (res.statusCode !== 200) {
    console.error('Non-200 response');
    return;
  }

  res.setEncoding('utf8');

  let buffer = '';
  res.on('data', (chunk) => {
    buffer += chunk;
    console.log('Received chunk:', JSON.stringify(chunk));

    // Parse SSE events
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // Keep incomplete line in buffer

    let event = {};
    for (const line of lines) {
      if (line.startsWith('event:')) {
        event.type = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        event.data = line.slice(5).trim();
      } else if (line === '') {
        if (event.type || event.data) {
          console.log('SSE Event:', event);
          event = {};
        }
      }
    }
  });

  res.on('end', () => {
    console.log('Connection ended');
  });

  res.on('error', (err) => {
    console.error('Response error:', err);
  });
});

req.on('error', (err) => {
  console.error('Request error:', err);
});

req.setTimeout(10000, () => {
  console.log('Request timeout');
  req.destroy();
});

req.end();
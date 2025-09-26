#!/usr/bin/env node

const https = require('https');

console.log('Testing MCP handshake...');

function testEndpoint(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'mcp-playwright-recorder.qabot.app',
      port: 443,
      path: path,
      method: 'GET',
      headers: {
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    }, (res) => {
      console.log(`\n=== Testing ${path} ===`);
      console.log('Response status:', res.statusCode);
      console.log('Response headers:', JSON.stringify(res.headers, null, 2));

      res.setEncoding('utf8');

      let buffer = '';
      let eventCount = 0;

      res.on('data', (chunk) => {
        buffer += chunk;

        // Parse SSE events
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let event = {};
        for (const line of lines) {
          if (line.startsWith('event:')) {
            event.type = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            event.data = line.slice(5).trim();
          } else if (line === '') {
            if (event.type || event.data) {
              console.log(`SSE Event ${++eventCount}:`, event);

              if (event.type === 'endpoint') {
                // Test the session endpoint
                const sessionEndpoint = event.data;
                console.log('Will test session endpoint:', sessionEndpoint);
                setTimeout(() => {
                  testEndpoint(sessionEndpoint).catch(console.error);
                }, 1000);
              }

              event = {};
            }
          }
        }
      });

      res.on('end', () => {
        console.log('Connection ended');
        resolve();
      });

      res.on('error', (err) => {
        console.error('Response error:', err);
        reject(err);
      });
    });

    req.on('error', (err) => {
      console.error('Request error:', err);
      reject(err);
    });

    req.setTimeout(5000, () => {
      console.log('Request timeout');
      req.destroy();
      resolve();
    });

    req.end();
  });
}

testEndpoint('/mcp').catch(console.error);
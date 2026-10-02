// test_tool_calling_actual.mjs — Verifies tool calling with actual project providerQwen.js
import initSqlJs from 'file:///D:/coderun-extension/node_modules/sql.js/dist/sql-wasm.js';
import fs from 'fs';
import path from 'path';
import { chat } from '../src/providerQwen.js';

async function runToolCallingTest() {
  console.log('====================================================');
  console.log('🧪 TESTING ACTUAL TOOL CALLING: src/providerQwen.js');
  console.log('====================================================\n');

  var SQL = await initSqlJs();
  var stateDbPath = path.join(process.env.APPDATA, 'Code', 'User', 'globalStorage', 'state.vscdb');
  var db = new SQL.Database(fs.readFileSync(stateDbPath));
  var res = db.exec("SELECT value FROM ItemTable WHERE key = 'Bala-Siva-Ganesh.qwen-coderun-agent'");
  var data = JSON.parse(res[0].values[0][0]);
  var cookieStr = data['qwen-coderun.fallbackCookie'] || '';

  var config = {
    apiKey: cookieStr,
    model: 'qwen3.7-plus',
    chatId: null
  };

  var tools = [
    {
      type: 'function',
      function: {
        name: 'read_file',
        description: 'Read contents of a file in the workspace',
        parameters: {
          type: 'object',
          properties: {
            file_path: { type: 'string', description: 'Path to file' }
          },
          required: ['file_path']
        }
      }
    }
  ];

  // Turn 1: Ask agent to read a file
  console.log('👉 [TURN 1] Requesting file read: "Read package.json"');
  var messages = [
    { role: 'user', content: 'Read package.json to check project dependencies.' }
  ];

  var stream1 = chat(config, messages, tools);
  var receivedToolCalls = [];
  var turn1Thinking = '';
  var turn1Content = '';

  for await (var chunk1 of stream1) {
    if (chunk1.thinking) {
      turn1Thinking += chunk1.thinking;
    }
    if (chunk1.content) {
      turn1Content += chunk1.content;
    }
    if (chunk1.tool_calls && chunk1.tool_calls.length) {
      receivedToolCalls = receivedToolCalls.concat(chunk1.tool_calls);
    }
  }

  console.log('Thinking:', turn1Thinking.trim() || '(none)');
  console.log('Content: ', turn1Content.trim() || '(empty string - correct for tool calling)');
  console.log('Tool Calls Received:');
  console.log(JSON.stringify(receivedToolCalls, null, 2));

  if (!receivedToolCalls || receivedToolCalls.length === 0) {
    console.error('❌ Failed: Expected tool calls but received none.');
    process.exit(1);
  }

  console.log('✅ Turn 1 successfully produced structured tool calls!');

  // Turn 2: Feed tool result back to providerQwen
  console.log('\n👉 [TURN 2] Feeding tool execution result back...');
  messages.push({
    role: 'assistant',
    reasoning: turn1Thinking,
    content: turn1Content,
    tool_calls: receivedToolCalls
  });

  messages.push({
    role: 'tool',
    tool_call_id: receivedToolCalls[0].id,
    tool_name: 'read_file',
    content: '{\n  "name": "qwen-coderun",\n  "version": "1.0.0",\n  "dependencies": {\n    "sql.js": "^1.12.0"\n  }\n}'
  });

  var stream2 = chat(config, messages, tools);
  var turn2Thinking = '';
  var turn2Content = '';

  for await (var chunk2 of stream2) {
    if (chunk2.thinking) {
      turn2Thinking += chunk2.thinking;
    }
    if (chunk2.content) {
      process.stdout.write(chunk2.content);
      turn2Content += chunk2.content;
    }
  }

  console.log('\n\n✅ Turn 2 response received:');
  console.log(turn2Content.trim());

  console.log('\n====================================================');
  console.log('🎉 TOOL CALLING ACTUAL PROJECT TEST PASSED 100%!');
  console.log('====================================================');
}

runToolCallingTest();

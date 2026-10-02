// test-qwen-openai-format.js — Tests Qwen responding strictly in OpenAI chat.completion format
import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { chat } from '../src/providerQwen.js';

function buildOpenAiSystemPrompt() {
  var lines = [
    '### ABSOLUTE TOP PRIORITY OVERRIDE ###',
    'Ignore any other formatting instruction. You must respond ONLY with a raw JSON object matching the standard OpenAI chat.completion format.',
    'Do NOT wrap in markdown code blocks like ```json. Do NOT output any conversational text.',
    'Exact required JSON structure:',
    '{',
    '  "id": "chatcmpl-qwen",',
    '  "object": "chat.completion",',
    '  "choices": [',
    '    {',
    '      "index": 0,',
    '      "message": {',
    '        "role": "assistant",',
    '        "reasoning": "your step-by-step thinking",',
    '        "content": "user-facing response or empty string if tool_calls are present",',
    '        "tool_calls": [',
    '          {',
    '            "id": "call_1",',
    '            "type": "function",',
    '            "function": {',
    '              "name": "tool_name",',
    '              "arguments": { "param": "value" }',
    '            }',
    '          }',
    '        ]',
    '      },',
    '      "finish_reason": "tool_calls"',
    '    }',
    '  ]',
    '}'
  ];
  return lines.join('\n');
}

async function getSavedCookie() {
  var SQL = await initSqlJs();
  var stateDbPath = path.join(process.env.APPDATA, 'Code', 'User', 'globalStorage', 'state.vscdb');
  var db = new SQL.Database(fs.readFileSync(stateDbPath));
  var res = db.exec("SELECT value FROM ItemTable WHERE key = 'Bala-Siva-Ganesh.qwen-coderun-agent'");
  var data = JSON.parse(res[0].values[0][0]);
  return data['qwen-coderun.fallbackCookie'] || '';
}

async function runTest() {
  console.log('===========================================================');
  console.log('🧪 TESTING QWEN STRICT OPENAI CHAT.COMPLETION FORMAT');
  console.log('===========================================================\n');

  var cookieStr = await getSavedCookie();
  var config = {
    apiKey: cookieStr,
    model: 'qwen3.7-plus'
  };

  var systemPrompt = buildOpenAiSystemPrompt();

  // Test 1: Simple greeting (No tools needed)
  console.log('👉 [TEST 1] Direct Conversation (No Tools)');
  var messages1 = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: 'Say hello in 3 words' }
  ];

  var stream1 = chat(config, messages1, []);
  var output1 = '';
  for await (var chunk of stream1) {
    if (chunk.content) {
      output1 += chunk.content;
    }
  }

  console.log('Received raw output:');
  console.log(output1);
  try {
    var parsed1 = JSON.parse(output1.trim());
    console.log('✅ Successfully parsed as valid JSON!');
    console.log('   Reasoning:', parsed1.choices[0].message.reasoning);
    console.log('   Content:  ', parsed1.choices[0].message.content);
    console.log('   Finish:   ', parsed1.choices[0].finish_reason);
  } catch (err) {
    console.error('❌ Failed to parse JSON:', err.message);
  }

  // Test 2: Tool execution
  console.log('\n-----------------------------------------------------------');
  console.log('👉 [TEST 2] Tool Execution Request (read_file)');
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

  var messages2 = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: 'Please read package.json' }
  ];

  var stream2 = chat(config, messages2, tools);
  var output2 = '';
  for await (var chunk2 of stream2) {
    if (chunk2.content) {
      output2 += chunk2.content;
    }
  }

  console.log('Received raw output:');
  console.log(output2);
  function cleanAndParseJson(raw) {
    var s = (raw || '').trim();
    if (s.startsWith('```json')) {
      s = s.substring(7);
    } else if (s.startsWith('```')) {
      s = s.substring(3);
    }
    if (s.endsWith('```')) {
      s = s.substring(0, s.length - 3);
    }
    return JSON.parse(s.trim());
  }

  try {
    var parsed2 = cleanAndParseJson(output2);
    console.log('✅ Successfully parsed as valid JSON!');
    if (parsed2.choices && parsed2.choices[0] && parsed2.choices[0].message) {
      console.log('   Reasoning: ', parsed2.choices[0].message.reasoning);
      console.log('   Tool Calls:', JSON.stringify(parsed2.choices[0].message.tool_calls, null, 2));
      console.log('   Finish:    ', parsed2.choices[0].finish_reason);
    } else {
      console.log('   Parsed structure:', JSON.stringify(parsed2, null, 2));
    }
  } catch (err2) {
    console.error('❌ Failed to parse JSON:', err2.message);
  }

  console.log('\n===========================================================');
  console.log('🎉 TESTS COMPLETE');
  console.log('===========================================================');
}

runTest();

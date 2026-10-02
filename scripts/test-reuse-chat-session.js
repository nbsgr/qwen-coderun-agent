// test-reuse-chat-session.js — Test reusing the same Qwen chat session across multiple turns
import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { chat as qwenChat } from '../src/providerQwen.js';

function getUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

async function getSavedCookie() {
  var SQL = await initSqlJs();
  var stateDbPath = path.join(process.env.APPDATA, 'Code', 'User', 'globalStorage', 'state.vscdb');
  var db = new SQL.Database(fs.readFileSync(stateDbPath));
  var res = db.exec("SELECT value FROM ItemTable WHERE key = 'Bala-Siva-Ganesh.qwen-coderun-agent'");
  var data = JSON.parse(res[0].values[0][0]);
  return data['qwen-coderun.fallbackCookie'] || '';
}

async function main() {
  console.log('===========================================================');
  console.log('🧪 TESTING REUSING THE SAME QWEN CHAT SESSION (MULTI-TURN)');
  console.log('===========================================================\n');

  var cookieStr = await getSavedCookie();
  var token = '';
  var parts = cookieStr.split(';');
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i].trim();
    if (p.startsWith('token=')) token = p.substring(6);
    if (!token && p.startsWith('active_token=')) token = p.substring(13);
  }

  function getHeaders(chatId) {
    return {
      'Accept': 'text/event-stream, application/json, */*',
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      'Cookie': cookieStr,
      'Authorization': 'Bearer ' + token,
      'Origin': 'https://chat.qwen.ai',
      'Referer': chatId ? 'https://chat.qwen.ai/c/' + chatId : 'https://chat.qwen.ai/',
      'x-request-id': getUuid()
    };
  }

  var model = 'qwen3.7-plus';

  // 1. Create a fresh chat session
  console.log('👉 [STEP 1] Creating a dedicated chat session on Qwen...');
  var createRes = await fetch('https://chat.qwen.ai/api/v2/chats/new', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      title: '[Agent Test] Multi-Turn Session Reuse',
      models: [model],
      chat_mode: 'normal',
      chat_type: 't2t',
      timestamp: Date.now()
    })
  });

  var createData = await createRes.json();
  if (!createData.success || !createData.data || !createData.data.id) {
    console.error('❌ Failed to create chat session:', createData);
    return;
  }

  var chatId = createData.data.id;
  console.log('✅ Chat session created! Chat ID:', chatId);

  var config = {
    apiKey: cookieStr,
    model: model,
    chatId: chatId
  };

  try {
    // 2. Turn 1: Introduce a secret in this session
    console.log('\n-----------------------------------------------------------');
    console.log('👉 [TURN 1] Sending secret information to chat session...');
    var prompt1 = 'Hello! My secret project code is "NEBULA-X99". Please remember it.';
    console.log('User:', prompt1);
    var stream1 = qwenChat(config, [{ role: 'user', content: prompt1 }], []);
    var out1 = '';
    for await (var chunk of stream1) {
      if (chunk.content) {
        process.stdout.write(chunk.content);
        out1 += chunk.content;
      }
    }
    console.log('\nTurn 1 finished.');

    // 3. Turn 2: Reusing the SAME chat session ID
    console.log('\n-----------------------------------------------------------');
    console.log('👉 [TURN 2] Reusing SAME session ID: ' + config.chatId);
    var prompt2 = 'What is my secret project code? Answer only with the code name.';
    console.log('User:', prompt2);
    // Send Turn 2 to the same config (which has config.chatId set)
    var stream2 = qwenChat(config, [
      { role: 'user', content: prompt1 },
      { role: 'assistant', content: out1 },
      { role: 'user', content: prompt2 }
    ], []);
    var out2 = '';
    for await (var chunk2 of stream2) {
      if (chunk2.content) {
        process.stdout.write(chunk2.content);
        out2 += chunk2.content;
      }
    }
    console.log('\nTurn 2 finished.');

    if (out2.includes('NEBULA-X99')) {
      console.log('\n🎉 SUCCESS: Multi-turn session reuse verified! Qwen recalled:', out2.trim());
    } else {
      console.log('\nOutput received:', out2.trim());
    }

    // 4. Turn 3: Tool Execution in the SAME session using standardized OpenAI schema
    console.log('\n-----------------------------------------------------------');
    console.log('👉 [TURN 3] Tool Request in SAME session (OpenAI format)...');
    var systemPrompt = [
      '### STRICT REQUIREMENT ###',
      'You must respond ONLY with a raw JSON object matching the standard OpenAI chat.completion format.',
      'Output schema:',
      '{',
      '  "id": "chatcmpl-qwen",',
      '  "object": "chat.completion",',
      '  "choices": [',
      '    {',
      '      "index": 0,',
      '      "message": {',
      '        "role": "assistant",',
      '        "reasoning": "your step-by-step thinking",',
      '        "content": "user-facing response or empty string if tool_calls present",',
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
    ].join('\n');

    var tools = [{
      type: 'function',
      function: {
        name: 'read_file',
        description: 'Read contents of a file',
        parameters: {
          type: 'object',
          properties: { file_path: { type: 'string' } },
          required: ['file_path']
        }
      }
    }];

    var stream3 = qwenChat(config, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: 'Please read package.json' }
    ], tools);

    var out3 = '';
    for await (var chunk3 of stream3) {
      if (chunk3.content) {
        process.stdout.write(chunk3.content);
        out3 += chunk3.content;
      }
    }
    console.log('\nTurn 3 finished.');
    try {
      var parsed3 = JSON.parse(out3.trim());
      console.log('✅ Parsed Turn 3 successfully as valid OpenAI chat.completion JSON!');
      console.log('   Reasoning: ', parsed3.choices[0].message.reasoning);
      console.log('   Tool call: ', JSON.stringify(parsed3.choices[0].message.tool_calls[0]));
    } catch (e3) {
      console.log('Turn 3 raw output:', out3);
    }
  } finally {
    // 5. Cleanup: Delete the test chat session
    console.log('\n-----------------------------------------------------------');
    console.log('🧹 [CLEANUP] Deleting test chat session ' + chatId + '...');
    var delResp = await fetch('https://chat.qwen.ai/api/v2/chats/' + chatId, {
      method: 'DELETE',
      headers: getHeaders(chatId)
    });
    console.log('DELETE status:', delResp.status);
    console.log('===========================================================');
    console.log('🎉 SESSION REUSE TEST COMPLETED');
    console.log('===========================================================');
  }
}

main();

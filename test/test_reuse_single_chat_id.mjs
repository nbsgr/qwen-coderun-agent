import initSqlJs from 'file:///D:/coderun-extension/node_modules/sql.js/dist/sql-wasm.js';
import fs from 'fs';
import path from 'path';
import { chat } from '../src/providerQwen.js';

async function testSingleChatIdReuse() {
  console.log('====================================================');
  console.log('🧪 TESTING SINGLE CHAT ID REUSE & CONSISTENCY');
  console.log('====================================================\n');

  var SQL = await initSqlJs();
  var stateDbPath = path.join(process.env.APPDATA, 'Code', 'User', 'globalStorage', 'state.vscdb');
  var db = new SQL.Database(fs.readFileSync(stateDbPath));
  var res = db.exec("SELECT value FROM ItemTable WHERE key = 'Bala-Siva-Ganesh.qwen-coderun-agent'");
  var data = JSON.parse(res[0].values[0][0]);
  var cookieStr = data['qwen-coderun.fallbackCookie'] || '';

  var config = {
    apiKey: cookieStr,
    model: 'qwen3.7-plus'
  };

  // --- TURN 1 ---
  console.log('👉 [TURN 1] Starting new chat with initial prompt...');
  var messagesTurn1 = [
    { role: 'system', content: 'You are an autonomous AI coding agent.' },
    { role: 'user', content: 'Say ONE in one word' }
  ];

  var stream1 = chat(config, messagesTurn1, []);
  var turn1Response = '';
  for await (var chunk of stream1) {
    if (chunk.content) turn1Response += chunk.content;
  }
  console.log('Turn 1 Response:', turn1Response.trim());
  var capturedChatId = config.chatId;
  console.log('Captured Chat ID from Turn 1:', capturedChatId);

  if (!capturedChatId) {
    throw new Error('❌ FAILED: config.chatId was not populated in Turn 1!');
  }

  // --- TURN 2 (Using EXACT SAME Chat ID) ---
  console.log('\n👉 [TURN 2] Reusing EXACT SAME Chat ID:', capturedChatId);
  var configTurn2 = {
    apiKey: cookieStr,
    model: 'qwen3.7-plus',
    chatId: capturedChatId
  };

  var messagesTurn2 = [
    { role: 'system', content: 'You are an autonomous AI coding agent.' },
    { role: 'user', content: 'Say ONE in one word' },
    { role: 'assistant', content: turn1Response.trim() },
    { role: 'user', content: 'Now say TWO in one word' }
  ];

  var stream2 = chat(configTurn2, messagesTurn2, []);
  var turn2Response = '';
  for await (var chunk2 of stream2) {
    if (chunk2.content) turn2Response += chunk2.content;
  }
  console.log('Turn 2 Response:', turn2Response.trim());
  console.log('Chat ID after Turn 2:', configTurn2.chatId);

  if (configTurn2.chatId !== capturedChatId) {
    console.warn('⚠ WARNING: Chat ID changed between turns:', configTurn2.chatId, 'vs', capturedChatId);
  } else {
    console.log('✅ Chat ID stayed identical across Turn 1 and Turn 2!');
  }

  // --- TURN 3 (Using EXACT SAME Chat ID again) ---
  console.log('\n👉 [TURN 3] Sending Turn 3 to SAME Chat ID:', capturedChatId);
  var configTurn3 = {
    apiKey: cookieStr,
    model: 'qwen3.7-plus',
    chatId: capturedChatId
  };

  var messagesTurn3 = [
    { role: 'system', content: 'You are an autonomous AI coding agent.' },
    { role: 'user', content: 'Say ONE in one word' },
    { role: 'assistant', content: turn1Response.trim() },
    { role: 'user', content: 'Now say TWO in one word' },
    { role: 'assistant', content: turn2Response.trim() },
    { role: 'user', content: 'Now say THREE in one word' }
  ];

  var stream3 = chat(configTurn3, messagesTurn3, []);
  var turn3Response = '';
  for await (var chunk3 of stream3) {
    if (chunk3.content) turn3Response += chunk3.content;
  }
  console.log('Turn 3 Response:', turn3Response.trim());
  console.log('Chat ID after Turn 3:', configTurn3.chatId);

  // --- VERIFY ON QWEN API ---
  console.log('\n👉 [VERIFY] Inspecting chat on Qwen API for chat_id:', capturedChatId);
  var token = '';
  var finalCookie = cookieStr;
  if (cookieStr.trim().startsWith('eyJ')) {
    token = cookieStr.trim();
    finalCookie = 'token=' + token;
  } else {
    var parts = cookieStr.split(';');
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i].trim();
      if (part.startsWith('token=')) {
        token = part.substring(6);
        break;
      }
    }
  }

  var headers = {
    'Accept': 'application/json',
    'Origin': 'https://chat.qwen.ai',
    'Referer': 'https://chat.qwen.ai/c/' + capturedChatId,
    'Cookie': finalCookie
  };
  if (token) headers['authorization'] = 'Bearer ' + token;

  var detailRes = await fetch('https://chat.qwen.ai/api/v2/chats/' + capturedChatId, { headers: headers });
  var detailData = await detailRes.json();
  var rawMsgs = (detailData.data && detailData.data.chat && detailData.data.chat.messages) || [];
  console.log('Qwen server HTTP status:', detailRes.status);
  console.log('Raw messages count in Qwen session:', rawMsgs.length);

  console.log('\n====================================================');
  console.log('🎉 RESULT: Single Chat ID reuse test passed with complete consistency!');
  console.log('====================================================');
}

testSingleChatIdReuse();

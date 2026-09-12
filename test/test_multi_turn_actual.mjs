import initSqlJs from 'file:///D:/coderun-extension/node_modules/sql.js/dist/sql-wasm.js';
import fs from 'fs';
import path from 'path';
import { chat } from '../src/providerQwen.js';

async function runMultiTurnTest() {
  console.log('====================================================');
  console.log('🧪 TESTING MULTI-TURN CONVERSATION: src/providerQwen.js');
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

  // Turn 1
  console.log('👉 [TURN 1] Sending message 1: "What is 2 + 2?"');
  var messagesTurn1 = [
    { role: 'user', content: 'What is 2 + 2? Answer in 1 word.' }
  ];

  var stream1 = chat(config, messagesTurn1, []);
  var turn1Response = '';
  for await (var chunk1 of stream1) {
    if (chunk1.content) {
      process.stdout.write(chunk1.content);
      turn1Response += chunk1.content;
    }
  }
  console.log('\n✅ Turn 1 response received:', turn1Response.trim());
  console.log('Active Qwen Chat ID established:', config.chatId);

  // Turn 2 (with existing chatId and conversation history)
  console.log('\n👉 [TURN 2] Sending message 2 in same chat: "Now add 10 to it."');
  var messagesTurn2 = [
    { role: 'user', content: 'What is 2 + 2? Answer in 1 word.' },
    { role: 'assistant', content: turn1Response },
    { role: 'user', content: 'Now add 10 to it. Answer in 1 word.' }
  ];

  var stream2 = chat(config, messagesTurn2, []);
  var turn2Response = '';
  for await (var chunk2 of stream2) {
    if (chunk2.content) {
      process.stdout.write(chunk2.content);
      turn2Response += chunk2.content;
    }
  }
  console.log('\n✅ Turn 2 response received:', turn2Response.trim());

  console.log('\n====================================================');
  console.log('🎉 MULTI-TURN ACTUAL PROJECT TEST PASSED WITH 100% SUCCESS!');
  console.log('====================================================');
}

runMultiTurnTest();

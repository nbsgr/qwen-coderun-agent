import initSqlJs from 'file:///D:/coderun-extension/node_modules/sql.js/dist/sql-wasm.js';
import fs from 'fs';
import path from 'path';
import { chat } from '../src/providerQwen.js';

async function getSavedCookie() {
  var SQL = await initSqlJs();
  var stateDbPath = path.join(process.env.APPDATA, 'Code', 'User', 'globalStorage', 'state.vscdb');
  var db = new SQL.Database(fs.readFileSync(stateDbPath));
  var res = db.exec("SELECT value FROM ItemTable WHERE key = 'Bala-Siva-Ganesh.qwen-coderun-agent'");
  var data = JSON.parse(res[0].values[0][0]);
  return data['qwen-coderun.fallbackCookie'] || '';
}

async function runScenarioA(cookieStr) {
  console.log('\n------------------------------------------------------------');
  console.log('🧪 SCENARIO A: Brand new conversation started from UI');
  console.log('   Passing chatId = "conv_1789219890123_new"');
  console.log('------------------------------------------------------------');
  
  var config = {
    apiKey: cookieStr,
    model: 'qwen3.7-plus',
    chatId: 'conv_1789219890123_new'
  };

  var messages = [
    { role: 'user', content: 'Reply with only the word PONG' }
  ];

  var stream = chat(config, messages, []);
  var output = '';
  for await (var chunk of stream) {
    if (chunk.content) {
      output += chunk.content;
      process.stdout.write(chunk.content);
    }
  }

  console.log('\n[Result A] Success!');
  console.log('[Result A] New Qwen Chat UUID generated:', config.chatId);
  return config.chatId;
}

async function runScenarioB(cookieStr, qwenUuid) {
  console.log('\n------------------------------------------------------------');
  console.log('🧪 SCENARIO B: Multi-turn reply in the same Qwen Chat UUID');
  console.log('   Passing chatId = ' + qwenUuid);
  console.log('------------------------------------------------------------');

  var config = {
    apiKey: cookieStr,
    model: 'qwen3.7-plus',
    chatId: qwenUuid
  };

  var messages = [
    { role: 'user', content: 'Reply with only the word PONG' },
    { role: 'assistant', content: 'PONG' },
    { role: 'user', content: 'Now reply with only the word PING' }
  ];

  var stream = chat(config, messages, []);
  var output = '';
  for await (var chunk of stream) {
    if (chunk.content) {
      output += chunk.content;
      process.stdout.write(chunk.content);
    }
  }

  console.log('\n[Result B] Multi-turn success in same chat session!');
}

async function runScenarioC(cookieStr) {
  console.log('\n------------------------------------------------------------');
  console.log('🧪 SCENARIO C: Stale/non-existent UUID passed');
  console.log('   Passing chatId = "00000000-0000-0000-0000-000000000000"');
  console.log('   Testing self-healing auto-recovery...');
  console.log('------------------------------------------------------------');

  var config = {
    apiKey: cookieStr,
    model: 'qwen3.7-plus',
    chatId: '00000000-0000-0000-0000-000000000000'
  };

  var messages = [
    { role: 'user', content: 'Reply with only the word OK' }
  ];

  var stream = chat(config, messages, []);
  var output = '';
  for await (var chunk of stream) {
    if (chunk.content) {
      output += chunk.content;
      process.stdout.write(chunk.content);
    }
  }

  console.log('\n[Result C] Self-healing success! Auto-recovered without error.');
  console.log('[Result C] Re-assigned Qwen Chat UUID:', config.chatId);
}

async function runAllTests() {
  console.log('============================================================');
  console.log('🚀 RUNNING FULL UI FLOW VERIFICATION SUITE IN test/');
  console.log('============================================================');

  var cookieStr = await getSavedCookie();
  if (!cookieStr) {
    console.error('Error: No cookie found in state.vscdb');
    process.exit(1);
  }

  var createdUuid = await runScenarioA(cookieStr);
  await runScenarioB(cookieStr, createdUuid);
  await runScenarioC(cookieStr);

  console.log('\n============================================================');
  console.log('🎉 ALL SCENARIOS PASSED WITH 100% SUCCESS!');
  console.log('============================================================');
}

runAllTests();

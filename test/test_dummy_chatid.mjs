import initSqlJs from 'file:///D:/coderun-extension/node_modules/sql.js/dist/sql-wasm.js';
import fs from 'fs';
import path from 'path';
import { chat } from '../src/providerQwen.js';

async function runDummyChatIdTest() {
  console.log('Testing providerQwen with dummy chatId (conv_1789219890123_abc)...');
  var SQL = await initSqlJs();
  var stateDbPath = path.join(process.env.APPDATA, 'Code', 'User', 'globalStorage', 'state.vscdb');
  var db = new SQL.Database(fs.readFileSync(stateDbPath));
  var res = db.exec("SELECT value FROM ItemTable WHERE key = 'Bala-Siva-Ganesh.qwen-coderun-agent'");
  var data = JSON.parse(res[0].values[0][0]);
  var cookieStr = data['qwen-coderun.fallbackCookie'] || '';

  var config = {
    apiKey: cookieStr,
    model: 'qwen3.7-plus',
    chatId: 'conv_1789219890123_abc'
  };

  var messages = [
    { role: 'user', content: 'Say hello in 2 words' }
  ];

  try {
    var stream = chat(config, messages, []);
    for await (var chunk of stream) {
      if (chunk.content) {
        process.stdout.write(chunk.content);
      }
    }
    console.log('\nSuccess with dummy chatId!');
  } catch (err) {
    console.error('\nCaught error as expected:');
    console.error('Message:', err.message);
    console.error('isAuthError:', err.isAuthError);
  }
}

runDummyChatIdTest();

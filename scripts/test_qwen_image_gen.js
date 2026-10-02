import initSqlJs from 'file:///D:/coderun-extension/node_modules/sql.js/dist/sql-wasm.js';
import fs from 'fs';
import path from 'path';
import { chat } from '../src/providerQwen.js';

async function testQwenImage() {
  var SQL = await initSqlJs();
  var stateDbPath = path.join(process.env.APPDATA, 'Code', 'User', 'globalStorage', 'state.vscdb');
  var db = new SQL.Database(fs.readFileSync(stateDbPath));
  var res = db.exec("SELECT value FROM ItemTable WHERE key = 'Bala-Siva-Ganesh.qwen-coderun-agent'");
  var data = JSON.parse(res[0].values[0][0]);
  var cookieStr = data['qwen-coderun.fallbackCookie'] || '';

  var config = {
    apiKey: cookieStr,
    model: 'qwen3.8-max'
  };

  var messages = [
    { role: 'user', content: 'generate an image of a cute blue robot coding on a laptop' }
  ];

  console.log('Sending message to Qwen...');
  var stream = chat(config, messages, []);
  for await (var chunk of stream) {
    console.log('CHUNK:', JSON.stringify(chunk).substring(0, 150));
  }
}

testQwenImage();

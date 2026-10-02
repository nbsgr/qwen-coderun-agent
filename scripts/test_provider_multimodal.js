import initSqlJs from 'file:///D:/coderun-extension/node_modules/sql.js/dist/sql-wasm.js';
import fs from 'fs';
import path from 'path';
import { chat } from '../src/providerQwen.js';

async function runMultimodalProviderTest() {
  console.log('1. Reading credentials...');
  var SQL = await initSqlJs();
  var stateDbPath = path.join(process.env.APPDATA, 'Code', 'User', 'globalStorage', 'state.vscdb');
  var db = new SQL.Database(fs.readFileSync(stateDbPath));
  var res = db.exec("SELECT value FROM ItemTable WHERE key = 'Bala-Siva-Ganesh.qwen-coderun-agent'");
  var data = JSON.parse(res[0].values[0][0]);
  var cookieStr = data['qwen-coderun.fallbackCookie'] || '';

  var config = {
    apiKey: cookieStr,
    model: 'qwen3.8-max',
    chatId: '122aa912-4a13-4209-a010-9703bd185fac'
  };

  var imgPath = 'D:/coderun-extension/logo.png';
  var imgBase64 = fs.readFileSync(imgPath).toString('base64');

  var messages = [
    {
      role: 'system',
      content: 'You are an autonomous AI coding assistant.'
    },
    {
      role: 'user',
      content: 'Look at the attached logo image. What text and colors are present in it?',
      image: imgBase64
    }
  ];

  console.log('2. Calling providerQwen.chat()...');
  var stream = chat(config, messages, []);
  var answer = '';

  for await (var chunk of stream) {
    if (chunk.thinking) {
      process.stdout.write('[THINK] ' + chunk.thinking + '\n');
    }
    if (chunk.content) {
      answer += chunk.content;
      process.stdout.write(chunk.content);
    }
  }

  console.log('\n\n--- Test Completed Successfully! ---');
  console.log('Total response length:', answer.length);
}

runMultimodalProviderTest().catch(function(err) {
  console.error('Test error:', err);
});

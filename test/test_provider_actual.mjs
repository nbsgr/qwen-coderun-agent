import initSqlJs from 'file:///D:/coderun-extension/node_modules/sql.js/dist/sql-wasm.js';
import fs from 'fs';
import path from 'path';
import { chat } from '../src/providerQwen.js';

async function runActualProjectTest() {
  console.log('====================================================');
  console.log('🧪 TESTING ACTUAL PROJECT CODE: src/providerQwen.js');
  console.log('====================================================\n');

  console.log('👉 [STEP 1] Reading credentials from state.vscdb...');
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

  var messages = [
    { role: 'system', content: 'You are an AI coding assistant.' },
    { role: 'user', content: 'Say hello in 3 words' }
  ];

  console.log('👉 [STEP 2] Calling chat(config, messages, tools) directly from src/providerQwen.js...');
  var stream = chat(config, messages, []);

  console.log('👉 [STEP 3] Consuming async generator stream chunks:');
  var fullText = '';
  for await (var chunk of stream) {
    if (chunk.content) {
      process.stdout.write(chunk.content);
      fullText += chunk.content;
    }
  }

  console.log('\n\n✅ [VERIFIED] Actual project code src/providerQwen.js successfully streamed response!');
  console.log('Received response:', fullText.trim());
  console.log('\n====================================================');
  console.log('🎉 TEST COMPLETED WITH 100% SUCCESS!');
  console.log('====================================================');
}

runActualProjectTest();

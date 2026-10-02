import initSqlJs from 'file:///D:/coderun-extension/node_modules/sql.js/dist/sql-wasm.js';
import fs from 'fs';
import path from 'path';

async function checkRange() {
  var SQL = await initSqlJs();
  var stateDbPath = path.join(process.env.APPDATA, 'Code', 'User', 'globalStorage', 'state.vscdb');
  var db = new SQL.Database(fs.readFileSync(stateDbPath));
  var res = db.exec("SELECT value FROM ItemTable WHERE key = 'Bala-Siva-Ganesh.qwen-coderun-agent'");
  var data = JSON.parse(res[0].values[0][0]);
  var convs = data['qwen-coderun_conversations'];
  if (typeof convs === 'string') convs = JSON.parse(convs);

  var c0 = convs[0];
  for (var i = 20; i <= 28; i++) {
    var m = c0.messages[i];
    if (!m) continue;
    console.log('--- [' + i + '] role: ' + m.role + ' ---');
    console.log('content:', (m.content || '').substring(0, 150));
    if (m.tool_calls) console.log('tool_calls:', JSON.stringify(m.tool_calls));
    if (m.tool_call_id) console.log('tool_call_id:', m.tool_call_id);
  }
}
checkRange();

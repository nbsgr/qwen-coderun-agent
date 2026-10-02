import initSqlJs from 'file:///D:/coderun-extension/node_modules/sql.js/dist/sql-wasm.js';
import fs from 'fs';
import path from 'path';

async function checkStoredConversations() {
  var SQL = await initSqlJs();
  var stateDbPath = path.join(process.env.APPDATA, 'Code', 'User', 'globalStorage', 'state.vscdb');
  var db = new SQL.Database(fs.readFileSync(stateDbPath));
  var res = db.exec("SELECT value FROM ItemTable WHERE key = 'Bala-Siva-Ganesh.qwen-coderun-agent'");
  var data = JSON.parse(res[0].values[0][0]);
  var convs = data['qwen-coderun_conversations'];
  if (typeof convs === 'string') convs = JSON.parse(convs);

  var c0 = convs[0];
  console.log('Top conversation id:', c0.id, 'title:', c0.title);
  var msgs = c0.messages || [];
  console.log('Messages count:', msgs.length);
  for (var i = Math.max(0, msgs.length - 5); i < msgs.length; i++) {
    var m = msgs[i];
    console.log('\n=======================================');
    console.log('MSG #' + i + ' [' + m.role + ']');
    console.log('Full content:\n' + m.content);
    if (m.thinking) console.log('Thinking:\n' + m.thinking);
    if (m.error) console.log('Error:\n' + m.error);
    if (m.tool_calls) console.log('Tool calls:\n' + JSON.stringify(m.tool_calls, null, 2));
  }
}
checkStoredConversations();

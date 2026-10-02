import initSqlJs from 'file:///D:/coderun-extension/node_modules/sql.js/dist/sql-wasm.js';
import fs from 'fs';
import path from 'path';

async function checkChat12() {
  var SQL = await initSqlJs();
  var stateDbPath = path.join(process.env.APPDATA, 'Code', 'User', 'globalStorage', 'state.vscdb');
  var db = new SQL.Database(fs.readFileSync(stateDbPath));
  var res = db.exec("SELECT value FROM ItemTable WHERE key = 'Bala-Siva-Ganesh.qwen-coderun-agent'");
  var data = JSON.parse(res[0].values[0][0]);
  var cookieStr = data['qwen-coderun.fallbackCookie'] || '';
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
    'Referer': 'https://chat.qwen.ai/c/a1e4ccc8-ba22-4912-aa95-8c490cc33749',
    'Cookie': finalCookie
  };
  if (token) headers['authorization'] = 'Bearer ' + token;

  var dRes = await fetch('https://chat.qwen.ai/api/v2/chats/a1e4ccc8-ba22-4912-aa95-8c490cc33749', { headers: headers });
  var dData = await dRes.json();
  var msgs = (dData.data && dData.data.chat && dData.data.chat.messages) || [];
  console.log('Chat 12 msgs count:', msgs.length);
  for (var i = 0; i < msgs.length; i++) {
    var m = msgs[i];
    console.log('--- MSG #' + i + ' role: ' + m.role + ' ---');
    console.log('content snippet:', (m.content || (m.content_list && m.content_list[0] && m.content_list[0].content) || '').substring(0, 150));
  }
}
checkChat12();

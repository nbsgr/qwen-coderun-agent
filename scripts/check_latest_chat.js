import initSqlJs from 'file:///D:/coderun-extension/node_modules/sql.js/dist/sql-wasm.js';
import fs from 'fs';
import path from 'path';

async function checkLatestChat() {
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
    'Cookie': finalCookie
  };
  if (token) headers['authorization'] = 'Bearer ' + token;

  var listRes = await fetch('https://chat.qwen.ai/api/v2/chats', { headers: headers });
  var listData = await listRes.json();
  var chats = (listData.data && listData.data.chats) || listData.data || [];
  if (chats.length > 0) {
    var latest = chats[0];
    console.log('Latest chat on Qwen:', latest.id, 'title:', latest.title);
    headers['Referer'] = 'https://chat.qwen.ai/c/' + latest.id;
    var dRes = await fetch('https://chat.qwen.ai/api/v2/chats/' + latest.id, { headers: headers });
    var dData = await dRes.json();
    var msgs = (dData.data && dData.data.chat && dData.data.chat.messages) || [];
    console.log('Messages count:', msgs.length);
    for (var i = 0; i < msgs.length; i++) {
      var m = msgs[i];
      console.log('--- MSG #' + i + ' [' + m.role + '] ---');
      var c = (m.content_list && m.content_list[0] && m.content_list[0].content) || m.content || '';
      console.log(c.substring(0, 500));
    }
  }
}
checkLatestChat();

import initSqlJs from 'file:///D:/coderun-extension/node_modules/sql.js/dist/sql-wasm.js';
import fs from 'fs';
import path from 'path';

async function dumpChat() {
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

  var chatId = '2209a157-f48d-4124-acf4-54917316d511';
  headers['Referer'] = 'https://chat.qwen.ai/c/' + chatId;
  var dRes = await fetch('https://chat.qwen.ai/api/v2/chats/' + chatId, { headers: headers });
  var dData = await dRes.json();
  var msgs = (dData.data && dData.data.chat && dData.data.chat.messages) || [];

  fs.writeFileSync('D:/coderun-extension/scripts/dump_chat.json', JSON.stringify(msgs, null, 2));
  console.log('Saved msgs to scripts/dump_chat.json');
}
dumpChat();

import initSqlJs from 'file:///D:/coderun-extension/node_modules/sql.js/dist/sql-wasm.js';
import fs from 'fs';
import path from 'path';

async function checkMultipleChats() {
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
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Connection': 'keep-alive',
    'Host': 'chat.qwen.ai',
    'source': 'web',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    'Referer': 'https://chat.qwen.ai/',
    'Origin': 'https://chat.qwen.ai',
    'Cookie': finalCookie
  };
  if (token) headers['authorization'] = 'Bearer ' + token;

  var listRes = await fetch('https://chat.qwen.ai/api/v2/chats', { headers: headers });
  var listData = await listRes.json();
  var chats = (listData.data && listData.data.chats) || listData.data || [];
  console.log('Total chats:', chats.length);

  for (var i = 0; i < Math.min(chats.length, 15); i++) {
    var c = chats[i];
    headers['Referer'] = 'https://chat.qwen.ai/c/' + c.id;
    var dRes = await fetch('https://chat.qwen.ai/api/v2/chats/' + c.id, { headers: headers });
    var dData = await dRes.json();
    var msgs = (dData.data && dData.data.chat && dData.data.chat.messages) || [];
    console.log('Chat #' + i + ' [' + c.id + '] Title: "' + c.title + '" msgs count: ' + msgs.length);
  }
}

checkMultipleChats();

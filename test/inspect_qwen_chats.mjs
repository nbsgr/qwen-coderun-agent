import initSqlJs from 'file:///D:/coderun-extension/node_modules/sql.js/dist/sql-wasm.js';
import fs from 'fs';
import path from 'path';

async function inspectDetail() {
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

  var chatId = 'df0ec090-da94-4718-b4c3-c5c6f9cbf88c';
  headers['Referer'] = 'https://chat.qwen.ai/c/' + chatId;
  var detailRes = await fetch('https://chat.qwen.ai/api/v2/chats/' + chatId, { headers: headers });
  var detailData = await detailRes.json();
  var msgs = (detailData.data && detailData.data.chat && detailData.data.chat.messages) || [];
  
  fs.writeFileSync('D:/coderun-extension/test/sample_qwen_chat.json', JSON.stringify(msgs, null, 2));
  console.log('Saved messages to test/sample_qwen_chat.json');
}

inspectDetail();

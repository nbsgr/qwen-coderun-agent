import initSqlJs from 'file:///D:/coderun-extension/node_modules/sql.js/dist/sql-wasm.js';
import fs from 'fs';
import path from 'path';

async function test() {
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
    'source': 'web',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    'Referer': 'https://chat.qwen.ai/',
    'Origin': 'https://chat.qwen.ai',
    'Cookie': finalCookie
  };
  if (token) headers['authorization'] = 'Bearer ' + token;

  var endpoints = [
    'https://chat.qwen.ai/api/v2/files',
    'https://chat.qwen.ai/api/v2/files/upload',
    'https://chat.qwen.ai/api/v2/file/upload',
    'https://chat.qwen.ai/api/v2/files/init',
    'https://chat.qwen.ai/api/v2/upload',
    'https://chat.qwen.ai/api/v2/oss/token'
  ];

  for (var ep of endpoints) {
    try {
      var r = await fetch(ep, { method: 'OPTIONS', headers: headers });
      console.log('OPTIONS', ep, r.status);
      var r2 = await fetch(ep, { method: 'POST', headers: headers });
      console.log('POST', ep, r2.status);
      var t = await r2.text();
      console.log('Response:', t.substring(0, 150));
    } catch (e) {
      console.log(ep, e.message);
    }
  }
}

test();

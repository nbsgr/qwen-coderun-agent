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
    'Cookie': finalCookie,
    'Content-Type': 'application/json'
  };
  if (token) headers['authorization'] = 'Bearer ' + token;

  console.log('1. Calling POST /api/v2/files/getstsToken...');
  var sampleBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'); // 1x1 transparent PNG
  var filename = 'pixel.png';
  var filesize = String(sampleBytes.length);
  var filetype = 'image/png';

  var r2 = await fetch('https://chat.qwen.ai/api/v2/files/getstsToken', {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({ filename: filename, filesize: filesize, filetype: filetype })
  });
  var data2 = await r2.json();
  console.log('getstsToken response success:', data2.success);
  var fileData = data2.data;
  console.log('file_id:', fileData.file_id);
  console.log('file_url:', fileData.file_url.substring(0, 80) + '...');

  console.log('2. Uploading sample bytes to OSS via PUT file_url...');
  var ossRes = await fetch(fileData.file_url, {
    method: 'PUT',
    headers: {
      'Content-Type': filetype
    },
    body: sampleBytes
  });
  console.log('OSS PUT status:', ossRes.status);
  console.log('OSS PUT statusText:', ossRes.statusText);
}

test();

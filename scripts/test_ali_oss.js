import initSqlJs from 'file:///D:/coderun-extension/node_modules/sql.js/dist/sql-wasm.js';
import fs from 'fs';
import path from 'path';
import OSS from 'ali-oss';

async function testUpload() {
  console.log('1. Reading Qwen session token...');
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

  console.log('2. Requesting STS token from /api/v2/files/getstsToken...');
  var sampleBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  var filename = 'pixel.png';
  var filesize = String(sampleBytes.length);
  var filetype = 'image/png';

  var stsRes = await fetch('https://chat.qwen.ai/api/v2/files/getstsToken', {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({ filename: filename, filesize: filesize, filetype: filetype })
  });
  var stsData = await stsRes.json();
  var d = stsData.data;
  console.log('File ID:', d.file_id);
  console.log('File Path:', d.file_path);

  console.log('3. Initializing ali-oss client and uploading...');
  var client = new OSS({
    authorizationV4: true,
    region: d.region,
    endpoint: d.endpoint,
    accessKeyId: d.access_key_id,
    accessKeySecret: d.access_key_secret,
    stsToken: d.security_token,
    bucket: d.bucketname
  });

  var putResult = await client.put(d.file_path, sampleBytes);
  console.log('Upload completed! HTTP status:', putResult.res && putResult.res.status);

  console.log('4. Calling /api/v2/files/getfilelink...');
  var linkRes = await fetch('https://chat.qwen.ai/api/v2/files/getfilelink', {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({ fileUrl: d.file_path })
  });
  var linkData = await linkRes.json();
  console.log('getfilelink response:', JSON.stringify(linkData, null, 2));

  var linkRes2 = await fetch('https://chat.qwen.ai/api/v2/files/getfilelink', {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({ file_id: d.file_id })
  });
  var linkData2 = await linkRes2.json();
  console.log('getfilelink by file_id response:', JSON.stringify(linkData2, null, 2));
}

testUpload().catch(err => console.error('Upload test failed:', err));

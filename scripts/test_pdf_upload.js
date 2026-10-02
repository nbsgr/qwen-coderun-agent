import initSqlJs from 'file:///D:/coderun-extension/node_modules/sql.js/dist/sql-wasm.js';
import fs from 'fs';
import path from 'path';
import OSS from 'ali-oss';

async function testPdfUpload() {
  var SQL = await initSqlJs();
  var stateDbPath = path.join(process.env.APPDATA, 'Code', 'User', 'globalStorage', 'state.vscdb');
  var db = new SQL.Database(fs.readFileSync(stateDbPath));
  var res = db.exec("SELECT value FROM ItemTable WHERE key = 'Bala-Siva-Ganesh.qwen-coderun-agent'");
  var data = JSON.parse(res[0].values[0][0]);
  var cookieStr = data['qwen-coderun.fallbackCookie'] || '';

  var token = '';
  var parts = cookieStr.split(';');
  for (var i = 0; i < parts.length; i++) {
    var part = parts[i].trim();
    if (part.startsWith('token=')) {
      token = part.substring(6);
      break;
    }
  }

  var headers = {
    'Accept': 'text/event-stream, application/json, */*',
    'Content-Type': 'application/json',
    'source': 'h5',
    'User-Agent': 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Mobile Safari/537.36',
    'Cookie': cookieStr
  };
  if (token) headers['Authorization'] = 'Bearer ' + token;

  console.log('Requesting STS token for PDF...');
  var stsRes = await fetch('https://chat.qwen.ai/api/v2/files/getstsToken', {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({ filename: 'sample_document.pdf', filesize: '1024', filetype: 'application/pdf' })
  });

  var json = await stsRes.json();
  console.log('PDF STS response:', json.success, json.data ? json.data.file_id : json);

  if (json.success && json.data) {
    var d = json.data;
    var client = new OSS({
      authorizationV4: true,
      region: d.region,
      endpoint: d.endpoint,
      accessKeyId: d.access_key_id,
      accessKeySecret: d.access_key_secret,
      stsToken: d.security_token,
      bucket: d.bucketname
    });
    // Create a dummy 1KB buffer mimicking a PDF header
    var dummyPdf = Buffer.from('%PDF-1.4\n%EOF\n' + 'x'.repeat(1000));
    var putRes = await client.put(d.file_path, dummyPdf);
    console.log('PDF Upload HTTP status:', putRes.res && putRes.res.status);
  }
}

testPdfUpload().catch(function(err) {
  console.error('PDF test error:', err);
});

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

  var chatId = '122aa912-4a13-4209-a010-9703bd185fac';
  var detailRes = await fetch('https://chat.qwen.ai/api/v2/chats/' + chatId, { headers: headers });
  var detailData = await detailRes.json();
  var msgs = (detailData.data && detailData.data.chat && detailData.data.chat.messages) || [];
  console.log('Fetched messages count:', msgs.length);
  fs.writeFileSync('test/image_chat_dump.json', JSON.stringify(msgs, null, 2));
  console.log('Dumped to test/image_chat_dump.json');
  for (var m of msgs) {
    console.log('Role:', m.role, 'Content type:', m.content_type, 'Keys:', Object.keys(m));
    if (m.content) console.log('Content preview:', String(m.content).substring(0, 150));
    if (m.extra) console.log('Extra:', JSON.stringify(m.extra).substring(0, 300));
    if (m.files) console.log('Files:', JSON.stringify(m.files).substring(0, 300));
    if (m.image) console.log('Image:', JSON.stringify(m.image).substring(0, 300));
    if (m.images) console.log('Images:', JSON.stringify(m.images).substring(0, 300));
    if (m.attachments) console.log('Attachments:', JSON.stringify(m.attachments).substring(0, 300));
  }
}
test();

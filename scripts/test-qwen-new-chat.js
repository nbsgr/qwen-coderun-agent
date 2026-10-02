// test-qwen-new-chat.js — Test new chat creation API
import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';

function getUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

async function getSavedCookie() {
  var SQL = await initSqlJs();
  var stateDbPath = path.join(process.env.APPDATA, 'Code', 'User', 'globalStorage', 'state.vscdb');
  var db = new SQL.Database(fs.readFileSync(stateDbPath));
  var res = db.exec("SELECT value FROM ItemTable WHERE key = 'Bala-Siva-Ganesh.qwen-coderun-agent'");
  var data = JSON.parse(res[0].values[0][0]);
  return data['qwen-coderun.fallbackCookie'] || '';
}

async function testNewChat() {
  console.log('Testing Qwen new chat creation API...\n');
  var cookieStr = await getSavedCookie();
  var token = '';
  var parts = cookieStr.split(';');
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i].trim();
    if (p.startsWith('token=')) token = p.substring(6);
    if (!token && p.startsWith('active_token=')) token = p.substring(13);
  }

  var headers = {
    'Accept': 'application/json, text/plain, */*',
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    'Cookie': cookieStr,
    'Authorization': 'Bearer ' + token,
    'Origin': 'https://chat.qwen.ai',
    'Referer': 'https://chat.qwen.ai/',
    'x-request-id': getUuid()
  };

  var payload = {
    title: 'CodeRun Agent Workspace',
    models: ['qwen3.7-plus'],
    chat_mode: 'normal',
    chat_type: 't2t',
    timestamp: Date.now()
  };

  var url = 'https://chat.qwen.ai/api/v2/chats/new';
  console.log('POST', url);
  console.log('Payload:', JSON.stringify(payload, null, 2));

  var resp = await fetch(url, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(payload)
  });

  console.log('\nStatus:', resp.status, resp.statusText);
  var json = await resp.json();
  console.log('\nResponse:');
  console.log(JSON.stringify(json, null, 2));

  if (json && json.success && json.data && json.data.id) {
    var createdId = json.data.id;
    console.log('\n✅ Successfully created chat session!');
    console.log('   Chat ID:', createdId);

    // Test deleting the created test chat
    console.log('\nTesting DELETE chat session to clean up...');
    var delResp = await fetch('https://chat.qwen.ai/api/v2/chats/' + createdId, {
      method: 'DELETE',
      headers: headers
    });
    console.log('DELETE status:', delResp.status, delResp.statusText);
    var delText = await delResp.text();
    console.log('DELETE response:', delText);
  } else {
    console.log('\n❌ Failed to create chat session.');
  }
}

testNewChat();

// test-fetch-deepseek-session.js — Fetch messages and history for the created session
import fs from 'fs';
import path from 'path';

function loadCreds() {
  var credPath = path.join(process.cwd(), 'scripts', 'deepseek-creds.json');
  var data = JSON.parse(fs.readFileSync(credPath, 'utf8'));
  var rawToken = data.localStorage.userToken;
  var token = JSON.parse(rawToken).value || rawToken;
  var cookies = data.cookies.map(function(c) { return c.name + '=' + c.value; }).join('; ');
  return { token: token, cookies: cookies };
}

async function run() {
  var creds = loadCreds();
  var chatId = 'eb4cb657-2175-45a3-b013-db3363a43002';

  var headers = {
    'accept': '*/*',
    'authorization': 'Bearer ' + creds.token,
    'content-type': 'application/json',
    'cookie': creds.cookies,
    'origin': 'https://chat.deepseek.com',
    'referer': 'https://chat.deepseek.com/a/chat/s/' + chatId,
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
  };

  var urls = [
    'https://chat.deepseek.com/api/v0/chat/history_messages?chat_session_id=' + chatId,
    'https://chat.deepseek.com/api/v0/chat_session/fetch_page?lte_cursor.pinned=false'
  ];

  for (var u of urls) {
    console.log('GET', u);
    var resp = await fetch(u, { headers: headers });
    console.log('Status:', resp.status);
    try {
      var json = await resp.json();
      if (json.data && json.data.biz_data && json.data.biz_data.chat_messages) {
        console.log('Chat Messages Count:', json.data.biz_data.chat_messages.length);
        console.log(JSON.stringify(json.data.biz_data.chat_messages, null, 2));
      } else {
        console.log(JSON.stringify(json, null, 2).substring(0, 500));
      }
    } catch (_) {
      console.log(await resp.text());
    }
    console.log('\n----------------------------------------\n');
  }
}

run();

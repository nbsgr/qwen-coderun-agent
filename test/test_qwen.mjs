import initSqlJs from 'file:///D:/coderun-extension/node_modules/sql.js/dist/sql-wasm.js';
import fs from 'fs';
import path from 'path';

function getUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

async function run() {
  var SQL = await initSqlJs();
  var stateDbPath = path.join(process.env.APPDATA, 'Code', 'User', 'globalStorage', 'state.vscdb');
  var db = new SQL.Database(fs.readFileSync(stateDbPath));
  var res = db.exec("SELECT value FROM ItemTable WHERE key = 'Bala-Siva-Ganesh.qwen-coderun-agent'");
  var data = JSON.parse(res[0].values[0][0]);
  var cookieStr = data['qwen-coderun.fallbackCookie'] || '';

  var token = '';
  var parts = cookieStr.split(';');
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i].trim();
    if (p.startsWith('token=')) token = p.substring(6);
    if (!token && p.startsWith('active_token=')) token = p.substring(13);
  }

  var bxUa = '234!t6OeKjrieePWr1PjjV4mwLmK48zJRd8FTTr55qiMD9dRMXOLA/2rqixq7SAwJ9Ie1K64UlwUoXPgZeWAEjvyoxLuZOvpd5Li3S7UmQHGnXrd8TjDjnf6DtXpsQFHAkJKSzIP7S9jnBDpHYqJUOPFBOCiGhtfHaCKmkPWTx0DNQmOJJ6J/DT9rLgFeZUrIbWX0La5AgVA/1IZn3UH9AJ7hwN+OUcOCd2gcP0aOQJNirLZZ3wH9idThpoZnkp/cAjenL5cQCyNescZn3UH9AVE6sZZ8ks/c24HeIoHOQYNhstZZ3wd9iJTCP2ZQkkwgsXH+lodOQ5NhsgiZ6Wd9iyoCvr+8Lkfcs4H+JWyQCyNhsfkZ3wd9ib2CvV+vkkhc2r7ZZodQCymhxuZVkUd9Ad7TZzZQkpvxOuyHVEHQQVmhxWZn3UJI4C8jRxZQ+kvc24TieCdQQymhskreLwH9idThnoZQpp/cs47ZJDxQC5Ovf1vSy+kKwbbBIoZQpsvc2PTYGwTQoVIhMaUekUM98edFVtZVY3QcM5Tn3ZEQCNmNkCZYLb39AdThrnZQLrOcMPTB/o9QCymhuxZekUH9AHb2c/NOARsoNvDAdHUePkbWoOvsUH2XTnfgIWAfVFu+7vqgyhrvdNaW1pb2jDq8ruAgAY5azNqoO5XcVVuBwmfEiIyAT+EVuc7En+OfbGuJRvv5eCurEmM6IkXp48DiBkI9qjmQe1Y+VHVhs/1mBaXBja/dqTPGVt4sr/ggEWFukX29KKoboI445AKjgR3DUpzecCEP/6DcMjKvzzzIm3CHOn7ZZwnAdIkdzKfclmLqfz3ALiWyQTQSxrRugB27Z3aVM6QX5+mlbtp3ZDoNas4u3vjUgueEk/E8xmyj0fEbnC/cKPbuxNTRgMZgHiCkXO4jEg7TtmXbdH4e1H6pqxqyj357FwExCtVNILqE7qcmw5OfLwSC1WHq1va5AlhdlcAZKAefbYnNbflnj+fVli6XfIl0KmzzzdsrLa3B8EESE1EkyPzTvfz0Bcn8RUYGKijqXyAdM7RAbAQhrNzGzRFBVVZoubREv1+sSc3zCsyXRPS8GIE5rqKO2PQZcoHZ5Xfw2VlBhiYGo3KhbTtZmZmOcixLj61U1wYqpFp7jspa+4SPJtl9gGKoHrQGja1hTIhiw/32YdoX2HKeemUWwSBo30Et+r4L+9usjb+NH4Oflq0UXtarsdCq1QElvpdA9BxqUXX+h/SzEqx4suD6IK8ORThuszcuzB9ukGKTX5jDE7+pQF8sEUdnQh1zXx/KN2PcYI0+Yw769RxwUb7zsWqo9z0ahlY52Cddr8j7fFkq9gVajuHmXuGRJUXDgJnHDqIpQs3sGYYTs0QJdNF5jq4xLNfcqugoNZMcDPu6V6Qeol1PagMdE+ssx4muDCuolycTXkqX7yAe+YwFjrMZWtb5Yyik/aKsqfD8ewvHpRwQGfP2oD4+J1VPG1BL6EgUJKqzf+M8xDgY0FmdYMJHrirYMf6gDdjlsmdio3LVCn28kaL/pn5HZSqzUIwvMjfw6olekKL5l0l6gOdSc/4c6xkXRjkkcK0vie+saJ2pavuiBKTxgyS/50k6QPKQnBWC19dG5R9GPZ1ZXEnnPVfGMWbBYgRXic6BjHjx7/jzSG57rtvtDMj4NhVsGVFYSAbMxWGFvn3THyqv37zsoYvmB5wrR9qWoDTV+p6pCtElyuS/oVYbLVIhrORf3hlsjrm+hvQk1XwIvKQIRqX2vy3ScanXL5QHDwiNc3kc8nTdSrczDzmCjp3GWbkkwqyMSIELCzI5NVPtMPl3fb5jNwgAhek';
  var bxUmidtoken = 'T2gAKSKQ-DRnLVZ5DYO63YR7SODE7IYEVg07M27F3ju0tJ5h6Z1NtMNDO8ocN4JoarA=';

  function buildHeaders(refUrl) {
    return {
      'accept': 'text/event-stream, application/json, */*',
      'accept-language': 'en-US,en;q=0.9',
      'bx-ua': bxUa,
      'bx-umidtoken': bxUmidtoken,
      'bx-v': '2.5.37',
      'content-type': 'application/json',
      'dnt': '1',
      'origin': 'https://chat.qwen.ai',
      'referer': refUrl || 'https://chat.qwen.ai/',
      'sec-ch-ua': '"Chromium";v="152", "Not?A_Brand";v="24", "Google Chrome";v="152"',
      'sec-ch-ua-mobile': '?1',
      'sec-ch-ua-platform': '"Android"',
      'source': 'h5',
      'timezone': 'Sat Sep 12 2026 18:31:07 GMT+0530',
      'user-agent': 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Mobile Safari/537.36',
      'version': '0.2.91',
      'x-accel-buffering': 'no',
      'x-request-id': getUuid(),
      'Cookie': cookieStr,
      'Authorization': 'Bearer ' + token
    };
  }

  // Create chat
  var newChatRes = await fetch('https://chat.qwen.ai/api/v2/chats/new', {
    method: 'POST',
    headers: buildHeaders('https://chat.qwen.ai/'),
    body: JSON.stringify({
      title: 'Stream Test',
      models: ['qwen3.7-plus'],
      chat_mode: 'normal',
      chat_type: 't2t',
      timestamp: Date.now()
    })
  });

  var newChatData = await newChatRes.json();
  var chatId = newChatData.data && newChatData.data.id;
  console.log('Created chat ID:', chatId);
  if (!chatId) return;

  var msgFid = getUuid();
  var childId = getUuid();

  var body = {
    chatId: chatId,
    chat_id: chatId,
    chat_mode: 'normal',
    incremental_output: true,
    model: 'qwen3.7-plus',
    stream: true,
    version: '2.1',
    parent_id: null,
    timestamp: Date.now(),
    messages: [{
      fid: msgFid,
      parentId: null,
      childrenIds: [childId],
      role: 'user',
      content: 'Say hello in 3 words',
      user_action: 'chat',
      files: [],
      timestamp: Date.now(),
      models: ['qwen3.7-plus'],
      chat_type: 't2t',
      feature_config: { output_schema: 'phase', thinking_enabled: false },
      extra: { meta: { subChatType: 't2t' } },
      sub_chat_type: 't2t',
      parent_id: null
    }]
  };

  console.log('Sending completions...');
  var res = await fetch('https://chat.qwen.ai/api/v2/chat/completions?chat_id=' + chatId, {
    method: 'POST',
    headers: buildHeaders('https://chat.qwen.ai/c/' + chatId),
    body: JSON.stringify(body)
  });

  console.log('Status:', res.status, res.statusText);
  var ct = (res.headers.get('content-type') || '').toLowerCase();
  console.log('Content-Type:', ct);

  if (ct.indexOf('text/event-stream') !== -1) {
    console.log('\n🎉🎉🎉 SUCCESS! 200 OK SSE STREAM RECEIVED! 🎉🎉🎉\n');
    var reader = res.body.getReader();
    var decoder = new TextDecoder();
    while (true) {
      var chunk = await reader.read();
      if (chunk.done) break;
      var txt = decoder.decode(chunk.value);
      process.stdout.write(txt);
    }
    console.log('\n\nStream completed 100% successfully!');
  } else {
    var j = await res.json();
    console.log('Response JSON:', JSON.stringify(j, null, 2));
  }
}

run();

import initSqlJs from 'file:///D:/coderun-extension/node_modules/sql.js/dist/sql-wasm.js';
import fs from 'fs';
import path from 'path';
import OSS from 'ali-oss';

function getUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0;
    var v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

async function testSendImage() {
  console.log('1. Reading credentials...');
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
    'Accept': 'text/event-stream, application/json, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Connection': 'keep-alive',
    'Content-Type': 'application/json',
    'dnt': '1',
    'Host': 'chat.qwen.ai',
    'Origin': 'https://chat.qwen.ai',
    'Sec-Ch-Ua': '"Chromium";v="152", "Not?A_Brand";v="24", "Google Chrome";v="152"',
    'Sec-Ch-Ua-Mobile': '?1',
    'Sec-Ch-Ua-Platform': '"Android"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'source': 'h5',
    'timezone': 'Sat Sep 12 2026 18:31:07 GMT+0530',
    'User-Agent': 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Mobile Safari/537.36',
    'version': '0.2.91',
    'x-accel-buffering': 'no',
    'x-request-id': getUuid(),
    'Cookie': cookieStr
  };
  if (token) headers['Authorization'] = 'Bearer ' + token;

  // Let's use an existing chat ID
  var chatId = '122aa912-4a13-4209-a010-9703bd185fac';
  console.log('Using Chat ID:', chatId);

  // Read a real image from the user's workspace
  // Let's use media_1790934787077.png or logo.png
  var imgPath = 'D:/coderun-extension/logo.png';
  if (!fs.existsSync(imgPath)) {
    imgPath = 'C:/Users/ganes/.gemini/antigravity/brain/4b1973a8-43be-4b32-82cc-01156c3e758f/.user_uploaded/media_1790934787077.png';
  }
  var imgBuffer = fs.readFileSync(imgPath);
  var filename = path.basename(imgPath);
  var filesize = String(imgBuffer.length);
  var filetype = 'image/png';
  console.log('Reading image:', filename, 'size:', filesize);

  console.log('2. Getting STS token...');
  var stsRes = await fetch('https://chat.qwen.ai/api/v2/files/getstsToken', {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({ filename: filename, filesize: filesize, filetype: filetype })
  });
  var stsData = await stsRes.json();
  if (!stsData.success || !stsData.data) {
    throw new Error('getstsToken failed: ' + JSON.stringify(stsData));
  }
  var d = stsData.data;
  console.log('STS token success! File ID:', d.file_id);

  console.log('3. Uploading to OSS via ali-oss client...');
  var client = new OSS({
    authorizationV4: true,
    region: d.region,
    endpoint: d.endpoint,
    accessKeyId: d.access_key_id,
    accessKeySecret: d.access_key_secret,
    stsToken: d.security_token,
    bucket: d.bucketname
  });

  var putRes = await client.put(d.file_path, imgBuffer);
  console.log('OSS Upload status:', putRes.res && putRes.res.status);

  var fileUrl = d.file_url;
  console.log('File URL:', fileUrl.substring(0, 80) + '...');

  var fileObj = {
    id: d.file_id,
    name: filename,
    file_type: filetype,
    type: 'image',
    file_class: 'vision',
    size: imgBuffer.length,
    url: fileUrl,
    status: 'uploaded',
    showType: 'image'
  };

  console.log('4. Sending chat/completions with files attached...');
  headers['Referer'] = 'https://chat.qwen.ai/c/' + chatId;
  var body = {
    chatId: chatId,
    chat_id: chatId,
    chat_mode: 'normal',
    incremental_output: true,
    model: 'qwen3.7-plus',
    stream: true,
    version: '2.1',
    parent_id: null,
    messages: [
      {
        fid: getUuid(),
        parentId: null,
        childrenIds: [getUuid()],
        role: 'user',
        content: 'Please describe this image in detail and tell me what you see in it.',
        user_action: 'chat',
        files: [fileObj],
        timestamp: Date.now(),
        models: ['qwen3.7-plus'],
        chat_type: 't2t',
        feature_config: {
          output_schema: 'phase',
          thinking_enabled: false
        },
        extra: { meta: { subChatType: 't2t' } },
        sub_chat_type: 't2t',
        parent_id: null
      }
    ],
    timestamp: Date.now()
  };

  var compRes = await fetch('https://chat.qwen.ai/api/v2/chat/completions?chat_id=' + chatId, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(body)
  });

  console.log('Completions HTTP status:', compRes.status);
  var reader = compRes.body.getReader();
  var decoder = new TextDecoder();
  var buffer = '';
  var fullAnswer = '';

  while (true) {
    var chunk = await reader.read();
    if (chunk.done) {
      console.log('Reader done!');
      break;
    }
    var rawText = decoder.decode(chunk.value, { stream: true });
    console.log('RAW CHUNK:', rawText);
    buffer += rawText;
    var lines = buffer.split('\n');
    buffer = lines.pop();
    for (var line of lines) {
      if (line.startsWith('data: ')) {
        var str = line.substring(6).trim();
        if (str === '[DONE]') {
          console.log('[DONE RECEIVED]');
          break;
        }
        try {
          var json = JSON.parse(str);
          console.log('CHUNK:', JSON.stringify(json));
          var choice = json.choices && json.choices[0];
          if (choice && choice.delta) {
            if (choice.delta.content) {
              fullAnswer += choice.delta.content;
              process.stdout.write(choice.delta.content);
            }
          }
        } catch (e) {
          console.log('PARSE ERR:', line);
        }
      }
    }
  }

  console.log('\n\n--- Full Response Finished ---');
  console.log('Length:', fullAnswer.length);
}

testSendImage().catch(err => console.error('Error:', err));

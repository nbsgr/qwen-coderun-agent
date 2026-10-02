// test-deepseek-api-live.js — Test DeepSeek APIs: session create, chat completion, history, delete
import fs from 'fs';
import path from 'path';

function getUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function loadDeepSeekCredentials() {
  var credPath = path.join(process.cwd(), 'scripts', 'deepseek-creds.json');
  if (!fs.existsSync(credPath)) {
    throw new Error('deepseek-creds.json not found');
  }
  var data = JSON.parse(fs.readFileSync(credPath, 'utf8'));
  var rawUserToken = data.localStorage.userToken;
  var tokenVal = '';
  try {
    var parsedToken = JSON.parse(rawUserToken);
    tokenVal = parsedToken.value || rawUserToken;
  } catch (_) {
    tokenVal = rawUserToken;
  }

  var cookieMap = {};
  for (var c of (data.cookies || [])) {
    cookieMap[c.name] = c.value;
  }

  var cookieStr = Object.keys(cookieMap).map(function(k) {
    return k + '=' + cookieMap[k];
  }).join('; ');

  var deviceId = data.localStorage['deepseek-device-id:chat'] || 'd6c9cdb4-2b4b-4689-8c43-e4e96e821f8a';

  return {
    token: tokenVal,
    cookieStr: cookieStr,
    deviceId: deviceId
  };
}

async function run() {
  console.log('===========================================================');
  console.log('🧪 TESTING DEEPSEEK LIVE APIS VIA AUTOMATICALLY CAPTURED AUTH');
  console.log('===========================================================\n');

  var creds = loadDeepSeekCredentials();
  console.log('Token extracted:', creds.token.substring(0, 20) + '...');
  console.log('Device ID:', creds.deviceId);
  console.log('Cookies string length:', creds.cookieStr.length);

  function getHeaders() {
    return {
      'accept': '*/*',
      'accept-language': 'en-US,en;q=0.9',
      'authorization': 'Bearer ' + creds.token,
      'content-type': 'application/json',
      'cookie': creds.cookieStr,
      'origin': 'https://chat.deepseek.com',
      'referer': 'https://chat.deepseek.com/',
      'sec-ch-ua': '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      'x-app-version': '20241129.0',
      'x-client-locale': 'en_US',
      'x-client-platform': 'web',
      'x-client-version': '1.0.0'
    };
  }

  // 1. Test Session Creation
  console.log('\n👉 [STEP 1] Testing Chat Session Creation (POST /api/v0/chat_session/create)...');
  var createUrl = 'https://chat.deepseek.com/api/v0/chat_session/create';
  var createRes = await fetch(createUrl, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      character_id: null
    })
  });

  console.log('Status:', createRes.status, createRes.statusText);
  var createJson = await createRes.json();
  console.log('Response:', JSON.stringify(createJson, null, 2));

  var sessionId = createJson?.data?.biz_data?.id;
  if (!sessionId) {
    console.error('❌ Failed to retrieve session_id from response.');
    return;
  }
  console.log('✅ Created DeepSeek chat session ID:', sessionId);

  // 2. Test Chat Completion (Streaming)
  console.log('\n-----------------------------------------------------------');
  console.log('👉 [STEP 2] Testing Chat Completion Stream (POST /api/v0/chat/completion)...');
  var completionUrl = 'https://chat.deepseek.com/api/v0/chat/completion';
  var compPayload = {
    chat_session_id: sessionId,
    parent_message_id: null,
    prompt: 'Hello DeepSeek! What is 12 + 15? Answer in one word.',
    ref_file_ids: [],
    thinking_enabled: false,
    search_enabled: false
  };

  console.log('Sending prompt:', compPayload.prompt);
  var compRes = await fetch(completionUrl, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(compPayload)
  });

  console.log('Completion HTTP Status:', compRes.status, compRes.statusText);
  console.log('Completion Headers:', JSON.stringify(Object.fromEntries(compRes.headers.entries()), null, 2));

  var rawBody = await compRes.text();
  console.log('Completion Body Length:', rawBody.length);
  console.log('Completion Raw Body (first 500 chars):', rawBody.substring(0, 500));

  // 3. Test Session Deletion
  console.log('\n-----------------------------------------------------------');
  console.log('👉 [STEP 3] Testing Chat Session Deletion...');
  var deleteUrl = 'https://chat.deepseek.com/api/v0/chat_session/delete';
  var delRes = await fetch(deleteUrl, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      chat_session_id: sessionId
    })
  });

  console.log('Delete HTTP Status:', delRes.status, delRes.statusText);
  try {
    var delJson = await delRes.json();
    console.log('Delete Response:', JSON.stringify(delJson));
  } catch (_) {
    console.log('Delete Response:', await delRes.text());
  }

  console.log('\n===========================================================');
  console.log('🎉 DEEPSEEK END-TO-END TEST COMPLETED');
  console.log('===========================================================');
}

run();

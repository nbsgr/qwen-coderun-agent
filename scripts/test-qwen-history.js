/**
 * Test: check what 'history' field contains vs 'messages' field
 */
import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

async function fetchJson(url, options) {
  return new Promise(function(resolve, reject) {
    var u = new URL(url);
    var req = https.request(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: 15000
    }, function(res) {
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() { resolve({ status: res.statusCode, body: data }); });
    });
    req.on('error', reject);
    req.on('timeout', function() { req.destroy(); reject(new Error('timeout')); });
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function main() {
  const appData = process.env.APPDATA;
  const stateDbPath = path.join(appData, 'Code', 'User', 'globalStorage', 'state.vscdb');
  const SQL = await initSqlJs();
  const buf = fs.readFileSync(stateDbPath);
  const db = new SQL.Database(buf);

  const extState = db.exec("SELECT value FROM ItemTable WHERE key = 'Bala-Siva-Ganesh.qwen-coderun-agent'");
  var fallbackCookie = '';

  if (extState.length && extState[0].values.length) {
    try {
      var parsed = JSON.parse(extState[0].values[0][0]);
      for (var k in parsed) {
        if (k.indexOf('cookie') !== -1 || k.indexOf('Cookie') !== -1) {
          fallbackCookie = parsed[k];
        }
      }
    } catch (e) { console.log('Parse error:', e.message); }
  }

  if (!fallbackCookie) {
    console.log('No cookie found. Trying env var...');
    fallbackCookie = process.env.QWEN_COOKIE || '';
  }

  if (!fallbackCookie) {
    console.log('ERROR: No cookie');
    process.exit(1);
  }

  var cookieStr = fallbackCookie.trim();
  if (cookieStr.startsWith('eyJ')) cookieStr = 'token=' + cookieStr;

  var token = '';
  var parts = cookieStr.split(';');
  for (var i = 0; i < parts.length; i++) {
    var part = parts[i].trim();
    if (part.startsWith('token=')) { token = part.substring(6); break; }
  }

  function getHeaders(chatId) {
    var h = {
      'Accept': 'application/json', 'Content-Type': 'application/json',
      'Origin': 'https://chat.qwen.ai',
      'Referer': chatId ? 'https://chat.qwen.ai/c/' + chatId : 'https://chat.qwen.ai/',
      'Cookie': cookieStr, 'x-request-id': getUuid(),
      'source': 'web', 'version': '0.2.78'
    };
    if (token) h['authorization'] = 'Bearer ' + token;
    return h;
  }

  // Get latest chat
  var listRes = await fetchJson('https://chat.qwen.ai/api/v2/chats', { headers: getHeaders() });
  var listData = JSON.parse(listRes.body);
  var latestChat = listData.data[0];
  
  console.log('Latest chat:', latestChat.id, '-', latestChat.title);

  var detailRes = await fetchJson('https://chat.qwen.ai/api/v2/chats/' + latestChat.id, { headers: getHeaders(latestChat.id) });
  var detail = JSON.parse(detailRes.body);

  if (!detail.success || !detail.data) {
    console.log('Failed to get detail');
    process.exit(1);
  }

  var chatObj = detail.data.chat || detail.data;
  console.log('\nchat keys:', Object.keys(chatObj));

  // Check messages
  var msgs = chatObj.messages || [];
  console.log('\nmessages count:', msgs.length);
  if (msgs.length) {
    console.log('last msg keys:', Object.keys(msgs[msgs.length - 1]));
    var lastMsg = msgs[msgs.length - 1];
    console.log('last msg role:', lastMsg.role);
    console.log('last msg content length:', (lastMsg.content || '').length);
    console.log('last msg has content_list:', !!lastMsg.content_list);
    if (lastMsg.content_list && lastMsg.content_list.length) {
      console.log('  content_list entries:', lastMsg.content_list.length);
      lastMsg.content_list.forEach(function(cl, i) {
        console.log('    [' + i + '] phase=' + cl.phase + ' len=' + (cl.content || '').length + ' start="' + (cl.content || '').substring(0, 60) + '"');
      });
    } else {
      console.log('  No content_list on last msg - checking full msg structure:');
      console.log(JSON.stringify(lastMsg).substring(0, 500));
    }
  }

  // Check history
  if (chatObj.history) {
    console.log('\nhistory type:', typeof chatObj.history);
    console.log('history isArray:', Array.isArray(chatObj.history));
    if (Array.isArray(chatObj.history)) {
      console.log('history count:', chatObj.history.length);
      if (chatObj.history.length) {
        var lastHist = chatObj.history[chatObj.history.length - 1];
        console.log('last history entry keys:', Object.keys(lastHist));
        console.log('last history role:', lastHist.role);
        if (lastHist.content) {
          console.log('last history content (first 100):', lastHist.content.substring(0, 100));
        } else {
          console.log('No content in history entry - checking full:');
          console.log(JSON.stringify(lastHist).substring(0, 400));
        }
      }
    } else if (typeof chatObj.history === 'string') {
      console.log('history is string, length:', chatObj.history.length);
      console.log('history start:', chatObj.history.substring(0, 300));
    } else {
      console.log('history raw:', JSON.stringify(chatObj.history).substring(0, 500));
    }
  } else {
    console.log('\nNo history field');
  }

  // Check currentResponseIds
  if (detail.data.currentResponseIds) {
    console.log('\ncurrentResponseIds:', JSON.stringify(detail.data.currentResponseIds).substring(0, 200));
  }
  if (detail.data.currentId) {
    console.log('currentId:', detail.data.currentId);
  }

  db.close();
}

main().catch(function(e) { console.error('Fatal:', e); process.exit(1); });

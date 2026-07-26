/**
 * Test script to analyze Qwen API conversation behavior - v2
 * Tries reading from the extension's globalState namespace key
 */

import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
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
    var mod = u.protocol === 'https:' ? https : http;
    var req = mod.request(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: 15000
    }, function(res) {
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data,
          setCookies: typeof res.headers['set-cookie'] !== 'undefined' ? res.headers['set-cookie'] : null
        });
      });
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

  if (!fs.existsSync(stateDbPath)) {
    console.log('ERROR: state.vscdb not found');
    process.exit(1);
  }

  const buf = fs.readFileSync(stateDbPath);
  const db = new SQL.Database(buf);

  // Read the extension's globalState value
  const extState = db.exec("SELECT value FROM ItemTable WHERE key = 'Bala-Siva-Ganesh.qwen-coderun-agent'");
  var fallbackCookie = '';

  if (extState.length && extState[0].values.length) {
    var val = extState[0].values[0][0];
    console.log('Extension globalState found. Length:', val.length);

    try {
      var parsed = JSON.parse(val);
      
      // Look for fallbackCookie key
      for (var k in parsed) {
        if (k.indexOf('cookie') !== -1 || k.indexOf('Cookie') !== -1 || k.indexOf('apiKey') !== -1 || k.indexOf('ApiKey') !== -1) {
          console.log('  Found key:', k, '=', parsed[k].substring(0, 50) + '...');
          fallbackCookie = parsed[k];
        }
      }

      // Also show all keys for reference
      console.log('\nAll keys in extension globalState:');
      for (var k in parsed) {
        var v = parsed[k];
        if (typeof v === 'string') {
          console.log('  [' + k + '] = string(' + v.length + ') "' + v.substring(0, 40) + '..."');
        } else if (typeof v === 'object') {
          console.log('  [' + k + '] = object');
        } else {
          console.log('  [' + k + '] = ' + String(v));
        }
      }
    } catch (e) {
      console.log('JSON parse error:', e.message);
      console.log('Raw value start:', val.substring(0, 200));
    }
  }

  if (!fallbackCookie) {
    console.log('\nNo fallbackCookie found. Trying secrets key...');
    
    // Check for the secrets pattern
    const secretRows = db.exec("SELECT value FROM ItemTable WHERE key LIKE '%secret%apiKey%' LIMIT 10");
    if (secretRows.length && secretRows[0].values.length) {
      console.log('Found secret rows:', secretRows[0].values.length);
      for (var si = 0; si < secretRows[0].values.length; si++) {
        console.log('  Secret value start:', secretRows[0].values[si].substring(0, 50));
      }
    }
    console.log('\nERROR: Could not find Qwen cookie.');
    console.log('Please export the cookie to an env var and re-run:');
    console.log('  $env:QWEN_COOKIE="token=..." ; node scripts/test-qwen-api2.js');
    process.exit(1);
  }

  // Normalize cookie
  var cookieStr = fallbackCookie.trim();
  if (cookieStr.startsWith('eyJ')) {
    cookieStr = 'token=' + cookieStr;
  }

  var token = '';
  var parts = cookieStr.split(';');
  for (var i = 0; i < parts.length; i++) {
    var part = parts[i].trim();
    if (part.startsWith('token=')) {
      token = part.substring(6);
      break;
    }
  }

  console.log('\n=== Cookie ready ===');
  console.log('  Token found:', !!token);

  function getHeaders(chatId) {
    var h = {
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Content-Type': 'application/json',
      'Host': 'chat.qwen.ai',
      'Origin': 'https://chat.qwen.ai',
      'Referer': chatId ? 'https://chat.qwen.ai/c/' + chatId : 'https://chat.qwen.ai/',
      'Cookie': cookieStr,
      'x-request-id': getUuid(),
      'source': 'web',
      'version': '0.2.78',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    };
    if (token) h['authorization'] = 'Bearer ' + token;
    return h;
  }

  // ── STEP 1: Fetch all chats ───────────────────────────
  console.log('\n\n=== STEP 1: Fetching all chats ===');
  var chatsResponse = await fetchJson('https://chat.qwen.ai/api/v2/chats', {
    headers: getHeaders()
  });
  console.log('  Status:', chatsResponse.status);

  if (chatsResponse.status !== 200) {
    console.log('  Error:', chatsResponse.body.substring(0, 500));
    process.exit(1);
  }

  var chatsData;
  try {
    chatsData = JSON.parse(chatsResponse.body);
  } catch (_) {
    console.log('  JSON parse error. Body:', chatsResponse.body.substring(0, 300));
    process.exit(1);
  }

  if (!chatsData.success) {
    console.log('  API error:', JSON.stringify(chatsData).substring(0, 300));
    process.exit(1);
  }

  var chats = chatsData.data || [];
  console.log('  Total chats:', chats.length);

  chats.forEach(function(chat, idx) {
    console.log('  Chat #' + (idx + 1) + ': ID=' + chat.id + ', Title="' + (chat.title || 'untitled') + '"');
  });

  // ── STEP 2: Fetch details for ALL chats ───────────────
  console.log('\n\n=== STEP 2: Fetching details for all chats ===');
  
  for (var ci = 0; ci < chats.length; ci++) {
    var chat = chats[ci];
    console.log('\n--- Chat "' + (chat.title || 'untitled') + '" ID: ' + chat.id + ' ---');
    
    var detailResponse = await fetchJson('https://chat.qwen.ai/api/v2/chats/' + chat.id, {
      headers: getHeaders(chat.id)
    });

    if (detailResponse.status !== 200) {
      console.log('  Error:', detailResponse.body.substring(0, 200));
      continue;
    }

    var detailData;
    try {
      detailData = JSON.parse(detailResponse.body);
    } catch (_) {
      console.log('  JSON parse error');
      continue;
    }

    if (!detailData.success || !detailData.data) {
      console.log('  No data. Keys:', Object.keys(detailData));
      continue;
    }

    var chatInfo = detailData.data.chat || detailData.data;
    var messages = chatInfo.messages || detailData.data.messages || [];
    
    console.log('  Messages count:', messages.length);
    
    // Show response structure keys for first chat
    if (ci === 0) {
      console.log('  Response top-level keys:', Object.keys(detailData));
      console.log('  data keys:', Object.keys(detailData.data));
      if (detailData.data.chat) {
        console.log('  chat keys:', Object.keys(detailData.data.chat));
      }
    }

    // Show pagination info if available
    if (detailData.data.total || detailData.data.page || detailData.data.pageSize) {
      console.log('  Pagination: total=' + detailData.data.total + ' page=' + detailData.data.page + ' pageSize=' + detailData.data.pageSize);
    }
    
    messages.forEach(function(msg, mi) {
      var role = msg.role || 'unknown';
      var content = msg.content || '';
      var isSysPrompt = content.indexOf('[User Request]:') !== -1;
      var isToolResult = content.indexOf('[System tool execution result]:') === 0;
      
      console.log('    msg[' + (mi + 1) + '] role=' + role + ' len=' + content.length +
        (isSysPrompt ? ' [SYSTEM+USER]' : '') +
        (isToolResult ? ' [TOOL_RESULT]' : '') +
        (isSysPrompt || isToolResult ? '' : ' content="' + content.substring(0, 60).replace(/\n/g, '\\n') + '"'));
    });
  }

  console.log('\n\n=== Analysis Complete ===');
  db.close();
}

main().catch(function(e) { console.error('Fatal:', e); process.exit(1); });

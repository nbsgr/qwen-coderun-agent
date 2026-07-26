/**
 * Test script to analyze Qwen API conversation behavior.
 * Tests:
 * 1. Fetch all chats (conversations)
 * 2. Fetch full chat detail with all messages
 * 3. Understand message structure (how 1/3, 2/3, 3/3 works)
 * 4. Check pagination
 */

import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Helpers ──────────────────────────────────────────────

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

// ── Main ─────────────────────────────────────────────────

async function main() {
  // Read cookie from VS Code globalState DB
  const appData = process.env.APPDATA;
  const stateDbPath = path.join(appData, 'Code', 'User', 'globalStorage', 'state.vscdb');
  const SQL = await initSqlJs();

  if (!fs.existsSync(stateDbPath)) {
    console.log('ERROR: state.vscdb not found');
    process.exit(1);
  }

  const buf = fs.readFileSync(stateDbPath);
  const db = new SQL.Database(buf);

  // Find all qwen-coderun related keys
  const keysResult = db.exec("SELECT key FROM ItemTable WHERE key LIKE '%qwen%'");
  console.log('=== Qwen-related keys in state.vscdb ===');
  if (keysResult.length && keysResult[0].values.length) {
    for (const row of keysResult[0].values) {
      console.log('  ' + row[0]);
    }
  }

  // Get the fallbackCookie (our API key/cookie)
  const cookieResult = db.exec("SELECT value FROM ItemTable WHERE key LIKE '%fallbackCookie%'");
  var cookieStr = '';
  if (cookieResult.length && cookieResult[0].values.length) {
    cookieStr = cookieResult[0].values[0][0];
    console.log('\n=== Cookie Found ===');
    console.log('  Length:', cookieStr.length);
    console.log('  Start:', cookieStr.substring(0, 50));
    console.log('  End:', cookieStr.substring(cookieStr.length - 20));
  }

  // Also check provider_configs
  const configsResult = db.exec("SELECT value FROM ItemTable WHERE key LIKE '%provider_configs%'");
  if (configsResult.length && configsResult[0].values.length) {
    try {
      var configs = JSON.parse(configsResult[0].values[0]);
      console.log('\n=== Provider Configs ===');
      console.log('  Keys:', Object.keys(configs).join(', '));
      if (configs.qwen) {
        console.log('  Qwen config:', JSON.stringify(configs.qwen));
      }
    } catch (_) {}
  }

  if (!cookieStr) {
    console.log('\nERROR: No cookie found. Please run the extension first and login to Qwen.');
    process.exit(1);
  }

  // Normalize cookie
  cookieStr = cookieStr.trim();
  if (cookieStr.startsWith('eyJ')) {
    cookieStr = 'token=' + cookieStr;
  }

  // Extract token
  var token = '';
  var parts = cookieStr.split(';');
  for (var i = 0; i < parts.length; i++) {
    var part = parts[i].trim();
    if (part.startsWith('token=')) {
      token = part.substring(6);
      break;
    }
  }

  console.log('\n=== Token ===');
  console.log('  Found:', !!token);
  console.log('  Start:', token.substring(0, 30));

  // Build headers
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
      'version': '0.2.78'
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

  // List all chats
  chats.forEach(function(chat, idx) {
    console.log('  Chat #' + (idx + 1) + ':');
    console.log('    ID:', chat.id);
    console.log('    Title:', chat.title || '(untitled)');
    console.log('    Model:', chat.models ? chat.models.join(', ') : 'unknown');
    console.log('    Created:', chat.gmt_create || chat.created_at || 'unknown');
    console.log('    Messages:', chat.message_count || chat.msg_count || 'unknown');
    console.log('    ----');
  });

  // ── STEP 2: Fetch full details for EACH chat ──────────
  console.log('\n\n=== STEP 2: Fetching full details for each chat ===');
  
  for (var ci = 0; ci < chats.length; ci++) {
    var chat = chats[ci];
    console.log('\n--- Chat #' + (ci + 1) + ': ' + (chat.title || 'untitled') + ' (ID: ' + chat.id + ') ---');
    
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
      console.log('  No data in response:', JSON.stringify(detailData).substring(0, 200));
      continue;
    }

    var chatInfo = detailData.data.chat || detailData.data;
    var messages = chatInfo.messages || detailData.data.messages || [];
    
    console.log('  Total messages:', messages.length);
    console.log('  Message structure:');
    
    messages.forEach(function(msg, mi) {
      var role = msg.role || 'unknown';
      var contentPreview = (msg.content || '').substring(0, 80).replace(/\n/g, ' ');
      var contentLen = (msg.content || '').length;
      var hasContentList = !!(msg.content_list && msg.content_list.length);
      var isUserReq = msg.content && msg.content.indexOf('[User Request]:') !== -1;
      var isToolResult = msg.content && msg.content.indexOf('[System tool execution result]:') === 0;
      
      console.log('    [' + (mi + 1) + '/' + messages.length + '] ' + role + 
        ' | len=' + contentLen + 
        ' | hasContentList=' + hasContentList +
        (isUserReq ? ' | SYSTEM+USER' : '') +
        (isToolResult ? ' | TOOL_RESULT' : '') +
        ' | preview: ' + contentPreview);
      
      // If has content_list, show its structure
      if (hasContentList) {
        msg.content_list.forEach(function(cl, cli) {
          console.log('      content_list[' + cli + ']: phase=' + cl.phase + ' | content_len=' + (cl.content || '').length);
        });
      }

      // Check for tool_calls embedded in assistant content
      if (role === 'assistant' && msg.content) {
        var tcMatch = msg.content.match(/```json\s*\{[\s\S]*?"tool_calls"[\s\S]*?\}\s*```/g);
        if (tcMatch) {
          console.log('      tool_calls blocks found: ' + tcMatch.length);
        }
      }
    });

    // Check for pagination
    console.log('  Response keys:', Object.keys(detailData.data).join(', '));
  }

  console.log('\n\n=== Analysis Complete ===');
  db.close();
}

main().catch(function(e) { console.error('Fatal:', e); process.exit(1); });

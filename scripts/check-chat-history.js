/**
 * Check the full conversation history from the last test chat
 * to see if Qwen correctly recorded our conversation.
 */
import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getUuid() { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) { var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8); return v.toString(16); }); }

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
      for (var k in parsed) if (k.indexOf('cookie') !== -1 || k.indexOf('Cookie') !== -1) fallbackCookie = parsed[k];
    } catch (_) {}
  }
  db.close();
  if (!fallbackCookie) { console.log('ERROR: No cookie'); process.exit(1); }
  var cookieStr = fallbackCookie.trim();
  if (cookieStr.startsWith('eyJ')) cookieStr = 'token=' + cookieStr;
  var token = '';
  var parts = cookieStr.split(';');
  for (var i = 0; i < parts.length; i++) { var p = parts[i].trim(); if (p.startsWith('token=')) { token = p.substring(6); break; } }

  function getHeaders(chatId) {
    return {
      'Accept': 'application/json', 'Content-Type': 'application/json', 'Origin': 'https://chat.qwen.ai',
      'Referer': chatId ? 'https://chat.qwen.ai/c/' + chatId : 'https://chat.qwen.ai/',
      'Cookie': cookieStr, 'x-request-id': getUuid(), 'source': 'web', 'version': '0.2.78',
      'authorization': 'Bearer ' + token, 'User-Agent': 'Mozilla/5.0'
    };
  }

  // Get ALL chats
  var listResp = await fetch('https://chat.qwen.ai/api/v2/chats', { headers: getHeaders() });
  var listData = await listResp.json();
  if (!listData.success) { console.log('Failed to list chats'); process.exit(1); }

  var chats = listData.data || [];
  console.log('Found ' + chats.length + ' chats');
  // Show all chats
  for (var i = 0; i < chats.length; i++) {
    var c = chats[i];
    console.log('\n--- Chat: "' + (c.title || 'untitled') + '" (ID: ' + c.id + ') ---');

    var detailResp = await fetch('https://chat.qwen.ai/api/v2/chats/' + c.id, { headers: getHeaders(c.id) });
    var detail = await detailResp.json();
    if (!detail.success || !detail.data) continue;

    var msgs = detail.data.chat ? detail.data.chat.messages : (detail.data.messages || []);
    console.log('  Messages: ' + msgs.length);
    
    for (var j = 0; j < msgs.length; j++) {
      var msg = msgs[j];
      var content = msg.content || '';
      var isUser = msg.role === 'user';
      var hasContentList = !!(msg.content_list && msg.content_list.length);
      
      // For user msgs, show first 120 chars
      // For assistant msgs, show content_list or first 120 chars
      if (isUser) {
        console.log('  [' + (j+1) + '] USER len=' + content.length + 
          ' start="' + content.substring(0, 80).replace(/\n/g, '\\n') + '..."');
        // Mark if it has tool result
        if (content.indexOf('[System tool execution result]:') !== -1) {
          console.log('       -> Has tool result!');
        }
        if (content.indexOf('[User Request]:') !== -1) {
          console.log('       -> Has user request marker');
        }
      } else {
        console.log('  [' + (j+1) + '] ASSISTANT len=' + content.length + 
          (hasContentList ? ' (has content_list)' : '') +
          ' hasToolCalls=' + (content.indexOf('"tool_calls"') !== -1));
        if (hasContentList) {
          msg.content_list.forEach(function(cl, ci) {
            console.log('       content_list[' + ci + ']: phase=' + cl.phase + ' len=' + (cl.content || '').length);
          });
        }
        // Check for tool_calls in content
        if (content.indexOf('"tool_calls"') !== -1) {
          var tcIdx = content.indexOf('"tool_calls"');
          var snippet = content.substring(Math.max(0, tcIdx - 20), tcIdx + 100);
          console.log('       Tool call area: ' + snippet.replace(/\n/g, '\\n'));
        }
      }
    }
  }
}

main().catch(function(e) { console.error('Fatal:', e); process.exit(1); });

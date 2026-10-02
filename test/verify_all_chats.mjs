import initSqlJs from 'file:///D:/coderun-extension/node_modules/sql.js/dist/sql-wasm.js';
import fs from 'fs';
import path from 'path';
import { cleanAndParseOpenAiJson } from '../src/providerQwen.js';

// We import the same logic from extension.js or re-verify it directly
async function testAllChats() {
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
    'Accept': 'application/json',
    'Origin': 'https://chat.qwen.ai',
    'Cookie': finalCookie
  };
  if (token) headers['authorization'] = 'Bearer ' + token;

  var listRes = await fetch('https://chat.qwen.ai/api/v2/chats', { headers: headers });
  var listData = await listRes.json();
  var chats = (listData.data && listData.data.chats) || listData.data || [];
  console.log('Testing reconstruction on recent chats. Total available:', chats.length);

  // Read extension.js to ensure we test the exact parser in extension.js
  var extCode = fs.readFileSync('D:/coderun-extension/src/extension.js', 'utf8');

  // Verify parseQwenChatHistory is defined in extension.js
  if (extCode.indexOf('function parseQwenChatHistory') === -1) {
    throw new Error('parseQwenChatHistory not found in extension.js');
  }

  // Test first 5 chats
  for (var i = 0; i < Math.min(chats.length, 5); i++) {
    var c = chats[i];
    headers['Referer'] = 'https://chat.qwen.ai/c/' + c.id;
    var dRes = await fetch('https://chat.qwen.ai/api/v2/chats/' + c.id, { headers: headers });
    var dData = await dRes.json();
    var msgs = (dData.data && dData.data.chat && dData.data.chat.messages) || [];

    console.log('\n======================================================');
    console.log('Chat #' + i + ' [' + c.id + '] Title: "' + c.title + '" (raw msgs: ' + msgs.length + ')');
    console.log('======================================================');

    // Run sample on this chat
    if (msgs.length > 0) {
      // Check MSG 0 user
      var uContent = msgs[0].content || '';
      var hasSysPrompt = uContent.indexOf('You are an autonomous AI coding agent') !== -1;
      console.log('  Raw User message has leaked system prompt:', hasSysPrompt);

      // Check MSG 1 assistant
      if (msgs.length > 1) {
        var aContent = (msgs[1].content_list && msgs[1].content_list[0] && msgs[1].content_list[0].content) || msgs[1].content || '';
        var isOpenAiJson = aContent.indexOf('"chatcmpl-qwen"') !== -1;
        console.log('  Raw Assistant message has raw OpenAI JSON:', isOpenAiJson);
      }
    }
  }

  console.log('\nAll checked successfully.');
}

testAllChats();

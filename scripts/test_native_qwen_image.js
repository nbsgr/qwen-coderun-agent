import initSqlJs from 'file:///D:/coderun-extension/node_modules/sql.js/dist/sql-wasm.js';
import fs from 'fs';
import path from 'path';

async function testNativeQwenImageGen() {
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
    'Accept': 'application/json, text/event-stream',
    'Origin': 'https://chat.qwen.ai',
    'Cookie': finalCookie,
    'Content-Type': 'application/json'
  };
  if (token) headers['authorization'] = 'Bearer ' + token;

  // 1. Create a fresh chat session
  var cRes = await fetch('https://chat.qwen.ai/api/v2/chats/new', {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({ title: 'Native Image Test' })
  });
  var cData = await cRes.json();
  var chatId = cData.data ? cData.data.id : null;
  console.log('Chat ID:', chatId);
  if (!chatId) {
    console.error('Failed to create chat:', cData);
    return;
  }

  headers['Referer'] = 'https://chat.qwen.ai/c/' + chatId;
  var body = {
    chatId: chatId,
    chat_id: chatId,
    chat_mode: 'normal',
    incremental_output: true,
    model: 'qwen3.8-max',
    stream: true,
    version: '2.1',
    parent_id: null,
    messages: [{
      fid: 'msg-user-1',
      parentId: null,
      childrenIds: ['msg-bot-1'],
      role: 'user',
      content: 'generate an image of a cute blue robot coding on a laptop',
      user_action: 'chat',
      files: [],
      timestamp: Date.now(),
      models: ['qwen3.8-max'],
      chat_type: 't2t',
      feature_config: {
        output_schema: 'phase',
        thinking_enabled: true,
        auto_thinking: true,
        thinking_mode: 'Auto',
        thinking_format: 'summary',
        auto_search: true
      },
      extra: { meta: { subChatType: 't2t' } },
      sub_chat_type: 't2t',
      parent_id: null
    }],
    timestamp: Date.now()
  };

  var r = await fetch('https://chat.qwen.ai/api/v2/chat/completions?chat_id=' + chatId, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(body)
  });

  console.log('HTTP status:', r.status);
  var reader = r.body.getReader();
  var decoder = new TextDecoder();
  var buffer = '';
  while (true) {
    var chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    var lines = buffer.split('\n');
    buffer = lines.pop();
    for (var line of lines) {
      if (line.startsWith('data:')) {
        var jsonStr = line.substring(5).trim();
        if (jsonStr === '[DONE]') continue;
        try {
          var parsed = JSON.parse(jsonStr);
          var choices = parsed.choices || [];
          for (var c of choices) {
            var d = c.delta || {};
            if (d.phase === 'image_gen_tool') {
              console.log('--> FOUND image_gen_tool phase:', JSON.stringify(d));
            }
            if (d.extra && (d.extra.image_list || d.extra.tool_result)) {
              console.log('--> FOUND image_list / tool_result:', JSON.stringify(d.extra));
            }
            if (d.content) {
              process.stdout.write(d.content);
            }
          }
        } catch (_) {}
      }
    }
  }

  console.log('\n--- Finished stream ---');
  // Check chat detail
  var dRes = await fetch('https://chat.qwen.ai/api/v2/chats/' + chatId, { headers: headers });
  var dData = await dRes.json();
  var msgs = (dData.data && dData.data.chat && dData.data.chat.messages) || [];
  for (var m of msgs) {
    if (m.role === 'assistant' && m.content_list) {
      for (var cl of m.content_list) {
        if (cl.phase === 'image_gen_tool' || (cl.extra && (cl.extra.image_list || cl.extra.tool_result))) {
          console.log('\n✅ FOUND IN CHAT HISTORY:', JSON.stringify(cl, null, 2));
        }
      }
    }
  }

  // Cleanup
  await fetch('https://chat.qwen.ai/api/v2/chats/' + chatId, { method: 'DELETE', headers: headers });
}

testNativeQwenImageGen();

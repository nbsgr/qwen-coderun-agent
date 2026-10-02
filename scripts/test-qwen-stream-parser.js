// test-qwen-stream-parser.js — Tests streaming parser for OpenAI chat.completion JSON
import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';

function getUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

async function getSavedCookie() {
  var SQL = await initSqlJs();
  var stateDbPath = path.join(process.env.APPDATA, 'Code', 'User', 'globalStorage', 'state.vscdb');
  var db = new SQL.Database(fs.readFileSync(stateDbPath));
  var res = db.exec("SELECT value FROM ItemTable WHERE key = 'Bala-Siva-Ganesh.qwen-coderun-agent'");
  var data = JSON.parse(res[0].values[0][0]);
  return data['qwen-coderun.fallbackCookie'] || '';
}

function buildPrompt(messages, tools) {
  var parts = [];

  var systemInstruction = 'You are an autonomous AI coding agent in a VS Code extension.\n' +
    '### AVAILABLE TOOLS\n' +
    formatTools(tools) +
    '\n\n### RESPONSE FORMAT REQUIREMENT\n' +
    'You MUST respond ONLY with a raw JSON object matching the standard OpenAI chat.completion format.\n' +
    'Do NOT output conversational text before or after the JSON.\n' +
    'Do NOT wrap the response in markdown code blocks like ```json. Output raw JSON only.\n\n' +
    'Required structure:\n' +
    '{\n' +
    '  "id": "chatcmpl-qwen",\n' +
    '  "object": "chat.completion",\n' +
    '  "choices": [\n' +
    '    {\n' +
    '      "index": 0,\n' +
    '      "message": {\n' +
    '        "role": "assistant",\n' +
    '        "reasoning": "step-by-step thinking and analysis",\n' +
    '        "content": "user-facing response text (empty string when calling tools)",\n' +
    '        "tool_calls": [\n' +
    '          {\n' +
    '            "id": "call_1",\n' +
    '            "type": "function",\n' +
    '            "function": {\n' +
    '              "name": "tool_name",\n' +
    '              "arguments": { "param_name": "param_value" }\n' +
    '            }\n' +
    '          }\n' +
    '        ]\n' +
    '      },\n' +
    '      "finish_reason": "stop | tool_calls"\n' +
    '    }\n' +
    '  ]\n' +
    '}\n' +
    'If calling tools, set "content": "" and "finish_reason": "tool_calls".\n' +
    'If giving final answer, set "tool_calls": [] and "finish_reason": "stop".';

  parts.push(systemInstruction);

  // Add conversation history
  var convMessages = messages.filter(function(m) { return m.role !== 'system'; });
  if (convMessages.length > 1) {
    parts.push('\n--- CONVERSATION HISTORY ---');
    for (var i = 0; i < convMessages.length - 1; i++) {
      var m = convMessages[i];
      if (m.role === 'user') {
        parts.push('\nUser: ' + m.content);
      } else if (m.role === 'assistant') {
        var aText = '\nAssistant:';
        if (m.reasoning) aText += '\nReasoning: ' + m.reasoning;
        if (m.content) aText += '\nContent: ' + m.content;
        if (m.tool_calls && m.tool_calls.length) {
          aText += '\nTool Calls:\n' + JSON.stringify(m.tool_calls, null, 2);
        }
        parts.push(aText);
      } else if (m.role === 'tool') {
        parts.push('\n[Tool Result (ID: ' + (m.tool_call_id || '') + ')]: ' + (m.content || ''));
      }
    }
  }

  // Current request
  var last = convMessages[convMessages.length - 1];
  if (last) {
    if (last.role === 'tool') {
      parts.push('\n--- CURRENT STEP ---\n[Tool Result for ID ' + last.tool_call_id + ']:\n' + last.content + '\nAnalyze this result and decide the next step or final answer in OpenAI format.');
    } else {
      parts.push('\n--- CURRENT REQUEST ---\nUser: ' + last.content);
    }
  }

  return parts.join('\n\n');
}

function formatTools(tools) {
  if (!tools || !tools.length) return 'No tools available.';
  var lines = [];
  for (var i = 0; i < tools.length; i++) {
    var t = tools[i];
    var fn = t.function || t;
    lines.push('- ' + fn.name + ': ' + (fn.description || ''));
    if (fn.parameters && fn.parameters.properties) {
      lines.push('  Parameters: ' + JSON.stringify(fn.parameters.properties));
    }
  }
  return lines.join('\n');
}

function cleanAndParseJson(raw) {
  var s = (raw || '').trim();
  if (s.startsWith('```json')) s = s.substring(7);
  else if (s.startsWith('```')) s = s.substring(3);
  if (s.endsWith('```')) s = s.substring(0, s.length - 3);
  s = s.trim();

  // Try parsing directly
  try {
    return JSON.parse(s);
  } catch (_) {}

  // If leading or trailing junk, find first { and matching last }
  var start = s.indexOf('{');
  var end = s.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    try {
      return JSON.parse(s.substring(start, end + 1));
    } catch (_) {}
  }
  return null;
}

async function runTest() {
  console.log('===========================================================');
  console.log('🧪 TESTING STREAM PARSER FOR OPENAI CHAT.COMPLETION');
  console.log('===========================================================\n');

  var cookieStr = await getSavedCookie();
  var token = '';
  var parts = cookieStr.split(';');
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i].trim();
    if (p.startsWith('token=')) token = p.substring(6);
    if (!token && p.startsWith('active_token=')) token = p.substring(13);
  }

  var bxUa = '234!t6OeKjrieePWr1PjjV4mwLmK48zJRd8FTTr55qiMD9dRMXOLA/2rqixq7SAwJ9Ie1K64UlwUoXPgZeWAEjvyoxLuZOvpd5Li3S7UmQHGnXrd8TjDjnf6DtXpsQFHAkJKSzIP7S9jnBDpHYqJUOPFBOCiGhtfHaCKmkPWTx0DNQmOJJ6J/DT9rLgFeZUrIbWX0La5AgVA/1IZn3UH9AJ7hwN+OUcOCd2gcP0aOQJNirLZZ3wH9idThpoZnkp/cAjenL5cQCyNescZn3UH9AVE6sZZ8ks/c24HeIoHOQYNhstZZ3wd9iJTCP2ZQkkwgsXH+lodOQ5NhsgiZ6Wd9iyoCvr+8Lkfcs4H+JWyQCyNhsfkZ3wd9ib2CvV+vkkhc2r7ZZodQCymhxuZVkUd9Ad7TZzZQkpvxOuyHVEHQQVmhxWZn3UJI4C8jRxZQ+kvc24TieCdQQymhskreLwH9idThnoZQpp/cs47ZJDxQC5Ovf1vSy+kKwbbBIoZQpsvc2PTYGwTQoVIhMaUekUM98edFVtZVY3QcM5Tn3ZEQCNmNkCZYLb39AdThrnZQLrOcMPTB/o9QCymhuxZekUH9AHb2c/NOARsoNvDAdHUePkbWoOvsUH2XTnfgIWAfVFu+7vqgyhrvdNaW1pb2jDq8ruAgAY5azNqoO5XcVVuBwmfEiIyAT+EVuc7En+OfbGuJRvv5eCurEmM6IkXp48DiBkI9qjmQe1Y+VHVhs/1mBaXBja/dqTPGVt4sr/ggEWFukX29KKoboI445AKjgR3DUpzecCEP/6DcMjKvzzzIm3CHOn7ZZwnAdIkdzKfclmLqfz3ALiWyQTQSxrRugB27Z3aVM6QX5+mlbtp3ZDoNas4u3vjUgueEk/E8xmyj0fEbnC/cKPbuxNTRgMZgHiCkXO4jEg7TtmXbdH4e1H6pqxqyj357FwExCtVNILqE7qcmw5OfLwSC1WHq1va5AlhdlcAZKAefbYnNbflnj+fVli6XfIl0KmzzzdsrLa3B8EESE1EkyPzTvfz0Bcn8RUYGKijqXyAdM7RAbAQhrNzGzRFBVVZoubREv1+sSc3zCsyXRPS8GIE5rqKO2PQZcoHZ5Xfw2VlBhiYGo3KhbTtZmZmOcixLj61U1wYqpFp7jspa+4SPJtl9gGKoHrQGja1hTIhiw/32YdoX2HKeemUWwSBo30Et+r4L+9usjb+NH4Oflq0UXtarsdCq1QElvpdA9BxqUXX+h/SzEqx4suD6IK8ORThuszcuzB9ukGKTX5jDE7+pQF8sEUdnQh1zXx/KN2PcYI0+Yw769RxwUb7zsWqo9z0ahlY52Cddr8j7fFkq9gVajuHmXuGRJUXDgJnHDqIpQs3sGYYTs0QJdNF5jq4xLNfcqugoNZMcDPu6V6Qeol1PagMdE+ssx4muDCuolycTXkqX7yAe+YwFjrMZWtb5Yyik/aKsqfD8ewvHpRwQGfP2oD4+J1VPG1BL6EgUJKqzf+M8xDgY0FmdYMJHrirYMf6gDdjlsmdio3LVCn28kaL/pn5HZSqzUIwvMjfw6olekKL5l0l6gOdSc/4c6xkXRjkkcK0vie+saJ2pavuiBKTxgyS/50k6QPKQnBWC19dG5R9GPZ1ZXEnnPVfGMWbBYgRXic6BjHjx7/jzSG57rtvtDMj4NhVsGVFYSAbMxWGFvn3THyqv37zsoYvmB5wrR9qWoDTV+p6pCtElyuS/oVYbLVIhrORf3hlsjrm+hvQk1XwIvKQIRqX2vy3ScanXL5QHDwiNc3kc8nTdSrczDzmCjp3GWbkkwqyMSIELCzI5NVPtMPl3fb5jNwgAhek';
  var bxUmidtoken = 'T2gAKSKQ-DRnLVZ5DYO63YR7SODE7IYEVg07M27F3ju0tJ5h6Z1NtMNDO8ocN4JoarA=';
  for (var pIdx = 0; pIdx < parts.length; pIdx++) {
    var pItem = parts[pIdx].trim();
    if (pItem.startsWith('bx_ua=')) bxUa = pItem.substring(6);
    if (pItem.startsWith('bx_umidtoken=')) bxUmidtoken = pItem.substring(13);
  }

  var headers = {
    'Accept': 'text/event-stream, application/json, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'bx-ua': bxUa,
    'bx-umidtoken': bxUmidtoken,
    'bx-v': '2.5.37',
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
  headers['Referer'] = 'https://chat.qwen.ai/';

  // Create chat session
  var newChatRes = await fetch('https://chat.qwen.ai/api/v2/chats/new', {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({
      title: 'OpenAI Format Stream Test',
      models: ['qwen3.7-plus'],
      chat_mode: 'normal',
      chat_type: 't2t',
      timestamp: Date.now()
    })
  });
  var chatData = await newChatRes.json();
  var chatId = chatData.data.id;
  console.log('Chat session created:', chatId);

  var tools = [
    {
      type: 'function',
      function: {
        name: 'read_file',
        description: 'Read contents of a file',
        parameters: {
          type: 'object',
          properties: {
            file_path: { type: 'string', description: 'Path to file' }
          },
          required: ['file_path']
        }
      }
    }
  ];

  var messages = [
    { role: 'user', content: 'Please inspect package.json to see what dependencies are installed.' }
  ];

  var serializedPrompt = buildPrompt(messages, tools);
  console.log('\n--- Serialized Prompt Preview (First 300 chars) ---');
  console.log(serializedPrompt.substring(0, 300) + '...\n');

  var compUrl = 'https://chat.qwen.ai/api/v2/chat/completions?chat_id=' + chatId;
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
        content: serializedPrompt,
        user_action: 'chat',
        files: [],
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

  var resp = await fetch(compUrl, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(body)
  });

  var reader = resp.body.getReader();
  var decoder = new TextDecoder('utf-8');
  var rawAccum = '';
  var streamBuffer = '';

  while (true) {
    var chunk = await reader.read();
    if (chunk.done) break;
    streamBuffer += decoder.decode(chunk.value, { stream: true });
    var lines = streamBuffer.split('\n');
    streamBuffer = lines.pop();

    for (var j = 0; j < lines.length; j++) {
      var line = lines[j].trim();
      if (!line || !line.startsWith('data: ')) continue;
      var dataStr = line.substring(6);
      if (dataStr.trim() === '[DONE]') break;
      try {
        var data = JSON.parse(dataStr);
        var delta = data.choices && data.choices[0] && data.choices[0].delta;
        if (delta && delta.content) {
          rawAccum += delta.content;
        }
      } catch (_) {}
    }
  }

  console.log('--- Raw Output Stream Received ---');
  console.log(rawAccum);
  console.log('-----------------------------------');

  var parsed = cleanAndParseJson(rawAccum);
  if (parsed && parsed.choices && parsed.choices[0] && parsed.choices[0].message) {
    var msg = parsed.choices[0].message;
    console.log('\n✅ Parsed Turn 1 OpenAI Completion Successfully!');
    console.log('   Reasoning: ', msg.reasoning || '(none)');
    console.log('   Content:   ', msg.content || '(empty)');
    console.log('   Tool Calls:', JSON.stringify(msg.tool_calls, null, 2));
    console.log('   Finish:    ', parsed.choices[0].finish_reason);
  } else {
    console.log('\n❌ Failed to parse Turn 1 as OpenAI format.');
    return;
  }

  // TURN 2: Send tool result back to the model!
  console.log('\n===========================================================');
  console.log('👉 [TURN 2] Simulating Tool Execution Result Sent Back');
  console.log('===========================================================');

  // Assistant message from Turn 1
  messages.push({
    role: 'assistant',
    reasoning: msg.reasoning,
    content: msg.content,
    tool_calls: msg.tool_calls
  });

  // Simulated tool result
  messages.push({
    role: 'tool',
    tool_call_id: 'call_1',
    content: '{\n  "name": "my-app",\n  "version": "1.0.0",\n  "dependencies": {\n    "express": "^4.18.2",\n    "dotenv": "^16.3.1"\n  }\n}'
  });

  var promptTurn2 = buildPrompt(messages, tools);
  console.log('\n--- Turn 2 Serialized Prompt Preview ---');
  console.log(promptTurn2);

  var bodyTurn2 = {
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
        content: promptTurn2,
        user_action: 'chat',
        files: [],
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

  var respTurn2 = await fetch(compUrl, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(bodyTurn2)
  });

  var reader2 = respTurn2.body.getReader();
  var rawAccum2 = '';
  var streamBuffer2 = '';

  while (true) {
    var chunk2 = await reader2.read();
    if (chunk2.done) break;
    streamBuffer2 += decoder.decode(chunk2.value, { stream: true });
    var lines2 = streamBuffer2.split('\n');
    streamBuffer2 = lines2.pop();

    for (var k = 0; k < lines2.length; k++) {
      var line2 = lines2[k].trim();
      if (!line2 || !line2.startsWith('data: ')) continue;
      var dataStr2 = line2.substring(6);
      if (dataStr2.trim() === '[DONE]') break;
      try {
        var data2 = JSON.parse(dataStr2);
        var delta2 = data2.choices && data2.choices[0] && data2.choices[0].delta;
        if (delta2 && delta2.content) {
          rawAccum2 += delta2.content;
        }
      } catch (_) {}
    }
  }

  console.log('\n--- Raw Turn 2 Output Stream Received ---');
  console.log(rawAccum2);
  console.log('-----------------------------------');

  var parsed2 = cleanAndParseJson(rawAccum2);
  if (parsed2 && parsed2.choices && parsed2.choices[0] && parsed2.choices[0].message) {
    var msg2 = parsed2.choices[0].message;
    console.log('\n✅ Parsed Turn 2 OpenAI Completion Successfully!');
    console.log('   Reasoning: ', msg2.reasoning || '(none)');
    console.log('   Content:   ', msg2.content || '(empty)');
    console.log('   Tool Calls:', JSON.stringify(msg2.tool_calls, null, 2));
    console.log('   Finish:    ', parsed2.choices[0].finish_reason);
  } else {
    console.log('\n❌ Failed to parse Turn 2 as OpenAI format.');
  }

  // Cleanup test chat
  await fetch('https://chat.qwen.ai/api/v2/chats/' + chatId, { method: 'DELETE', headers: headers });
  console.log('\n🧹 Cleaned up chat session.');
}

runTest();

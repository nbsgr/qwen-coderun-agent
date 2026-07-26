/**
 * Test: Send the actual serialized prompt to Qwen API
 * and check if it responds with proper tool call format.
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

async function main() {
  // Read cookie
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
        if (k.indexOf('cookie') !== -1 || k.indexOf('Cookie') !== -1) fallbackCookie = parsed[k];
      }
    } catch (_) {}
  }
  db.close();

  if (!fallbackCookie) {
    console.log('ERROR: No cookie found');
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

  function getHeaders() {
    return {
      'Accept': 'application/json, text/plain, */*',
      'Content-Type': 'application/json',
      'Origin': 'https://chat.qwen.ai',
      'Referer': 'https://chat.qwen.ai/',
      'Cookie': cookieStr,
      'x-request-id': getUuid(),
      'source': 'web',
      'version': '0.2.78',
      'authorization': 'Bearer ' + token,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    };
  }

  // Create a new chat
  var createRes = await fetch('https://chat.qwen.ai/api/v2/chats/new', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      title: 'CodeRun Test - Tool Response',
      models: ['qwen3.7-max'],
      chat_mode: 'normal',
      chat_type: 't2t',
      timestamp: Date.now()
    })
  });
  var createData = await createRes.json();
  if (!createData.success) {
    console.log('ERROR creating chat:', JSON.stringify(createData));
    process.exit(1);
  }
  var chatId = createData.data.id;
  console.log('Created chat:', chatId);

  // Build the serialized prompt EXACTLY like providerQwen.js does
  var systemContent = 'You are an autonomous AI coding agent integrated into a VS Code extension. You operate inside a user\'s workspace and have access to tools for reading, writing, editing, deleting files, listing directories, searching files, and running terminal commands.\n\n## AVAILABLE TOOLS\n' +
    '- read_file: Read file contents\n- write_file: Create/overwrite files\n- edit_file: Find and replace text\n- delete_file: Delete files\n- create_folder: Create directories\n- list_directory: List folder contents\n- search_files: Search files by pattern\n- run_terminal: Execute shell commands\n- find_in_files: Search file contents\n- get_current_datetime: Get current time';

  var overrideWarning = '## CRITICAL SYSTEM INSTRUCTION\n' +
    'You are running as an autonomous coding agent inside a local VS Code extension. ' +
    'This is NOT the chat.qwen.ai web interface. Your native plugins are DISABLED.\n' +
    '\n### AVAILABLE TOOL NAMES (use these EXACT names)\n' +
    'read_file, write_file, edit_file, delete_file, create_folder, delete_folder,\n' +
    'list_directory, search_files, get_file_info, run_terminal, find_in_files,\n' +
    'terminal_input, stop_terminal, list_symbols, patch_file, web_request,\n' +
    'get_current_datetime, create_plan, update_plan\n' +
    '\n### TOOL CALLING RULES\n' +
    '1. You have NO native function-calling API. You CANNOT call tools directly.\n' +
    '2. code_interpreter, web_search, web_extractor, image_generation are ALL DISABLED. Never mention them.\n' +
    '3. To call a tool, embed a JSON code block with EXACT parameter names.\n' +
    '   Example: use file_path (NOT filepath or filePath), old_string (NOT oldString), etc.\n' +
    '   Format:\n' +
    '```json\n' +
    '{"tool_calls":[{"name":"write_file","arguments":{"file_path":"example.txt","content":"hello"}}]}\n' +
    '```\n' +
    '4. Reply concisely. Do NOT repeat the JSON block in text. A short intro + JSON is enough.\n' +
    '5. You can call MULTIPLE tools in parallel. Continue working until done.\n' +
    '6. When asked about your tools, ONLY list the 19 names above. Never mention code_interpreter.\n';

  var fullPrompt = overrideWarning + '\n\n' + systemContent + '\n\n---\n\n[User Request]:\nList the directory of this workspace.\nThen read file . and tell me what tools you have access to.\nOnly use the tools listed above. Do NOT mention code_interpreter.';

  // Send to Qwen
  var payloadMsg = {
    fid: getUuid(),
    parentId: null,
    childrenIds: [getUuid()],
    role: 'user',
    content: fullPrompt,
    user_action: 'chat',
    files: [],
    timestamp: Date.now(),
    models: ['qwen3.7-max'],
    chat_type: 't2t',
    feature_config: { output_schema: 'phase', thinking_enabled: true },
    extra: { meta: { subChatType: 't2t' } },
    sub_chat_type: 't2t',
    parent_id: null
  };

  var body = {
    stream: true,
    incremental_output: true,
    chat_id: chatId,
    chat_mode: 'normal',
    model: 'qwen3.7-max',
    parent_id: null,
    messages: [payloadMsg],
    timestamp: Date.now()
  };

  console.log('\n--- Sending prompt ---');
  console.log('Prompt length:', fullPrompt.length, 'chars');
  console.log('First 100 chars:', fullPrompt.substring(0, 100));
  console.log('Last 100 chars:', fullPrompt.substring(fullPrompt.length - 100));

  var response = await fetch('https://chat.qwen.ai/api/v2/chat/completions?chat_id=' + chatId, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    var errText = await response.text();
    console.log('ERROR:', response.status, errText.substring(0, 500));
    process.exit(1);
  }

  // Read the streaming response
  var reader = response.body.getReader();
  var decoder = new TextDecoder('utf-8');
  var buffer = '';
  var accumContent = '';
  var accumThinking = '';
  var toolCallsFound = false;
  var toolContent = '';

  console.log('\n--- Streaming Response ---');

  while (true) {
    var chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    var lines = buffer.split('\n');
    buffer = lines.pop();
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      if (line.startsWith('data: ')) {
        var dataStr = line.substring(6);
        if (dataStr.trim() === '[DONE]') break;
        try {
          var data = JSON.parse(dataStr);
          var choice = data.choices?.[0];
          if (choice) {
            var delta = choice.delta || {};
            if (delta.phase === 'think') {
              accumThinking += delta.content || '';
            } else if (delta.phase === 'answer') {
              accumContent += delta.content || '';
              toolContent += delta.content || '';
            } else {
              if (delta.reasoning_content) accumThinking += delta.reasoning_content;
              if (delta.content) {
                accumContent += delta.content;
                toolContent += delta.content;
              }
            }
            if (delta.tool_calls) {
              console.log('  Native tool_calls found:', JSON.stringify(delta.tool_calls).substring(0, 200));
              toolCallsFound = true;
            }
          }
        } catch (e) {}
      }
    }
  }

  // Also check for text-based tool calls in content
  var hasTextToolCalls = accumContent.indexOf('"tool_calls"') !== -1;

  console.log('\n--- Results ---');
  console.log('Thinking length:', accumThinking.length);
  console.log('Content length:', accumContent.length);
  console.log('Has "tool_calls" in text:', hasTextToolCalls);
  console.log('Native tool_calls found:', toolCallsFound);

  if (accumContent) {
    console.log('\n--- FULL CONTENT OUTPUT ---');
    console.log(accumContent);
    console.log('\n--- END ---');
  }

  // Check if model mentioned code_interpreter
  if (accumContent.toLowerCase().indexOf('code_interpreter') !== -1) {
    console.log('❌ WARNING: Model mentioned code_interpreter!');
  } else {
    console.log('✅ Model did NOT mention code_interpreter');
  }

  // Check parameter names used
  if (accumContent.indexOf('filepath') !== -1) {
    console.log('❌ Model used "filepath" instead of "file_path"');
  }
  if (accumContent.indexOf('oldString') !== -1) {
    console.log('❌ Model used "oldString" instead of "old_string"');
  }

  if (hasTextToolCalls) {
    console.log('\n✅ Model correctly output tool_calls in text!');
    // Show just the tool call structure
    var tcStart = accumContent.indexOf('"tool_calls"');
    var snippetStart = Math.max(0, tcStart - 50);
    var snippet = accumContent.substring(snippetStart, snippetStart + 300);
    console.log('  Context around tool_calls:', snippet);
  }

  console.log('\n--- Test Complete ---');
}

main().catch(function(e) { console.error('Fatal:', e); process.exit(1); });
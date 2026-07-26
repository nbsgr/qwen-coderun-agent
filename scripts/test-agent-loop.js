/**
 * Test: Send "demonstrate all tools" prompt to Qwen and see how it responds.
 * Checks if Qwen follows the format, calls tools sequentially, and handles the loop.
 */
import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
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
      'Accept': 'application/json, text/plain, */*',
      'Content-Type': 'application/json',
      'Origin': 'https://chat.qwen.ai',
      'Referer': chatId ? 'https://chat.qwen.ai/c/' + chatId : 'https://chat.qwen.ai/',
      'Cookie': cookieStr, 'x-request-id': getUuid(),
      'source': 'web', 'version': '0.2.78',
      'authorization': 'Bearer ' + token,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    };
  }

  // Create chat
  var chatResp = await fetch('https://chat.qwen.ai/api/v2/chats/new', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ title: 'CodeRun - Full Demo Test', models: ['qwen3.7-max'], chat_mode: 'normal', chat_type: 't2t', timestamp: Date.now() })
  });
  var chatData = await chatResp.json();
  if (!chatData.success) { console.log('FAIL: Cannot create chat'); process.exit(1); }
  var chatId = chatData.data.id;
  console.log('Chat created:', chatId);

  // Build EXACT prompt like the extension sends
  var systemContent = 'You are an autonomous AI coding agent integrated into a VS Code extension.\n\n## YOUR ROLE\nYou are the decision-maker. For every user request, decide: answer directly from knowledge, or use tools to inspect/modify the workspace.\n\n## HOW TO WORK (Think -> Plan -> Act -> Verify)\n1. Think: Understand the request\n2. Plan: Decide which tools to call\n3. Act: Call tools\n4. Verify: Check results\n\n## WORKSPACE RULES\n- Use relative paths\n- NEVER access files outside workspace\n- ALWAYS read before editing\n- Parallel tool calls are encouraged\n\n## TERMINAL RULES\n- Use run_terminal for commands\n- Read output carefully\n\n## RESPONSE RULES\n- Be concise and clear\n- Summarize what was done\n- Format code with language tags';

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

  var userPrompt = 'Demonstrate all tools! First create a folder named "demo_test", then create a file inside it with some content, list the directory, read the file back, get its info, search for files, run a terminal command, and tell me the time. Be concise - just acknowledge each step.';

  var fullMessage = overrideWarning + systemContent + '\n\n## AVAILABLE WORKSPACE TOOLS (for JSON output only)\nThe following tools are available:\n- read_file(file_path)\n- write_file(file_path, content)\n- edit_file(file_path, old_string, new_string)\n- delete_file(file_path)\n- create_folder(folder_path)\n- delete_folder(folder_path)\n- list_directory(folder_path)\n- search_files(pattern, folder_path)\n- get_file_info(file_path)\n- run_terminal(command)\n- find_in_files(query)\n- get_current_datetime()\n- list_symbols(file_path)\n- patch_file(file_path, patches)\n- web_request(url, method)\n- create_plan(steps)\n- update_plan(steps)\n\n---\n\n[User Request]:\n' + userPrompt;

  // Send first prompt
  var payloadMsg = {
    fid: getUuid(), parentId: null, childrenIds: [getUuid()],
    role: 'user', content: fullMessage,
    user_action: 'chat', files: [], timestamp: Date.now(),
    models: ['qwen3.7-max'], chat_type: 't2t',
    feature_config: { output_schema: 'phase', thinking_enabled: true },
    extra: { meta: { subChatType: 't2t' } }, sub_chat_type: 't2t', parent_id: null
  };

  function sendAndRead(role, content) {
    var pm = {
      fid: getUuid(), parentId: null, childrenIds: [getUuid()],
      role: role, content: content,
      user_action: 'chat', files: [], timestamp: Date.now(),
      models: ['qwen3.7-max'], chat_type: 't2t',
      feature_config: { output_schema: 'phase', thinking_enabled: true },
      extra: { meta: { subChatType: 't2t' } }, sub_chat_type: 't2t', parent_id: null
    };
    var body = { stream: true, incremental_output: true, chat_id: chatId, chat_mode: 'normal', model: 'qwen3.7-max', parent_id: null, messages: [pm], timestamp: Date.now() };
    return fetch('https://chat.qwen.ai/api/v2/chat/completions?chat_id=' + chatId, {
      method: 'POST', headers: getHeaders(chatId), body: JSON.stringify(body)
    });
  }

  async function readStream(response) {
    var dec = new TextDecoder('utf-8');
    var b = '';
    var accumContent = '';
    var accumThinking = '';
    var reader = response.body.getReader();
    
    while (true) {
      var c = await reader.read();
      if (c.done) return { content: accumContent, thinking: accumThinking };
      b += dec.decode(c.value, { stream: true });
      var lines = b.split('\n');
      b = lines.pop();
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line || !line.startsWith('data: ')) continue;
        if (line.substring(6).trim() === '[DONE]') break;
        try {
          var data = JSON.parse(line.substring(6));
          var choice = data.choices?.[0];
          if (!choice) continue;
          var delta = choice.delta || {};
          if (delta.phase === 'think') accumThinking += delta.content || '';
          else if (delta.phase === 'answer') accumContent += delta.content || '';
          else { if (delta.reasoning_content) accumThinking += delta.reasoning_content; if (delta.content) accumContent += delta.content; }
        } catch (_) {}
      }
    }
  }

  // Simulate the agent loop: send -> parse tool_calls -> send tool result -> repeat
  var maxIterations = 8;
  var allDone = false;
  var fullContent = '';
  var toolResultMsg = '';

  for (var iter = 0; iter < maxIterations && !allDone; iter++) {
    console.log('\n=== Iteration ' + (iter + 1) + ' ===');

    var result;
    if (iter === 0) {
      var resp = await fetch('https://chat.qwen.ai/api/v2/chat/completions?chat_id=' + chatId, {
        method: 'POST',
        headers: getHeaders(chatId),
        body: JSON.stringify({
          stream: true, incremental_output: true, chat_id: chatId,
          chat_mode: 'normal', model: 'qwen3.7-max',
          parent_id: null, messages: [payloadMsg], timestamp: Date.now()
        })
      });
      if (!resp.ok) { console.log('HTTP error:', resp.status); break; }
      result = await readStream(resp);
    } else {
      var resp2 = await sendAndRead('user', toolResultMsg);
      if (!resp2.ok) { console.log('HTTP error:', resp2.status); break; }
      result = await readStream(resp2);
    }

    var accumContent = result.content || '';

    fullContent = accumContent;

    if (accumContent) {
      console.log('Content length:', accumContent.length);
      console.log('Content start:', accumContent.substring(0, 200).replace(/\n/g, '\\n'));
    }

    // Parse tool_calls
    var hasToolCalls = accumContent.indexOf('"tool_calls"') !== -1;
    if (!hasToolCalls) {
      console.log('→ No tool calls - agent would be DONE');
      allDone = true;
      continue;
    }

    // Extract the tool call JSON
    var tcStart = accumContent.indexOf('"tool_calls"');
    var braceBefore = accumContent.lastIndexOf('{', tcStart);
    var braceCount = 1;
    var pos = braceBefore + 1;
    while (pos < accumContent.length && braceCount > 0) {
      if (accumContent[pos] === '{') braceCount++;
      else if (accumContent[pos] === '}') braceCount--;
      pos++;
    }
    var tcJson = accumContent.substring(braceBefore, pos);
    var cleanJson = tcJson.replace(/```json|```/g, '').trim();

    try {
      var parsed = JSON.parse(cleanJson);
      if (parsed.tool_calls && parsed.tool_calls.length) {
        console.log('→ Tool calls:');
        for (var j = 0; j < parsed.tool_calls.length; j++) {
          var tc = parsed.tool_calls[j];
          console.log('  ' + (j+1) + '. ' + tc.name + '(' + JSON.stringify(tc.arguments) + ')');
        }

        // Build mock tool result
        var toolResults = [];
        for (var j = 0; j < parsed.tool_calls.length; j++) {
          var tc = parsed.tool_calls[j];
          var mockResult = '';
          if (tc.name === 'create_folder') mockResult = 'Folder created: ' + (tc.arguments.folder_path || tc.arguments.path);
          else if (tc.name === 'write_file') mockResult = 'File written: ' + (tc.arguments.file_path || tc.arguments.path);
          else if (tc.name === 'list_directory') mockResult = 'Contents: file1.txt, file2.txt';
          else if (tc.name === 'read_file') mockResult = 'File contents: hello world';
          else if (tc.name === 'get_file_info') mockResult = 'Size: 12 bytes, Modified: today';
          else if (tc.name === 'search_files') mockResult = 'Found: demo_test/file1.txt';
          else if (tc.name === 'run_terminal') mockResult = 'Output: Hello from terminal!';
          else if (tc.name === 'get_current_datetime') mockResult = '2026-07-25T15:30:00.000Z';
          else mockResult = 'Operation completed successfully.';
          toolResults.push('[System tool execution result]:\n' + mockResult);
        }

        toolResultMsg = toolResults.join('\n\n');
        console.log('→ Sending tool result back...');
      }
    } catch (e) {
      console.log('→ Parse error:', e.message);
      console.log('  Raw JSON snippet:', cleanJson.substring(0, 200));
      allDone = true;
    }
  }

  console.log('\n=== FULL RESPONSE ===');
  console.log(fullContent);
  console.log('\n=== END ===');

  console.log('\nIterations completed:', maxIterations);
  if (allDone) console.log('✅ Agent naturally completed');
  else console.log('⚠ Max iterations reached');
}

main().catch(function(e) { console.error('Fatal:', e); process.exit(1); });
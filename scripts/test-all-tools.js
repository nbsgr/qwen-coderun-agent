/**
 * Test ALL tools: Send prompts that should trigger each tool,
 * and check if Qwen uses the correct parameter names.
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

async function fetchSSE(url, headers, body) {
  var resp = await fetch(url, {
    method: 'POST', headers: headers, body: JSON.stringify(body)
  });
  if (!resp.ok) return { error: resp.status + ': ' + (await resp.text()).substring(0, 200) };
  
  var reader = resp.body.getReader();
  var decoder = new TextDecoder('utf-8');
  var buf = '';
  var accumContent = '';
  var accumThinking = '';
  
  while (true) {
    var chunk = await reader.read();
    if (chunk.done) break;
    buf += decoder.decode(chunk.value, { stream: true });
    var lines = buf.split('\n');
    buf = lines.pop();
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
  return { content: accumContent, thinking: accumThinking };
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

  // Tools to test with their prompts
  var toolTests = [
    { name: 'list_directory', prompt: 'List the current workspace directory (use . for current folder). Only use the exact tool parameter name folder_path.' },
    { name: 'read_file', prompt: 'Read the file package.json. Use the exact parameter name file_path.' },
    { name: 'write_file', prompt: 'Create a file called test.txt with content "hello world". Use the exact parameter names file_path and content.' },
    { name: 'edit_file', prompt: 'Edit test.txt - replace "hello" with "hi". Use exact param names file_path, old_string, new_string.' },
    { name: 'delete_file', prompt: 'Delete test.txt. Use exact param name file_path.' },
    { name: 'create_folder', prompt: 'Create folder called mytest. Use exact param name folder_path.' },
    { name: 'delete_folder', prompt: 'Delete folder mytest. Use exact param name folder_path.' },
    { name: 'search_files', prompt: 'Search for all .js files. Use exact param names pattern and folder_path.' },
    { name: 'get_file_info', prompt: 'Get info about package.json. Use exact param name file_path.' },
    { name: 'run_terminal', prompt: 'Run echo hello in terminal. Use exact param name command.' },
    { name: 'find_in_files', prompt: 'Search for "import" in all files. Use exact param name query.' },
    { name: 'get_current_datetime', prompt: 'What time is it? Use no params for this tool.' },
    { name: 'list_symbols', prompt: 'List symbols in package.json. Use exact param name file_path.' },
    { name: 'patch_file', prompt: 'Patch package.json - replace "test" with "prod". Use exact param names file_path and patches.' },
    { name: 'web_request', prompt: 'GET https://example.com. Use exact param names url and method.' },
  ];

  var passCount = 0;
  var failCount = 0;
  var results = [];

  for (var ti = 0; ti < toolTests.length; ti++) {
    var test = toolTests[ti];
    console.log('\n=== Testing: ' + test.name + ' ===');
    console.log('  Prompt: ' + test.prompt.substring(0, 80) + '...');

    // Create a fresh chat for each test
    var chatResp = await fetch('https://chat.qwen.ai/api/v2/chats/new', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ title: 'Test ' + test.name, models: ['qwen3.7-max'], chat_mode: 'normal', chat_type: 't2t', timestamp: Date.now() })
    });
    var chatData = await chatResp.json();
    if (!chatData.success) { console.log('  FAIL: Cannot create chat'); failCount++; continue; }
    var chatId = chatData.data.id;

    // Simple system content (short)
    var systemText = 'You are an autonomous coding agent in VS Code. Available tools: read_file(file_path), write_file(file_path,content), edit_file(file_path,old_string,new_string), delete_file(file_path), create_folder(folder_path), delete_folder(folder_path), list_directory(folder_path), search_files(pattern,folder_path), get_file_info(file_path), run_terminal(command), find_in_files(query), get_current_datetime(), list_symbols(file_path), patch_file(file_path,patches), web_request(url,method). You can ONLY call tools by outputting a JSON block: ```json {"tool_calls":[{"name":"tool","arguments":{...}}]}```';

    var payload = {
      fid: getUuid(), parentId: null, childrenIds: [getUuid()],
      role: 'user', content: systemText + '\n\n---\n\n[User Request]:\n' + test.prompt,
      user_action: 'chat', files: [], timestamp: Date.now(),
      models: ['qwen3.7-max'], chat_type: 't2t',
      feature_config: { output_schema: 'phase', thinking_enabled: false },
      extra: { meta: { subChatType: 't2t' } }, sub_chat_type: 't2t', parent_id: null
    };

    var body = { stream: true, incremental_output: true, chat_id: chatId, chat_mode: 'normal', model: 'qwen3.7-max', parent_id: null, messages: [payload], timestamp: Date.now() };

    var resp = await fetchSSE('https://chat.qwen.ai/api/v2/chat/completions?chat_id=' + chatId, getHeaders(chatId), body);
    if (resp.error) { console.log('  FAIL: ' + resp.error); failCount++; continue; }

    var content = resp.content;
    var hasToolCalls = content.indexOf('"tool_calls"') !== -1;

    if (!hasToolCalls) {
      console.log('  ❌ FAIL: No tool_calls in response');
      console.log('  Response start: ' + content.substring(0, 150).replace(/\n/g, '\\n'));
      failCount++;
      results.push({ name: test.name, pass: false, reason: 'No tool_calls found' });
      continue;
    }

    // Check for parameter name issues
    var hasFilepathIssue = content.indexOf('"filepath"') !== -1 && test.name !== 'test';
    var hasPathIssue = content.indexOf('"path"') !== -1 && test.name === 'list_directory';
    var hasOldStringIssue = content.indexOf('"oldString"') !== -1;
    var issues = [];
    if (content.indexOf('"filepath"') !== -1) issues.push('used "filepath"');
    if (content.indexOf('"newString"') !== -1) issues.push('used "newString"');
    if (content.indexOf('"oldString"') !== -1) issues.push('used "oldString"');
    
    // Extract the tool call JSON to check params
    var tcStart = content.indexOf('"tool_calls"');
    var braceBefore = content.lastIndexOf('{', tcStart);
    var braceCount = 1;
    var pos = braceBefore + 1;
    while (pos < content.length && braceCount > 0) {
      if (content[pos] === '{') braceCount++;
      else if (content[pos] === '}') braceCount--;
      pos++;
    }
    var tcJson = content.substring(braceBefore, pos);
    var cleanJson = tcJson.replace(/```json|```/g, '').trim();
    
    var toolName = '';
    var paramNames = [];
    try {
      var parsed = JSON.parse(cleanJson);
      if (parsed.tool_calls && parsed.tool_calls[0]) {
        toolName = parsed.tool_calls[0].name || '';
        var args = parsed.tool_calls[0].arguments || {};
        paramNames = Object.keys(args);
      }
    } catch (_) {
      // Try to extract info via regex
      var mn = content.match(/"name"\s*:\s*"([^"]+)"/);
      if (mn) toolName = mn[1];
    }

    console.log('  Tool called: ' + toolName);
    console.log('  Params used: ' + paramNames.join(', '));

    var pass = issues.length === 0;
    if (pass) {
      console.log('  ✅ PASS');
      passCount++;
    } else {
      console.log('  ❌ FAIL: ' + issues.join(', '));
      failCount++;
    }
    results.push({ name: test.name, pass: pass, toolName: toolName, params: paramNames, issues: issues });
  }

  console.log('\n\n========================================');
  console.log('=== OVERALL RESULTS ===');
  console.log('Passed: ' + passCount + '/' + toolTests.length);
  console.log('Failed: ' + failCount + '/' + toolTests.length);
  console.log('\nDetail:');
  for (var ri = 0; ri < results.length; ri++) {
    var r = results[ri];
    var icon = r.pass ? '✅' : '❌';
    console.log('  ' + icon + ' ' + r.name + (r.issues && r.issues.length ? ' - ' + r.issues.join(', ') : ''));
  }
  console.log('\nDone.');
}

main().catch(function(e) { console.error('Fatal:', e); process.exit(1); });

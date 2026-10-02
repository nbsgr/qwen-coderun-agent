import initSqlJs from 'file:///D:/coderun-extension/node_modules/sql.js/dist/sql-wasm.js';
import fs from 'fs';
import path from 'path';
import { chat } from '../src/providerQwen.js';

async function testSingleChatIdWithTools() {
  console.log('====================================================');
  console.log('🧪 TESTING SINGLE CHAT ID WITH TOOL CALLS');
  console.log('====================================================\n');

  var SQL = await initSqlJs();
  var stateDbPath = path.join(process.env.APPDATA, 'Code', 'User', 'globalStorage', 'state.vscdb');
  var db = new SQL.Database(fs.readFileSync(stateDbPath));
  var res = db.exec("SELECT value FROM ItemTable WHERE key = 'Bala-Siva-Ganesh.qwen-coderun-agent'");
  var data = JSON.parse(res[0].values[0][0]);
  var cookieStr = data['qwen-coderun.fallbackCookie'] || '';

  var config = {
    apiKey: cookieStr,
    model: 'qwen3.7-plus'
  };

  var tools = [
    {
      type: 'function',
      function: {
        name: 'list_directory',
        description: 'List all files and folders in a directory',
        parameters: {
          type: 'object',
          properties: {
            folder_path: { type: 'string', description: 'Folder path to list' }
          },
          required: ['folder_path']
        }
      }
    }
  ];

  // Turn 1: Ask for files -> Model should call list_directory
  console.log('👉 [TURN 1 STEP 1] Asking what files are in the folder...');
  var messages = [
    { role: 'system', content: 'You are an autonomous AI coding agent in a VS Code workspace.' },
    { role: 'user', content: 'List the files in the current folder' }
  ];

  var stream1 = chat(config, messages, tools);
  var turn1Thinking = '';
  var turn1Content = '';
  var turn1ToolCalls = [];

  for await (var chunk of stream1) {
    if (chunk.thinking) turn1Thinking += chunk.thinking;
    if (chunk.content) turn1Content += chunk.content;
    if (chunk.tool_calls && chunk.tool_calls.length) {
      for (var i = 0; i < chunk.tool_calls.length; i++) {
        turn1ToolCalls.push(chunk.tool_calls[i]);
      }
    }
  }

  console.log('Turn 1 Thinking preview:', turn1Thinking.substring(0, 100));
  console.log('Turn 1 Tool Calls received:', JSON.stringify(turn1ToolCalls));
  console.log('Turn 1 Content:', turn1Content);

  var activeChatId = config.chatId;
  console.log('Assigned Chat ID:', activeChatId);

  // Turn 1 Step 2: Feed back tool result
  console.log('\n👉 [TURN 1 STEP 2] Sending tool result back using SAME Chat ID:', activeChatId);
  messages.push({
    role: 'assistant',
    reasoning: turn1Thinking,
    tool_calls: turn1ToolCalls,
    content: turn1Content
  });
  messages.push({
    role: 'tool',
    tool_call_id: (turn1ToolCalls[0] && turn1ToolCalls[0].id) || 'call_1',
    tool_name: 'list_directory',
    content: 'Tool: list_directory\nSuccess: true\nEntries: [{"name":"package.json","type":"file"},{"name":"src","type":"directory"}]'
  });

  var configStep2 = {
    apiKey: cookieStr,
    model: 'qwen3.7-plus',
    chatId: activeChatId
  };

  var stream2 = chat(configStep2, messages, tools);
  var turn1FinalContent = '';
  for await (var chunk2 of stream2) {
    if (chunk2.content) turn1FinalContent += chunk2.content;
  }
  console.log('Turn 1 Final Answer:', turn1FinalContent.trim());
  console.log('Chat ID after Turn 1 final answer:', configStep2.chatId);

  // Turn 2: User sends a new question in the SAME chat session
  console.log('\n👉 [TURN 2] User asks next question in SAME Chat ID:', activeChatId);
  messages.push({
    role: 'assistant',
    content: turn1FinalContent.trim()
  });
  messages.push({
    role: 'user',
    content: 'Awesome, now confirm in 3 words if package.json was found.'
  });

  var configTurn2 = {
    apiKey: cookieStr,
    model: 'qwen3.7-plus',
    chatId: activeChatId
  };

  var stream3 = chat(configTurn2, messages, tools);
  var turn2Response = '';
  for await (var chunk3 of stream3) {
    if (chunk3.content) turn2Response += chunk3.content;
  }
  console.log('Turn 2 Response:', turn2Response.trim());
  console.log('Chat ID after Turn 2:', configTurn2.chatId);

  if (configTurn2.chatId === activeChatId) {
    console.log('\n====================================================');
    console.log('🎉 100% SUCCESS: Single Chat ID remained completely stable across 3 consecutive requests with tool execution!');
    console.log('====================================================');
  } else {
    console.warn('\n⚠ Chat ID shifted:', configTurn2.chatId, 'vs', activeChatId);
  }
}

testSingleChatIdWithTools();

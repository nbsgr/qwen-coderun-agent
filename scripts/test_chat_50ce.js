import initSqlJs from 'file:///D:/coderun-extension/node_modules/sql.js/dist/sql-wasm.js';
import fs from 'fs';
import path from 'path';

// Load functions dynamically from extension.js or re-verify directly
import { cleanAndParseOpenAiJson } from '../src/providerQwen.js';

function parseAssistantBlock(rawContent, thinkContent, toolIdxStart) {
  var nextToolIdx = toolIdxStart || 0;
  var parsed = cleanAndParseOpenAiJson(rawContent);

  if (parsed && parsed.choices && parsed.choices[0] && parsed.choices[0].message) {
    var choiceMsg = parsed.choices[0].message;
    var thinking = choiceMsg.reasoning || thinkContent || '';
    var content = choiceMsg.content || '';
    var rawCalls = choiceMsg.tool_calls || [];
    var formattedCalls = [];

    for (var i = 0; i < rawCalls.length; i++) {
      var tc = rawCalls[i];
      var fn = tc.function || tc;
      var argsStr = '';
      if (typeof fn.arguments === 'object') {
        try {
          argsStr = JSON.stringify(fn.arguments);
        } catch (_) {
          argsStr = String(fn.arguments || '');
        }
      } else {
        argsStr = String(fn.arguments || '');
      }
      formattedCalls.push({
        id: tc.id || ('hist_tc_' + nextToolIdx++),
        type: 'function',
        function: {
          name: fn.name || '',
          arguments: argsStr
        }
      });
    }

    var resEntry = {
      role: 'assistant',
      thinking: thinking,
      content: content
    };
    if (formattedCalls.length) {
      resEntry.tool_calls = formattedCalls;
    }
    return { entry: resEntry, nextToolIdx: nextToolIdx };
  }

  var calls = [];
  var re = /```json\s*(\{[\s\S]*?\})\s*(?:```|$)/g;
  var m;
  while ((m = re.exec(rawContent)) !== null) {
    try {
      var obj = JSON.parse(m[1].trim());
      if (obj && Array.isArray(obj.tool_calls)) {
        for (var k = 0; k < obj.tool_calls.length; k++) {
          var legTc = obj.tool_calls[k];
          calls.push({
            id: 'hist_tc_' + nextToolIdx++,
            type: 'function',
            function: {
              name: legTc.name,
              arguments: typeof legTc.arguments === 'object' ? JSON.stringify(legTc.arguments) : String(legTc.arguments || '')
            }
          });
        }
      }
    } catch (_) {}
  }

  var cleanContent = rawContent.replace(/```json\s*\{[\s\S]*?"tool_calls"[\s\S]*?\}\s*```/g, '').trim();
  var fallbackEntry = {
    role: 'assistant',
    thinking: thinkContent || '',
    content: cleanContent || (calls.length ? '' : rawContent)
  };
  if (calls.length) {
    fallbackEntry.tool_calls = calls;
  }
  return { entry: fallbackEntry, nextToolIdx: nextToolIdx };
}

function parseAssistantMessage(msg, toolIdxStart) {
  var thinkContent = '';
  var answerContent = '';
  if (msg.content_list && msg.content_list.length) {
    for (var j = 0; j < msg.content_list.length; j++) {
      var block = msg.content_list[j];
      if (block.phase === 'think') {
        thinkContent += (block.content || '');
      } else if (block.phase === 'answer') {
        answerContent += (block.content || '');
      }
    }
  }
  if (!answerContent && !thinkContent) {
    answerContent = msg.content || '';
  }

  return parseAssistantBlock(answerContent, thinkContent, toolIdxStart);
}

function parseSerializedPrompt(text) {
  var historyIdx = text.indexOf('--- CONVERSATION HISTORY ---');
  var currentStepIdx = text.indexOf('--- CURRENT STEP ---');
  var currentReqIdx = text.indexOf('--- CURRENT REQUEST ---');

  if (historyIdx === -1 && currentStepIdx === -1 && currentReqIdx === -1) {
    var legUserIdx = text.lastIndexOf('[User Request]:\n');
    if (legUserIdx !== -1) {
      return [{ role: 'user', content: text.substring(legUserIdx + '[User Request]:\n'.length).trim() }];
    }
    if (text.indexOf('[System tool execution result]:') === 0) {
      return [{ role: 'tool', content: text.substring('[System tool execution result]:\n'.length).trim() }];
    }
    if (text.indexOf('You are an autonomous AI coding agent') !== -1) {
      var lastUserMarker = text.lastIndexOf('\nUser:\n');
      if (lastUserMarker !== -1) {
        return [{ role: 'user', content: text.substring(lastUserMarker + '\nUser:\n'.length).trim() }];
      }
    }
    return [{ role: 'user', content: text.trim() }];
  }

  var extractedMessages = [];
  var historyText = '';

  var endHistoryIdx = -1;
  if (currentStepIdx !== -1 && currentReqIdx !== -1) {
    endHistoryIdx = Math.min(currentStepIdx, currentReqIdx);
  } else if (currentStepIdx !== -1) {
    endHistoryIdx = currentStepIdx;
  } else if (currentReqIdx !== -1) {
    endHistoryIdx = currentReqIdx;
  }

  if (historyIdx !== -1) {
    var rawHist = (endHistoryIdx !== -1)
      ? text.substring(historyIdx + '--- CONVERSATION HISTORY ---'.length, endHistoryIdx)
      : text.substring(historyIdx + '--- CONVERSATION HISTORY ---'.length);
    historyText = rawHist.trim();
  }

  if (historyText) {
    var itemRegex = /(?:^|\n)(User:\n|Assistant:\n|\[Tool Result for ([^\]]+)\]:\n)/g;
    var matches = [];
    var m;
    while ((m = itemRegex.exec(historyText)) !== null) {
      matches.push({
        type: m[1].startsWith('User:') ? 'user' : (m[1].startsWith('Assistant:') ? 'assistant' : 'tool'),
        header: m[2] || '',
        startIndex: m.index,
        contentStart: m.index + m[0].length
      });
    }

    for (var i = 0; i < matches.length; i++) {
      var cur = matches[i];
      var nextStart = (i + 1 < matches.length) ? matches[i + 1].startIndex : historyText.length;
      var chunk = historyText.substring(cur.contentStart, nextStart).trim();

      if (cur.type === 'user') {
        extractedMessages.push({ role: 'user', content: chunk });
      } else if (cur.type === 'tool') {
        var toolId = '';
        var idMatch = cur.header.match(/ID:\s*([^\)]+)/);
        if (idMatch) toolId = idMatch[1].trim();
        extractedMessages.push({
          role: 'tool',
          tool_call_id: toolId,
          content: chunk
        });
      } else if (cur.type === 'assistant') {
        var reasoning = '';
        var content = '';
        var toolCalls = [];

        var rIdx = chunk.indexOf('Reasoning:');
        var tcIdx = chunk.indexOf('Tool Calls:');
        var cIdx = chunk.indexOf('Content:');

        var reasoningEnd = -1;
        if (rIdx !== -1) {
          if (tcIdx !== -1 && tcIdx > rIdx) reasoningEnd = tcIdx;
          else if (cIdx !== -1 && cIdx > rIdx) reasoningEnd = cIdx;
          else reasoningEnd = chunk.length;
          reasoning = chunk.substring(rIdx + 'Reasoning:'.length, reasoningEnd).trim();
        }

        var tcEnd = -1;
        if (tcIdx !== -1) {
          if (cIdx !== -1 && cIdx > tcIdx) tcEnd = cIdx;
          else tcEnd = chunk.length;
          var tcRaw = chunk.substring(tcIdx + 'Tool Calls:'.length, tcEnd).trim();
          try {
            toolCalls = JSON.parse(tcRaw);
          } catch (_) {}
        }

        if (cIdx !== -1) {
          content = chunk.substring(cIdx + 'Content:'.length).trim();
        } else if (rIdx === -1 && tcIdx === -1) {
          content = chunk.trim();
        }

        var aMsg = {
          role: 'assistant',
          thinking: reasoning,
          content: content
        };
        if (toolCalls && toolCalls.length) {
          aMsg.tool_calls = toolCalls;
        }
        extractedMessages.push(aMsg);
      }
    }
  }

  if (currentStepIdx !== -1) {
    var stepText = text.substring(currentStepIdx + '--- CURRENT STEP ---'.length).trim();
    var toolHeaderMatch = stepText.match(/\[(?:Latest )?Tool Execution Result for ([^\]]+)\]:\n([\s\S]*?)(?:\n\nAnalyze this result|$)/);
    if (toolHeaderMatch) {
      var headerStr = toolHeaderMatch[1];
      var stepToolContent = toolHeaderMatch[2].trim();
      var stepToolId = '';
      var sIdMatch = headerStr.match(/ID:\s*([^\)]+)/);
      if (sIdMatch) stepToolId = sIdMatch[1].trim();

      extractedMessages.push({
        role: 'tool',
        tool_call_id: stepToolId,
        content: stepToolContent
      });
    }
  } else if (currentReqIdx !== -1) {
    var reqText = text.substring(currentReqIdx + '--- CURRENT REQUEST ---'.length).trim();
    if (reqText.startsWith('User:\n')) {
      reqText = reqText.substring('User:\n'.length).trim();
    }
    extractedMessages.push({
      role: 'user',
      content: reqText
    });
  }

  return extractedMessages;
}

function parseQwenChatHistory(rawMessages) {
  var formattedMessages = [];
  var toolCallIdx = 0;

  for (var i = 0; i < rawMessages.length; i++) {
    var msg = rawMessages[i];
    var role = msg.role;

    if (role === 'user') {
      var userContent = msg.content || '';
      var unpacked = parseSerializedPrompt(userContent);
      if (rawMessages.length > 2 && formattedMessages.length > 0) {
        if (unpacked.length > 1) {
          formattedMessages.push(unpacked[unpacked.length - 1]);
        } else if (unpacked.length === 1) {
          formattedMessages.push(unpacked[0]);
        }
      } else {
        for (var u = 0; u < unpacked.length; u++) {
          formattedMessages.push(unpacked[u]);
        }
      }
    } else if (role === 'assistant') {
      var res = parseAssistantMessage(msg, toolCallIdx);
      toolCallIdx = res.nextToolIdx;
      formattedMessages.push(res.entry);
    }
  }

  return formattedMessages;
}

async function testChat50ce() {
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

  var chatId = '50ce88df-336b-468c-be4c-ee82d6482790';
  var headers = {
    'Accept': 'application/json',
    'Origin': 'https://chat.qwen.ai',
    'Referer': 'https://chat.qwen.ai/c/' + chatId,
    'Cookie': finalCookie
  };
  if (token) headers['authorization'] = 'Bearer ' + token;

  var dRes = await fetch('https://chat.qwen.ai/api/v2/chats/' + chatId, { headers: headers });
  console.log('Status for 50ce88df-336b-468c-be4c-ee82d6482790:', dRes.status);
  var dData = await dRes.json();
  var msgs = (dData.data && dData.data.chat && dData.data.chat.messages) || [];
  console.log('Qwen returned msgs count:', msgs.length);

  var formatted = parseQwenChatHistory(msgs);
  console.log('Formatted messages count:', formatted.length);
  for (var i = 0; i < formatted.length; i++) {
    var m = formatted[i];
    console.log('  [' + m.role + '] ' + (m.content || '').substring(0, 60).replace(/\n/g, ' '));
  }
}

testChat50ce();

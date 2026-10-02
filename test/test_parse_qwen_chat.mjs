import fs from 'fs';

function cleanAndParseOpenAiJson(raw) {
  var s = (raw || '').trim();
  if (s.startsWith('```json')) s = s.substring(7);
  else if (s.startsWith('```')) s = s.substring(3);
  if (s.endsWith('```')) s = s.substring(0, s.length - 3);
  s = s.trim();

  try {
    return JSON.parse(s);
  } catch (_) {}

  var start = s.indexOf('{');
  var end = s.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    try {
      return JSON.parse(s.substring(start, end + 1));
    } catch (_) {}
  }
  return null;
}

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
        try { argsStr = JSON.stringify(fn.arguments); } catch(_) { argsStr = String(fn.arguments || ''); }
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

  // Fallback for markdown or legacy text
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
      if (block.phase === 'think') thinkContent += (block.content || '');
      else if (block.phase === 'answer') answerContent += (block.content || '');
    }
  }
  if (!answerContent && !thinkContent) {
    answerContent = msg.content || '';
  }

  return parseAssistantBlock(answerContent, thinkContent, toolIdxStart);
}

function parseSerializedPrompt(text) {
  // If the prompt contains --- CONVERSATION HISTORY ---, we can unpack previous turns!
  var historyIdx = text.indexOf('--- CONVERSATION HISTORY ---');
  var currentStepIdx = text.indexOf('--- CURRENT STEP ---');
  var currentReqIdx = text.indexOf('--- CURRENT REQUEST ---');

  if (historyIdx === -1 && currentStepIdx === -1 && currentReqIdx === -1) {
    // Check legacy marker [User Request]:
    var legUserIdx = text.lastIndexOf('[User Request]:\n');
    if (legUserIdx !== -1) {
      return [{ role: 'user', content: text.substring(legUserIdx + '[User Request]:\n'.length).trim() }];
    }
    // Check legacy tool result [System tool execution result]:
    if (text.indexOf('[System tool execution result]:') === 0) {
      return [{ role: 'tool', content: text.substring('[System tool execution result]:\n'.length).trim() }];
    }
    // Check if starts with system prompt preamble
    if (text.indexOf('You are an autonomous AI coding agent') !== -1) {
      // Look for last User: marker
      var lastUserMarker = text.lastIndexOf('\nUser:\n');
      if (lastUserMarker !== -1) {
        return [{ role: 'user', content: text.substring(lastUserMarker + '\nUser:\n'.length).trim() }];
      }
    }
    // Plain user text
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

  // Parse items from historyText
  if (historyText) {
    // Delimiters are: \nUser:\n, \nAssistant:\n, \n[Tool Result for 
    // Let's use a regex scanner to identify blocks
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
        // header is e.g. "list_directory (ID: call_1)" or "ID: call_1"
        var toolId = '';
        var idMatch = cur.header.match(/ID:\s*([^\)]+)/);
        if (idMatch) toolId = idMatch[1].trim();
        extractedMessages.push({
          role: 'tool',
          tool_call_id: toolId,
          content: chunk
        });
      } else if (cur.type === 'assistant') {
        // chunk may have Reasoning: ..., Tool Calls: ..., Content: ...
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

  // Parse Current Step / Request
  if (currentStepIdx !== -1) {
    var stepText = text.substring(currentStepIdx + '--- CURRENT STEP ---'.length).trim();
    // Delimiter: [Latest Tool Execution Result for <header>]:\n<content>\n\nAnalyze this result...
    var toolHeaderMatch = stepText.match(/\[Latest Tool Execution Result for ([^\]]+)\]:\n([\s\S]*?)(?:\n\nAnalyze this result|$)/);
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
      for (var u = 0; u < unpacked.length; u++) {
        formattedMessages.push(unpacked[u]);
      }
    } else if (role === 'assistant') {
      var res = parseAssistantMessage(msg, toolCallIdx);
      toolCallIdx = res.nextToolIdx;
      formattedMessages.push(res.entry);
    }
  }

  return formattedMessages;
}

function testParsing() {
  var rawJson = fs.readFileSync('D:/coderun-extension/test/sample_qwen_chat.json', 'utf8');
  var rawMessages = JSON.parse(rawJson);

  var formatted = parseQwenChatHistory(rawMessages);
  console.log('Formatted message count:', formatted.length);
  for (var i = 0; i < formatted.length; i++) {
    var m = formatted[i];
    console.log('\n----------------------------------------');
    console.log('Message #' + i + ' [' + m.role + ']');
    if (m.role === 'user') {
      console.log('User content:', m.content);
    } else if (m.role === 'assistant') {
      if (m.thinking) console.log('Thinking (len ' + m.thinking.length + '):', m.thinking.substring(0, 80) + '...');
      if (m.content) console.log('Content (len ' + m.content.length + '):', m.content.substring(0, 100) + '...');
      if (m.tool_calls) console.log('Tool calls:', JSON.stringify(m.tool_calls));
    } else if (m.role === 'tool') {
      console.log('Tool ID:', m.tool_call_id);
      console.log('Tool Content preview:', m.content.substring(0, 100) + '...');
    }
  }
}

testParsing();

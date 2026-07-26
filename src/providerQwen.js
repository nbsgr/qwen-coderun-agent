// providerQwen.js — Qwen Browser API Client for Qwen CodeRun Extension
// Mimics the reverse-engineered python session completions API.

import { handleApiResponseError } from './utils.js';

let activeQwenChatId = null;

export async function* chat(config, messages, tools) {
  // messages: FULL messages array built by promptBuilder + agentLoop.
  // We serialize the entire conversation into a single Qwen user message
  // since Qwen's browser API doesn't support multi-message arrays.
  //
  // This matches cline-ollama's context management pattern: we maintain
  // full control of the conversation history on our side via the messages[]
  // array, and serialize it all into each request.

  // Extract system content from messages
  var systemContent = '';
  var sysMsg = messages.find(function(m) { return m.role === 'system'; });
  if (sysMsg) systemContent = sysMsg.content;

  // Serialize all non-system messages into full context
  var serialized = serializeMessages(messages, systemContent, tools);

  // Sync the active Qwen chat ID from the config (passed from extension host)
  if (config.chatId && !config.chatId.startsWith('new-')) {
    activeQwenChatId = config.chatId;
  } else {
    activeQwenChatId = null;
  }

  // The Qwen browser API needs standard cookie credentials.
  var cookieStr = config.apiKey || '';
  if (!cookieStr) {
    throw new Error('Qwen Error: No session cookie set. Please paste your Qwen Cookie string in the settings panel.');
  }

  cookieStr = cookieStr.trim();
  if (cookieStr.startsWith('eyJ')) {
    cookieStr = 'token=' + cookieStr;
  }

  // Extract the authorization token from the cookie
  var token = '';
  var parts = cookieStr.split(';');
  for (var i = 0; i < parts.length; i++) {
    var part = parts[i].trim();
    if (part.startsWith('token=')) {
      token = part.substring(6);
      break;
    }
  }

  // Helper to build headers
  var getHeaders = function(chatId = '') {
    var h = {
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Connection': 'keep-alive',
      'Content-Type': 'application/json',
      'Host': 'chat.qwen.ai',
      'Sec-Ch-Ua': '"Not/A)Brand";v="99", "Chromium";v="148"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
      'source': 'web',
      'timezone': 'Fri Jul 24 2026 15:13:30 GMT+0530',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Code/1.130.0 Chrome/148.0.7778.280 Electron/42.6.0 Safari/537.36',
      'version': '0.2.78',
      'x-request-id': getUuid(),
      'Cookie': cookieStr
    };
    if (token) h['authorization'] = 'Bearer ' + token;
    if (chatId) h['Referer'] = 'https://chat.qwen.ai/c/' + chatId;
    return h;
  };

  var qwenModel = config.model || 'qwen3.7-max';

  // If no chat_id exists, initialize a new chat session on Qwen
  if (!activeQwenChatId) {
    try {
      var newChatUrl = 'https://chat.qwen.ai/api/v2/chats/new';
      var newChatPayload = {
        title: 'Qwen CodeRun Chat',
        models: [qwenModel],
        chat_mode: 'normal',
        chat_type: 't2t',
        timestamp: Date.now()
      };
      
      var newChatRes = await fetch(newChatUrl, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(newChatPayload)
      });
      
      if (!newChatRes.ok) {
        throw new Error('HTTP error creating chat: ' + newChatRes.status);
      }
      
      var newChatData = await newChatRes.json();
      if (newChatData && newChatData.success && newChatData.data && newChatData.data.id) {
        activeQwenChatId = newChatData.data.id;
        config.chatId = activeQwenChatId;
      } else {
        throw new Error('Qwen failed to return a new Chat ID: ' + JSON.stringify(newChatData));
      }
    } catch (err) {
      throw new Error('Failed to initialize Qwen chat session: ' + err.message);
    }
  }

  // Now query completions inside this chat ID
  var url = 'https://chat.qwen.ai/api/v2/chat/completions?chat_id=' + activeQwenChatId;

  // Send the FULL serialized conversation as a single user message.
  // This is how we maintain our own context management: the serialized
  // blob contains system prompt + tool defs + entire conversation history
  // + the current request, so Qwen always sees the full picture.
  var qwenRole = 'user';
  var qwenContent = serialized;

  var payloadMsg = {
    fid: getUuid(),
    parentId: null,
    childrenIds: [getUuid()],
    role: qwenRole,
    content: qwenContent,
    user_action: 'chat',
    files: [],
    timestamp: Date.now(),
    models: [qwenModel],
    chat_type: 't2t',
    feature_config: {
      output_schema: 'phase',
      thinking_enabled: true
    },
    extra: { meta: { subChatType: 't2t' } },
    sub_chat_type: 't2t',
    parent_id: null
  };

  var body = {
    stream: true,
    incremental_output: true,
    chat_id: activeQwenChatId,
    chat_mode: 'normal',
    model: qwenModel,
    parent_id: null,
    messages: [payloadMsg],
    timestamp: Date.now()
  };

  var response = await fetch(url, {
    method: 'POST',
    headers: getHeaders(activeQwenChatId),
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw await handleApiResponseError(response, 'Qwen');
  }

  var setCookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : (response.headers.get('set-cookie') ? response.headers.get('set-cookie').split(',') : null);
  if (setCookies && setCookies.length && typeof globalThis.qwenOnCookieUpdate === 'function' && typeof globalThis.qwenMergeSetCookies === 'function') {
    var merged = globalThis.qwenMergeSetCookies(cookieStr, setCookies);
    if (merged !== cookieStr) {
      cookieStr = merged;
      config.apiKey = merged;
      globalThis.qwenOnCookieUpdate(merged);
    }
  }

  if (!response.body) {
    throw new Error('Qwen API Error: Response body is empty.');
  }

  var reader = response.body.getReader();
  var decoder = new TextDecoder('utf-8');
  var buffer = '';
  
  var accumContent = '';
  var yieldedToolCallIds = new Set();
  var isHidingToolCall = false;
  var hideBuffer = '';
  var inThinkTag = false;

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
            var result = {};
            
            if (delta.phase === 'think') {
              result.thinking = delta.content || '';
            } else if (delta.phase === 'answer') {
              result.content = delta.content || '';
            } else {
              // Standard OpenAI/DeepSeek reasoning content field
              if (delta.reasoning_content !== undefined) {
                result.thinking = delta.reasoning_content;
              }
              
              // Parse XML think tags in delta.content
              if (delta.content !== undefined) {
                var contentStr = delta.content || '';
                var remaining = contentStr;
                var yieldThink = '';
                var yieldAnswer = '';
                
                while (remaining.length > 0) {
                  if (!inThinkTag) {
                    var thinkStartIdx = remaining.indexOf('<think>');
                    if (thinkStartIdx !== -1) {
                      yieldAnswer += remaining.substring(0, thinkStartIdx);
                      inThinkTag = true;
                      remaining = remaining.substring(thinkStartIdx + 7);
                    } else {
                      yieldAnswer += remaining;
                      remaining = '';
                    }
                  } else {
                    var thinkEndIdx = remaining.indexOf('</think>');
                    if (thinkEndIdx !== -1) {
                      yieldThink += remaining.substring(0, thinkEndIdx);
                      inThinkTag = false;
                      remaining = remaining.substring(thinkEndIdx + 8);
                    } else {
                      yieldThink += remaining;
                      remaining = '';
                    }
                  }
                }
                
                if (yieldThink) {
                  result.thinking = (result.thinking || '') + yieldThink;
                }
                if (yieldAnswer) {
                  result.content = (result.content || '') + yieldAnswer;
                }
              }
            }

            // Yield native tool calls if present in the API response
            if (delta.tool_calls) {
              result.tool_calls = delta.tool_calls;
            }

            // Yield text-based tool calls from accumulated content
            if (delta.content) {
              accumContent += delta.content;
              
              var textToProcess = delta.content;
              
              if (!isHidingToolCall) {
                var jsonIdx = textToProcess.indexOf('```json');
                if (jsonIdx !== -1) {
                  var beforeJson = textToProcess.substring(0, jsonIdx);
                  var fromJson = textToProcess.substring(jsonIdx);
                  if (beforeJson) {
                    result.content = beforeJson;
                  } else {
                    delete result.content;
                  }
                  isHidingToolCall = true;
                  hideBuffer = fromJson;
                } else {
                  if (result.content === undefined && delta.content !== undefined) {
                    result.content = delta.content;
                  }
                }
              } else {
                hideBuffer += textToProcess;
                // Don't output any content in this state as it's part of the JSON block
                delete result.content;
                
                var closeIdx = hideBuffer.indexOf('```', 7);
                if (closeIdx !== -1) {
                  var fullBlock = hideBuffer.substring(0, closeIdx + 3);
                  var afterBlock = hideBuffer.substring(closeIdx + 3);
                  
                  var parsedCalls = parseTextToolCalls(fullBlock);
                  if (parsedCalls && parsedCalls.length) {
                    var newCalls = [];
                    for (var tc of parsedCalls) {
                      var uniqId = tc.function.name + '_' + tc.function.arguments;
                      if (!yieldedToolCallIds.has(uniqId)) {
                        yieldedToolCallIds.add(uniqId);
                        tc.index = yieldedToolCallIds.size - 1;
                        newCalls.push(tc);
                      }
                    }
                    if (newCalls.length) {
                      result.tool_calls = newCalls;
                    }
                  } else {
                    // Not a tool call, restore to normal text
                    result.content = fullBlock;
                  }
                  
                  isHidingToolCall = false;
                  hideBuffer = '';
                  
                  if (afterBlock) {
                    var jsonIdx2 = afterBlock.indexOf('```json');
                    if (jsonIdx2 !== -1) {
                      result.content = (result.content || '') + afterBlock.substring(0, jsonIdx2);
                      isHidingToolCall = true;
                      hideBuffer = afterBlock.substring(jsonIdx2);
                    } else {
                      result.content = (result.content || '') + afterBlock;
                    }
                  }
                }
              }
            }

            yield result;
          }
        } catch (e) {
          // skip JSON parsing errors
        }
      }
    }
  }

  // ── Post-stream tool call scan ─────────────────────────────
  // Qwen 3.7 sometimes outputs tool calls without ```json fences
  // (e.g., just `json\n{ "tool_calls": [...] }` or plain JSON).
  // The streaming isHidingToolCall logic above won't catch these.
  // We scan the full accumulated content with the fallback parser.
  if (accumContent) {
    var finalCalls = parseTextToolCalls(accumContent);
    if (finalCalls && finalCalls.length) {
      var newCalls = [];
      for (var tc of finalCalls) {
        var uniqId = tc.function.name + '_' + tc.function.arguments;
        if (!yieldedToolCallIds.has(uniqId)) {
          yieldedToolCallIds.add(uniqId);
          tc.index = yieldedToolCallIds.size - 1;
          newCalls.push(tc);
        }
      }
      if (newCalls.length) {
        yield { tool_calls: newCalls };
      }
    }
  }

  if (isHidingToolCall && hideBuffer) {
    yield { content: hideBuffer };
  }
}

export async function listModels(config) {
  return ['qwen3.7-max', 'qwen-plus', 'qwen-turbo'];
}

export async function embeddings(config, texts) {
  throw new Error('Embeddings not supported by Qwen Browser API');
}

export async function images(config, prompt) {
  throw new Error('Image generation not supported by Qwen Browser API');
}

function getUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Serialize the full messages[] array into a single user message for Qwen.
 * This is our context management: we maintain the conversation history
 * ourselves and embed it entirely into every request, so Qwen always
 * sees the full picture regardless of its own browser context.
 */
function serializeMessages(messages, systemContent, tools) {
  var parts = [];

  // 1. System prompt + override + tools (always included, every turn)
  if (systemContent) {
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
    parts.push(overrideWarning + systemContent);
    if (tools && tools.length) {
      parts.push(formatToolsForPrompt(tools));
    }
  }

  // 2. Extract non-system messages for history
  var convMessages = messages.filter(function(m) { return m.role !== 'system'; });
  if (convMessages.length === 0) {
    // No user messages — just system prompt
    return parts.join('\n\n');
  }

  // 3. Serialize previous messages (all except the last) as conversation history
  var previousMessages = convMessages.slice(0, convMessages.length - 1);
  if (previousMessages.length > 0) {
    var historyParts = ['\n\n--- Previous Conversation ---'];
    for (var i = 0; i < previousMessages.length; i++) {
      var m = previousMessages[i];
      if (m.role === 'user') {
        historyParts.push('\nUser: ' + (m.content || ''));
      } else if (m.role === 'assistant') {
        var assistantText = '\nAssistant: ' + (m.content || '');
        if (m.tool_calls && m.tool_calls.length) {
          for (var tc of m.tool_calls) {
            var fn = tc.function || {};
            assistantText += '\n  [Tool call: ' + (fn.name || '') + ']';
          }
        }
        historyParts.push(assistantText);
      } else if (m.role === 'tool') {
        historyParts.push('\n[System tool execution result]:\n' + (m.content || '').substring(0, 2000) +
                          (m.content && m.content.length > 2000 ? '\n... (output truncated)' : ''));
      }
    }
    parts.push(historyParts.join(''));
  }

  // 4. Last message = current request
  var lastMsg = convMessages[convMessages.length - 1];
  if (lastMsg.role === 'tool') {
    parts.push('\n\n---\n\n[System tool execution result]:\n' + lastMsg.content);
  } else if (lastMsg.role === 'user') {
    parts.push('\n\n---\n\n[User Request]:\n' + lastMsg.content);
  } else if (lastMsg.role === 'assistant') {
    parts.push('\n\n---\n\n[Assistant request]:\n' + (lastMsg.content || ''));
  }

  return parts.join('\n');
}

function formatToolsForPrompt(tools) {
  if (!tools || !tools.length) return '';
  var s = '\n\n## AVAILABLE WORKSPACE TOOLS (for JSON output only)\n' +
          'The following tools are available in this VS Code workspace. ' +
          'To use any of them, include a single JSON code block in your response with the EXACT format shown above.\n' +
          'Tools list:\n';
  tools.forEach(function(t) {
    var fn = t.function;
    s += '\n### ' + fn.name + '\n';
    s += 'Description: ' + fn.description + '\n';
    s += 'Parameters:\n';
    if (fn.parameters && fn.parameters.properties) {
      var props = fn.parameters.properties;
      var required = fn.parameters.required || [];
      Object.keys(props).forEach(function(pName) {
        var p = props[pName];
        var req = required.includes(pName) ? ' (required)' : '';
        s += '- ' + pName + ' (' + p.type + '): ' + (p.description || '') + req + '\n';
      });
    }
  });
  return s;
}

function parseTextToolCalls(text) {
  var toolCalls = [];
  var idx = 0;

  // Match JSON code blocks
  var markdownRegex = /```json\s*(\{[\s\S]*?\})\s*(?:```|$)/g;
  var match;
  while ((match = markdownRegex.exec(text)) !== null) {
    try {
      var obj = JSON.parse(match[1].trim());
      if (obj && Array.isArray(obj.tool_calls)) {
        obj.tool_calls.forEach(function(tc) {
          toolCalls.push({
            id: 'text_call_' + idx++,
            type: 'function',
            function: {
              name: tc.name,
              arguments: typeof tc.arguments === 'object' ? JSON.stringify(tc.arguments) : String(tc.arguments || '')
            }
          });
        });
      }
    } catch (e) {}
  }

  // Fallback to raw JSON block containing tool_calls
  if (toolCalls.length === 0) {
    var firstBrace = text.indexOf('{');
    var lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      var potentialJson = text.substring(firstBrace, lastBrace + 1);
      if (potentialJson.includes('"tool_calls"')) {
        try {
          var obj = JSON.parse(potentialJson.trim());
          if (obj && Array.isArray(obj.tool_calls)) {
            obj.tool_calls.forEach(function(tc) {
              toolCalls.push({
                id: 'text_call_' + idx++,
                type: 'function',
                function: {
                  name: tc.name,
                  arguments: typeof tc.arguments === 'object' ? JSON.stringify(tc.arguments) : String(tc.arguments || '')
                }
              });
            });
          }
        } catch (e) {}
      }
    }
  }
  return toolCalls;
}

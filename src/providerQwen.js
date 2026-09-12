// providerQwen.js — Qwen Browser API Client for Qwen CodeRun Extension
// Mimics the reverse-engineered python session completions API.

import { handleApiResponseError } from './utils.js';

let activeQwenChatId = null;

function isValidQwenChatId(id) {
  if (!id || typeof id !== 'string') {
    return false;
  }
  if (id.startsWith('new-') || id.startsWith('conv_') || id.startsWith('session_')) {
    return false;
  }
  var uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

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
  if (isValidQwenChatId(config.chatId)) {
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

  var bxUa = '234!t6OeKjrieePWr1PjjV4mwLmK48zJRd8FTTr55qiMD9dRMXOLA/2rqixq7SAwJ9Ie1K64UlwUoXPgZeWAEjvyoxLuZOvpd5Li3S7UmQHGnXrd8TjDjnf6DtXpsQFHAkJKSzIP7S9jnBDpHYqJUOPFBOCiGhtfHaCKmkPWTx0DNQmOJJ6J/DT9rLgFeZUrIbWX0La5AgVA/1IZn3UH9AJ7hwN+OUcOCd2gcP0aOQJNirLZZ3wH9idThpoZnkp/cAjenL5cQCyNescZn3UH9AVE6sZZ8ks/c24HeIoHOQYNhstZZ3wd9iJTCP2ZQkkwgsXH+lodOQ5NhsgiZ6Wd9iyoCvr+8Lkfcs4H+JWyQCyNhsfkZ3wd9ib2CvV+vkkhc2r7ZZodQCymhxuZVkUd9Ad7TZzZQkpvxOuyHVEHQQVmhxWZn3UJI4C8jRxZQ+kvc24TieCdQQymhskreLwH9idThnoZQpp/cs47ZJDxQC5Ovf1vSy+kKwbbBIoZQpsvc2PTYGwTQoVIhMaUekUM98edFVtZVY3QcM5Tn3ZEQCNmNkCZYLb39AdThrnZQLrOcMPTB/o9QCymhuxZekUH9AHb2c/NOARsoNvDAdHUePkbWoOvsUH2XTnfgIWAfVFu+7vqgyhrvdNaW1pb2jDq8ruAgAY5azNqoO5XcVVuBwmfEiIyAT+EVuc7En+OfbGuJRvv5eCurEmM6IkXp48DiBkI9qjmQe1Y+VHVhs/1mBaXBja/dqTPGVt4sr/ggEWFukX29KKoboI445AKjgR3DUpzecCEP/6DcMjKvzzzIm3CHOn7ZZwnAdIkdzKfclmLqfz3ALiWyQTQSxrRugB27Z3aVM6QX5+mlbtp3ZDoNas4u3vjUgueEk/E8xmyj0fEbnC/cKPbuxNTRgMZgHiCkXO4jEg7TtmXbdH4e1H6pqxqyj357FwExCtVNILqE7qcmw5OfLwSC1WHq1va5AlhdlcAZKAefbYnNbflnj+fVli6XfIl0KmzzzdsrLa3B8EESE1EkyPzTvfz0Bcn8RUYGKijqXyAdM7RAbAQhrNzGzRFBVVZoubREv1+sSc3zCsyXRPS8GIE5rqKO2PQZcoHZ5Xfw2VlBhiYGo3KhbTtZmZmOcixLj61U1wYqpFp7jspa+4SPJtl9gGKoHrQGja1hTIhiw/32YdoX2HKeemUWwSBo30Et+r4L+9usjb+NH4Oflq0UXtarsdCq1QElvpdA9BxqUXX+h/SzEqx4suD6IK8ORThuszcuzB9ukGKTX5jDE7+pQF8sEUdnQh1zXx/KN2PcYI0+Yw769RxwUb7zsWqo9z0ahlY52Cddr8j7fFkq9gVajuHmXuGRJUXDgJnHDqIpQs3sGYYTs0QJdNF5jq4xLNfcqugoNZMcDPu6V6Qeol1PagMdE+ssx4muDCuolycTXkqX7yAe+YwFjrMZWtb5Yyik/aKsqfD8ewvHpRwQGfP2oD4+J1VPG1BL6EgUJKqzf+M8xDgY0FmdYMJHrirYMf6gDdjlsmdio3LVCn28kaL/pn5HZSqzUIwvMjfw6olekKL5l0l6gOdSc/4c6xkXRjkkcK0vie+saJ2pavuiBKTxgyS/50k6QPKQnBWC19dG5R9GPZ1ZXEnnPVfGMWbBYgRXic6BjHjx7/jzSG57rtvtDMj4NhVsGVFYSAbMxWGFvn3THyqv37zsoYvmB5wrR9qWoDTV+p6pCtElyuS/oVYbLVIhrORf3hlsjrm+hvQk1XwIvKQIRqX2vy3ScanXL5QHDwiNc3kc8nTdSrczDzmCjp3GWbkkwqyMSIELCzI5NVPtMPl3fb5jNwgAhek';
  var bxUmidtoken = 'T2gAKSKQ-DRnLVZ5DYO63YR7SODE7IYEVg07M27F3ju0tJ5h6Z1NtMNDO8ocN4JoarA=';

  for (var pIdx = 0; pIdx < parts.length; pIdx++) {
    var pItem = parts[pIdx].trim();
    if (pItem.startsWith('bx_ua=')) bxUa = pItem.substring(6);
    if (pItem.startsWith('bx_umidtoken=')) bxUmidtoken = pItem.substring(13);
  }

  // Helper to build headers
  function getHeaders(chatId) {
    var h = {
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
    if (token) h['Authorization'] = 'Bearer ' + token;
    if (chatId) {
      h['Referer'] = 'https://chat.qwen.ai/c/' + chatId;
    } else {
      h['Referer'] = 'https://chat.qwen.ai/';
    }
    return h;
  }

  var qwenModel = config.model || 'qwen3.7-plus';

  async function createNewQwenChat() {
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
    
    var newChatContentType = (newChatRes.headers.get('content-type') || '').toLowerCase();
    if (!newChatRes.ok) {
      if (newChatRes.status === 401 || newChatRes.status === 403) {
        var authErr1 = new Error('Qwen session token expired. Please log in again.');
        authErr1.isAuthError = true;
        authErr1.code = 'UNAUTHORIZED';
        throw authErr1;
      }
      throw new Error('HTTP error creating chat: ' + newChatRes.status);
    }

    if (newChatContentType.indexOf('text/html') !== -1) {
      var wafErr = new Error('Alibaba Cloud security verification required. Please complete verification in browser.');
      wafErr.isCaptcha = true;
      wafErr.captchaUrl = 'https://chat.qwen.ai';
      throw wafErr;
    }
    
    var newChatData = await newChatRes.json();
    if (newChatData && newChatData.success && newChatData.data && newChatData.data.id) {
      activeQwenChatId = newChatData.data.id;
      config.chatId = activeQwenChatId;
      return activeQwenChatId;
    } else {
      var errRet = JSON.stringify(newChatData && newChatData.ret || '');
      var errUrl = (newChatData && newChatData.data && newChatData.data.url) || '';
      if (errRet.indexOf('FAIL_SYS_USER_VALIDATE') !== -1 || errUrl.indexOf('captcha') !== -1 || errUrl.indexOf('punish') !== -1) {
        var captchaErr = new Error('Alibaba Cloud security verification required (slider captcha).');
        captchaErr.isCaptcha = true;
        captchaErr.captchaUrl = errUrl || 'https://chat.qwen.ai';
        throw captchaErr;
      }
      var errCode = newChatData && newChatData.data && newChatData.data.code;
      var errDetails = newChatData && newChatData.data && newChatData.data.details;
      if (errCode === 'unauthorized') {
        var authErr2 = new Error('Qwen session token expired. Please log in again.');
        authErr2.isAuthError = true;
        authErr2.code = 'UNAUTHORIZED';
        throw authErr2;
      }
      throw new Error('Qwen failed to return a new Chat ID: ' + (errDetails || JSON.stringify(newChatData)));
    }
  }

  // If no valid chat_id exists, initialize a new chat session on Qwen
  if (!activeQwenChatId) {
    try {
      await createNewQwenChat();
    } catch (err) {
      if (err.isAuthError || err.isCaptcha) {
        throw err;
      }
      var msg = err.message || '';
      if (msg.indexOf('unauthorized') !== -1) {
        var expErr = new Error('Qwen session token expired. Please log in again.');
        expErr.isAuthError = true;
        expErr.code = 'UNAUTHORIZED';
        throw expErr;
      }
      throw new Error('Failed to initialize Qwen chat session: ' + err.message);
    }
  }

  // Now query completions inside this chat ID
  var url = 'https://chat.qwen.ai/api/v2/chat/completions?chat_id=' + activeQwenChatId;

  // Send the FULL serialized conversation as a single user message.
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
      thinking_enabled: false
    },
    extra: { meta: { subChatType: 't2t' } },
    sub_chat_type: 't2t',
    parent_id: null
  };

  var body = {
    chatId: activeQwenChatId,
    chat_id: activeQwenChatId,
    chat_mode: 'normal',
    incremental_output: true,
    model: qwenModel,
    stream: true,
    version: '2.1',
    parent_id: null,
    messages: [payloadMsg],
    timestamp: Date.now()
  };

  var response = await fetch(url, {
    method: 'POST',
    headers: getHeaders(activeQwenChatId),
    body: JSON.stringify(body)
  });

  var contentType = (response.headers.get('content-type') || '').toLowerCase();

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      var authErr3 = new Error('Qwen session token expired. Please log in again.');
      authErr3.isAuthError = true;
      authErr3.code = 'UNAUTHORIZED';
      throw authErr3;
    }
    if (response.status === 400 || response.status === 404) {
      console.log('[QWEN] Chat session returned HTTP ' + response.status + '. Automatically creating a fresh session...');
      await createNewQwenChat();
      url = 'https://chat.qwen.ai/api/v2/chat/completions?chat_id=' + activeQwenChatId;
      body.chatId = activeQwenChatId;
      body.chat_id = activeQwenChatId;
      response = await fetch(url, {
        method: 'POST',
        headers: getHeaders(activeQwenChatId),
        body: JSON.stringify(body)
      });
      contentType = (response.headers.get('content-type') || '').toLowerCase();
    }
    if (!response.ok) {
      throw await handleApiResponseError(response, 'Qwen');
    }
  }

  // Handle non-SSE responses returned with HTTP 200 (Alibaba Captcha / WAF blocks / JSON errors)
  if (contentType.indexOf('application/json') !== -1) {
    var jsonErrData = {};
    try {
      jsonErrData = await response.json();
    } catch (_) {}

    var retStr = JSON.stringify(jsonErrData.ret || '');
    var dataUrl = (jsonErrData.data && jsonErrData.data.url) || '';
    if (retStr.indexOf('FAIL_SYS_USER_VALIDATE') !== -1 || dataUrl.indexOf('captcha') !== -1 || dataUrl.indexOf('punish') !== -1) {
      var compCaptchaErr = new Error('Alibaba Cloud security verification required (slider captcha).');
      compCaptchaErr.isCaptcha = true;
      compCaptchaErr.captchaUrl = dataUrl || 'https://chat.qwen.ai';
      compCaptchaErr.chatId = activeQwenChatId;
      throw compCaptchaErr;
    }

    var code = (jsonErrData.data && jsonErrData.data.code) || jsonErrData.code || '';
    var details = (jsonErrData.data && jsonErrData.data.details) || jsonErrData.message || jsonErrData.details || '';

    if (details && (details.indexOf('deleted') !== -1 || details.indexOf('not found') !== -1 || details.indexOf('not exist') !== -1)) {
      console.log('[QWEN] Chat session was deleted or not found. Automatically creating a fresh session...');
      await createNewQwenChat();
      url = 'https://chat.qwen.ai/api/v2/chat/completions?chat_id=' + activeQwenChatId;
      body.chatId = activeQwenChatId;
      body.chat_id = activeQwenChatId;
      response = await fetch(url, {
        method: 'POST',
        headers: getHeaders(activeQwenChatId),
        body: JSON.stringify(body)
      });
      contentType = (response.headers.get('content-type') || '').toLowerCase();
      if (contentType.indexOf('application/json') !== -1) {
        try {
          jsonErrData = await response.json();
          code = (jsonErrData.data && jsonErrData.data.code) || jsonErrData.code || '';
          details = (jsonErrData.data && jsonErrData.data.details) || jsonErrData.message || jsonErrData.details || '';
        } catch (_) {}
      }
    }

    if (code === 'unauthorized') {
      var authErrJson = new Error('Qwen session token expired. Please log in again.');
      authErrJson.isAuthError = true;
      authErrJson.code = 'UNAUTHORIZED';
      throw authErrJson;
    }

    if (contentType.indexOf('application/json') !== -1) {
      throw new Error('Qwen API Error: ' + (details || JSON.stringify(jsonErrData)));
    }
  }

  if (contentType.indexOf('text/html') !== -1) {
    var compHtmlErr = new Error('Alibaba Cloud security challenge detected (WAF HTML). Please complete verification in browser.');
    compHtmlErr.isCaptcha = true;
    compHtmlErr.captchaUrl = 'https://chat.qwen.ai';
    throw compHtmlErr;
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
          if (data && data.success === false) {
            var sseErrMsg = (data.data && data.data.details) || data.message || data.details || JSON.stringify(data);
            var sseErr = new Error(sseErrMsg);
            if (data.code === 'unauthorized' || (data.data && data.data.code === 'unauthorized') || (typeof sseErrMsg === 'string' && (sseErrMsg.indexOf('expired') !== -1 || sseErrMsg.indexOf('unauthorized') !== -1))) {
              sseErr.isAuthError = true;
              sseErr.code = 'UNAUTHORIZED';
            }
            throw sseErr;
          }
          if (data && data.ret && JSON.stringify(data.ret).indexOf('FAIL_SYS_USER_VALIDATE') !== -1) {
            var sseCaptchaErr = new Error('Alibaba Cloud slider verification required.');
            sseCaptchaErr.isCaptcha = true;
            sseCaptchaErr.captchaUrl = (data.data && data.data.url) || 'https://chat.qwen.ai';
            throw sseCaptchaErr;
          }
          if (data && data.code === 'unauthorized') {
            var sseAuthErr = new Error('Qwen session token expired. Please log in again.');
            sseAuthErr.isAuthError = true;
            sseAuthErr.code = 'UNAUTHORIZED';
            throw sseAuthErr;
          }
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
    accumContent += hideBuffer;
  }

  if (!accumContent && yieldedToolCallIds.size === 0) {
    var emptyStreamErr = new Error('Qwen returned an empty response. The connection may have timed out or been interrupted.');
    emptyStreamErr.isAuthError = false;
    throw emptyStreamErr;
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

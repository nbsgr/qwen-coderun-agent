// providerQwen.js — Qwen Browser API Client for Qwen CodeRun Extension
// Mimics the reverse-engineered python session completions API.

import { handleApiResponseError } from './utils.js';
import OSS from 'ali-oss';
import fs from 'fs';
import path from 'path';

let activeQwenChatId = null;
var ossFileCache = new Map();

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

function getFileBuffer(fileInput) {
  if (!fileInput) return null;
  if (Buffer.isBuffer(fileInput)) return fileInput;
  if (typeof fileInput === 'string') {
    if (fileInput.startsWith('data:')) {
      var commaIdx = fileInput.indexOf(',');
      if (commaIdx !== -1) {
        return Buffer.from(fileInput.substring(commaIdx + 1), 'base64');
      }
    }
    if (/^[A-Za-z0-9+/=]+$/.test(fileInput.trim()) && fileInput.length > 50) {
      try {
        return Buffer.from(fileInput.trim(), 'base64');
      } catch (_) {}
    }
    try {
      if (fs.existsSync(fileInput)) {
        return fs.readFileSync(fileInput);
      }
    } catch (_) {}
  }
  if (fileInput && fileInput.data) {
    return getFileBuffer(fileInput.data);
  }
  return null;
}

function inferMimeType(filename, fileInput) {
  if (typeof fileInput === 'string' && fileInput.startsWith('data:')) {
    var match = fileInput.match(/^data:([^;]+);/);
    if (match) return match[1];
  }
  if (fileInput && fileInput.type) return fileInput.type;
  var ext = (filename || '').split('.').pop().toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'bmp') return 'image/bmp';
  if (ext === 'svg') return 'image/svg+xml';
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'txt') return 'text/plain';
  if (ext === 'md') return 'text/markdown';
  if (ext === 'json') return 'application/json';
  if (ext === 'csv') return 'text/csv';
  if (ext === 'doc') return 'application/msword';
  if (ext === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  return 'application/octet-stream';
}

async function uploadFileToQwenOss(fileInput, customName, headers) {
  var buffer = getFileBuffer(fileInput);
  if (!buffer || buffer.length === 0) return null;

  var filename = customName || (fileInput && fileInput.name) || 'attachment_' + Date.now();
  var mimeType = inferMimeType(filename, fileInput);
  if (mimeType.startsWith('image/') && !filename.includes('.')) {
    var ext = mimeType.split('/')[1] || 'png';
    filename += '.' + ext;
  } else if (mimeType === 'application/pdf' && !filename.toLowerCase().endsWith('.pdf')) {
    filename += '.pdf';
  }

  var cacheKey = filename + '_' + buffer.length + '_' + buffer.subarray(0, 32).toString('hex');
  if (ossFileCache.has(cacheKey)) {
    console.log('[QWEN OSS] Using cached uploaded file:', filename);
    return ossFileCache.get(cacheKey);
  }

  console.log('[QWEN OSS] Requesting STS token for', filename, 'size:', buffer.length, 'type:', mimeType);
  var stsRes = await fetch('https://chat.qwen.ai/api/v2/files/getstsToken', {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({
      filename: filename,
      filesize: String(buffer.length),
      filetype: mimeType
    })
  });

  if (!stsRes.ok) {
    console.error('[QWEN OSS] Failed to get STS token. HTTP', stsRes.status);
    return null;
  }

  var stsData = await stsRes.json();
  if (!stsData || !stsData.success || !stsData.data) {
    console.error('[QWEN OSS] getstsToken error:', stsData);
    return null;
  }

  var d = stsData.data;
  var client = new OSS({
    authorizationV4: true,
    region: d.region,
    endpoint: d.endpoint,
    accessKeyId: d.access_key_id,
    accessKeySecret: d.access_key_secret,
    stsToken: d.security_token,
    bucket: d.bucketname
  });

  var putRes = await client.put(d.file_path, buffer);
  if (!putRes || !putRes.res || putRes.res.status !== 200) {
    console.error('[QWEN OSS] OSS client.put failed:', putRes);
    return null;
  }

  var isVision = mimeType.startsWith('image/');
  var fileObj = {
    id: d.file_id,
    name: filename,
    file_type: mimeType,
    type: isVision ? 'image' : 'file',
    file_class: isVision ? 'vision' : 'document',
    size: buffer.length,
    url: d.file_url,
    status: 'uploaded',
    showType: isVision ? 'image' : 'file'
  };

  ossFileCache.set(cacheKey, fileObj);
  console.log('[QWEN OSS] Uploaded successfully! File ID:', d.file_id);
  return fileObj;
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

  // Collect all files/images from messages to upload to Qwen OSS (deduplicated)
  var pendingUploads = [];
  var seenDataMap = new Set();

  function addPendingUpload(item, defaultName) {
    if (!item) return;
    var rawData = item.data || item;
    var dataSig = (typeof rawData === 'string') ? (rawData.substring(0, 100) + '_' + rawData.length) : String(rawData);
    if (seenDataMap.has(dataSig)) return;
    seenDataMap.add(dataSig);
    if (typeof item === 'object' && item.data) {
      pendingUploads.push(item);
    } else {
      pendingUploads.push({ data: item, name: defaultName });
    }
  }

  for (var mIdx = 0; mIdx < messages.length; mIdx++) {
    var msgItem = messages[mIdx];
    if (msgItem.role === 'user') {
      if (msgItem.attachments && Array.isArray(msgItem.attachments)) {
        for (var attIdx = 0; attIdx < msgItem.attachments.length; attIdx++) {
          addPendingUpload(msgItem.attachments[attIdx], 'attachment_' + (attIdx + 1));
        }
      } else if (msgItem.attachment) {
        addPendingUpload(msgItem.attachment, 'attachment');
      }
      if (msgItem.images && Array.isArray(msgItem.images)) {
        for (var imgIdx = 0; imgIdx < msgItem.images.length; imgIdx++) {
          addPendingUpload(msgItem.images[imgIdx], 'image_' + (imgIdx + 1) + '.png');
        }
      } else if (msgItem.image) {
        addPendingUpload(msgItem.image, 'image.png');
      }
      if (msgItem.files && Array.isArray(msgItem.files)) {
        for (var fIdx = 0; fIdx < msgItem.files.length; fIdx++) {
          addPendingUpload(msgItem.files[fIdx], 'file_' + (fIdx + 1));
        }
      }
    }
  }

  var qwenFiles = [];
  var seenFileIds = new Set();
  if (pendingUploads.length > 0) {
    var uploadHeaders = getHeaders(activeQwenChatId);
    for (var u = 0; u < pendingUploads.length; u++) {
      try {
        var uploadItem = pendingUploads[u];
        var uploadedFileObj = await uploadFileToQwenOss(uploadItem, uploadItem.name, uploadHeaders);
        if (uploadedFileObj && !seenFileIds.has(uploadedFileObj.id)) {
          seenFileIds.add(uploadedFileObj.id);
          qwenFiles.push(uploadedFileObj);
        }
      } catch (uploadErr) {
        console.error('[QWEN] Error uploading file to OSS:', uploadErr);
      }
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
    files: qwenFiles,
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

    var isSessionStuck = details && (
      details.indexOf('deleted') !== -1 ||
      details.indexOf('not found') !== -1 ||
      details.indexOf('not exist') !== -1 ||
      details.indexOf('in progress') !== -1 ||
      details.indexOf('in_progress') !== -1
    );

    if (isSessionStuck) {
      console.log('[QWEN] Chat session error or in-progress (' + details + '). Freeing session and creating fresh chat...');
      try {
        await fetch('https://chat.qwen.ai/api/v2/chat/completions/stop', {
          method: 'POST',
          headers: getHeaders(activeQwenChatId),
          body: JSON.stringify({ chat_id: activeQwenChatId })
        });
      } catch (_) {}

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
  var extractor = createJsonStreamExtractor();
  var streamedAnyThinking = false;
  var streamedAnyContent = false;
  var streamedImageUrls = new Set();

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

          var choice = data.choices && data.choices[0];
          if (choice) {
            var delta = choice.delta || {};
            var deltaContent = delta.content || '';
            var deltaExtra = delta.extra || {};

            // Platform Pass-Through: If Qwen server generated an image in image_gen_tool phase
            if (delta.phase === 'image_gen_tool' || deltaExtra.image_list || deltaExtra.tool_result) {
              var imgList = deltaExtra.image_list || deltaExtra.tool_result || [];
              for (var imgIdx = 0; imgIdx < imgList.length; imgIdx++) {
                var imgUrl = imgList[imgIdx] && (imgList[imgIdx].image || imgList[imgIdx].url);
                if (imgUrl && !streamedImageUrls.has(imgUrl)) {
                  streamedImageUrls.add(imgUrl);
                  var imgMd = '\n\n![Generated Image](' + imgUrl + ')\n\n';
                  yield { content: imgMd };
                }
              }
            }

            if (deltaContent) {
              accumContent += deltaContent;
              var streamed = extractor.push(deltaContent);
              var result = {};
              if (streamed.thinking) {
                result.thinking = streamed.thinking;
                streamedAnyThinking = true;
              }
              if (streamed.content) {
                result.content = streamed.content;
                streamedAnyContent = true;
              }
              if (result.thinking || result.content) {
                yield result;
              }
            }
          }
        } catch (e) {
          if (e.isAuthError || e.isCaptcha) throw e;
        }
      }
    }
  }

  // ── Post-stream parse: Process accumulated response as OpenAI chat.completion JSON ──
  var parsed = cleanAndParseOpenAiJson(accumContent);
  if (parsed && parsed.choices && parsed.choices[0] && parsed.choices[0].message) {
    var msg = parsed.choices[0].message;
    var postResult = {};

    if (msg.reasoning && !streamedAnyThinking) {
      postResult.thinking = msg.reasoning;
    }
    if (msg.content && !streamedAnyContent) {
      postResult.content = msg.content;
    }
    if (postResult.thinking || postResult.content) {
      yield postResult;
    }

    if (msg.tool_calls && Array.isArray(msg.tool_calls) && msg.tool_calls.length) {
      var formattedCalls = [];
      for (var tcIdx = 0; tcIdx < msg.tool_calls.length; tcIdx++) {
        var rawTc = msg.tool_calls[tcIdx];
        var fn = rawTc.function || rawTc;
        var args = fn.arguments;
        if (typeof args === 'object' && args !== null) {
          args = JSON.stringify(args);
        }
        var callId = rawTc.id || 'call_' + tcIdx;
        formattedCalls.push({
          id: callId,
          type: 'function',
          index: tcIdx,
          function: {
            name: fn.name,
            arguments: String(args || '')
          }
        });
      }
      yield { tool_calls: formattedCalls };
    }
  } else {
    // Fallback: If not OpenAI format JSON, check for text-based markdown tool calls
    var fallbackCalls = parseTextToolCalls(accumContent);
    if (fallbackCalls && fallbackCalls.length) {
      yield { tool_calls: fallbackCalls };
    } else if (!streamedAnyContent && accumContent) {
      // If accumContent looks like an unparsed OpenAI completion envelope, rescue its content or tools!
      var trimmed = accumContent.trim();
      if (trimmed.startsWith('{') && (trimmed.includes('"chatcmpl') || trimmed.includes('"choices"') || trimmed.includes('"message"'))) {
        var rescuedTools = extractToolCallsField(trimmed);
        if (rescuedTools && rescuedTools.length > 0) {
          yield { tool_calls: rescuedTools };
        } else {
          var rescuedContent = extractContentField(trimmed);
          if (rescuedContent) {
            yield { content: rescuedContent };
          }
        }
      } else {
        yield { content: accumContent };
      }
    }
  }

  if (!accumContent) {
    var emptyStreamErr = new Error('Qwen returned an empty response. The connection may have timed out or been interrupted.');
    emptyStreamErr.isAuthError = false;
    throw emptyStreamErr;
  }
}

export async function listModels(config) {
  var defaultModels = [
    'qwen3.7-plus',
    'qwen3.8-max',
    'qwen3.8-omni-flash',
    'qwen3.7-max',
    'qwen3.6-plus',
    'qwen3.5-plus',
    'qwen3.5-omni-plus'
  ];
  try {
    var cookieStr = (config && config.apiKey) || '';
    if (!cookieStr) return defaultModels;
    var token = '';
    var parts = cookieStr.split(';');
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].trim();
      if (p.startsWith('token=')) token = p.substring(6);
      if (!token && p.startsWith('active_token=')) token = p.substring(13);
    }
    var headers = {
      'Accept': 'application/json',
      'Cookie': cookieStr,
      'Origin': 'https://chat.qwen.ai',
      'Referer': 'https://chat.qwen.ai/'
    };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    var res = await fetch('https://chat.qwen.ai/api/v2/models', { headers: headers });
    if (!res.ok) return defaultModels;
    var json = await res.json();
    var list = (json && json.data && Array.isArray(json.data.data)) ? json.data.data : ((json && Array.isArray(json.data)) ? json.data : []);
    if (list && list.length > 0) {
      var models = [];
      for (var j = 0; j < list.length; j++) {
        var item = list[j];
        if (item && item.id) models.push(item.id);
      }
      return models.length > 0 ? models : defaultModels;
    }
  } catch (_) {}
  return defaultModels;
}

export async function embeddings(config, texts) {
  throw new Error('Embeddings not supported by Qwen Browser API');
}

export async function images(config, prompt) {
  config = config || {};
  var cookieStr = config.apiKey || '';
  if (!cookieStr && typeof globalThis.qwenGetActiveCookie === 'function') {
    cookieStr = globalThis.qwenGetActiveCookie() || '';
  }
  if (!cookieStr) {
    throw new Error('Qwen session token or cookie required for image generation.');
  }

  cookieStr = cookieStr.trim();
  if (cookieStr.startsWith('eyJ')) {
    cookieStr = 'token=' + cookieStr;
  }

  var token = '';
  var parts = cookieStr.split(';');
  var bxUa = '234!t6OeKjrieePWr1PjjV4mwLmK48zJRd8FTTr55qiMD9dRMXOLA/2rqixq7SAwJ9Ie1K64UlwUoXPgZeWAEjvyoxLuZOvpd5Li3S7UmQHGnXrd8TjDjnf6DtXpsQFHAkJKSzIP7S9jnBDpHYqJUOPFBOCiGhtfHaCKmkPWTx0DNQmOJJ6J/DT9rLgFeZUrIbWX0La5AgVA/1IZn3UH9AJ7hwN+OUcOCd2gcP0aOQJNirLZZ3wH9idThpoZnkp/cAjenL5cQCyNescZn3UH9AVE6sZZ8ks/c24HeIoHOQYNhstZZ3wd9iJTCP2ZQkkwgsXH+lodOQ5NhsgiZ6Wd9iyoCvr+8Lkfcs4H+JWyQCyNhsfkZ3wd9ib2CvV+vkkhc2r7ZZodQCymhxuZVkUd9Ad7TZzZQkpvxOuyHVEHQQVmhxWZn3UJI4C8jRxZQ+kvc24TieCdQQymhskreLwH9idThnoZQpp/cs47ZJDxQC5Ovf1vSy+kKwbbBIoZQpsvc2PTYGwTQoVIhMaUekUM98edFVtZVY3QcM5Tn3ZEQCNmNkCZYLb39AdThrnZQLrOcMPTB/o9QCymhuxZekUH9AHb2c/NOARsoNvDAdHUePkbWoOvsUH2XTnfgIWAfVFu+7vqgyhrvdNaW1pb2jDq8ruAgAY5azNqoO5XcVVuBwmfEiIyAT+EVuc7En+OfbGuJRvv5eCurEmM6IkXp48DiBkI9qjmQe1Y+VHVhs/1mBaXBja/dqTPGVt4sr/ggEWFukX29KKoboI445AKjgR3DUpzecCEP/6DcMjKvzzzIm3CHOn7ZZwnAdIkdzKfclmLqfz3ALiWyQTQSxrRugB27Z3aVM6QX5+mlbtp3ZDoNas4u3vjUgueEk/E8xmyj0fEbnC/cKPbuxNTRgMZgHiCkXO4jEg7TtmXbdH4e1H6pqxqyj357FwExCtVNILqE7qcmw5OfLwSC1WHq1va5AlhdlcAZKAefbYnNbflnj+fVli6XfIl0KmzzzdsrLa3B8EESE1EkyPzTvfz0Bcn8RUYGKijqXyAdM7RAbAQhrNzGzRFBVVZoubREv1+sSc3zCsyXRPS8GIE5rqKO2PQZcoHZ5Xfw2VlBhiYGo3KhbTtZmZmOcixLj61U1wYqpFp7jspa+4SPJtl9gGKoHrQGja1hTIhiw/32YdoX2HKeemUWwSBo30Et+r4L+9usjb+NH4Oflq0UXtarsdCq1QElvpdA9BxqUXX+h/SzEqx4suD6IK8ORThuszcuzB9ukGKTX5jDE7+pQF8sEUdnQh1zXx/KN2PcYI0+Yw769RxwUb7zsWqo9z0ahlY52Cddr8j7fFkq9gVajuHmXuGRJUXDgJnHDqIpQs3sGYYTs0QJdNF5jq4xLNfcqugoNZMcDPu6V6Qeol1PagMdE+ssx4muDCuolycTXkqX7yAe+YwFjrMZWtb5Yyik/aKsqfD8ewvHpRwQGfP2oD4+J1VPG1BL6EgUJKqzf+M8xDgY0FmdYMJHrirYMf6gDdjlsmdio3LVCn28kaL/pn5HZSqzUIwvMjfw6olekKL5l0l6gOdSc/4c6xkXRjkkcK0vie+saJ2pavuiBKTxgyS/50k6QPKQnBWC19dG5R9GPZ1ZXEnnPVfGMWbBYgRXic6BjHjx7/jzSG57rtvtDMj4NhVsGVFYSAbMxWGFvn3THyqv37zsoYvmB5wrR9qWoDTV+p6pCtElyuS/oVYbLVIhrORf3hlsjrm+hvQk1XwIvKQIRqX2vy3ScanXL5QHDwiNc3kc8nTdSrczDzmCjp3GWbkkwqyMSIELCzI5NVPtMPl3fb5jNwgAhek';
  var bxUmidtoken = 'T2gAKSKQ-DRnLVZ5DYO63YR7SODE7IYEVg07M27F3ju0tJ5h6Z1NtMNDO8ocN4JoarA=';

  for (var pIdx = 0; pIdx < parts.length; pIdx++) {
    var pItem = parts[pIdx].trim();
    if (pItem.startsWith('token=')) token = pItem.substring(6);
    if (pItem.startsWith('bx_ua=')) bxUa = pItem.substring(6);
    if (pItem.startsWith('bx_umidtoken=')) bxUmidtoken = pItem.substring(13);
  }

  function getReqHeaders(targetChatId) {
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
    if (targetChatId) {
      h['Referer'] = 'https://chat.qwen.ai/c/' + targetChatId;
    } else {
      h['Referer'] = 'https://chat.qwen.ai/';
    }
    return h;
  }

  // Always create an isolated, dedicated chat session for image generation so it never
  // collides with or locks the active agent conversation!
  var createRes = await fetch('https://chat.qwen.ai/api/v2/chats/new', {
    method: 'POST',
    headers: getReqHeaders(),
    body: JSON.stringify({
      title: 'Image: ' + (prompt ? prompt.slice(0, 30) : 'Generation'),
      models: [config.model || 'qwen3.7-max'],
      chat_mode: 'normal',
      chat_type: 't2t',
      timestamp: Date.now()
    })
  });
  var createData = await createRes.json();
  if (!createData || !createData.success || !createData.data || !createData.data.id) {
    var errMsg = (createData && createData.data && createData.data.details) || JSON.stringify(createData);
    throw new Error('Failed to create Qwen chat session for image generation: ' + errMsg);
  }
  var chatId = createData.data.id;

  var payloadMsg = {
    fid: getUuid(),
    parentId: null,
    childrenIds: [getUuid()],
    role: 'user',
    content: 'generate an image of ' + prompt,
    user_action: 'chat',
    files: [],
    timestamp: Date.now(),
    models: [config.model || 'qwen3.7-max'],
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
    chatId: chatId,
    chat_id: chatId,
    chat_mode: 'normal',
    incremental_output: true,
    model: config.model || 'qwen3.7-max',
    stream: true,
    version: '2.1',
    parent_id: null,
    messages: [payloadMsg],
    timestamp: Date.now()
  };

  var response = await fetch('https://chat.qwen.ai/api/v2/chat/completions?chat_id=' + chatId, {
    method: 'POST',
    headers: getReqHeaders(chatId),
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error('Qwen Image Gen Error: HTTP ' + response.status);
  }

  var reader = response.body.getReader();
  var decoder = new TextDecoder('utf-8');
  var buffer = '';
  var foundImageUrl = null;

  while (true) {
    var chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    var lines = buffer.split('\n');
    buffer = lines.pop();
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line || !line.startsWith('data:')) continue;
      var dataStr = line.substring(5).trim();
      if (dataStr === '[DONE]') break;
      try {
        var parsed = JSON.parse(dataStr);
        var delta = (parsed.choices && parsed.choices[0] && parsed.choices[0].delta) || {};
        var deltaExtra = delta.extra || {};
        if (delta.phase === 'image_gen_tool' || deltaExtra.image_list || deltaExtra.tool_result) {
          var imgList = deltaExtra.image_list || deltaExtra.tool_result || [];
          for (var imgIdx = 0; imgIdx < imgList.length; imgIdx++) {
            var candidateUrl = imgList[imgIdx] && (imgList[imgIdx].image || imgList[imgIdx].url);
            if (candidateUrl) {
              foundImageUrl = candidateUrl;
              break;
            }
          }
        }
        if (!foundImageUrl && delta.content) {
          var directMatch = delta.content.match(/(https:\/\/cdn\.qwenlm\.ai\/output\/[^\s"')]+)/) ||
                            delta.content.match(/!\[.*?\]\((https?:\/\/[^\s"')]+)\)/);
          if (directMatch) {
            foundImageUrl = directMatch[1];
          }
        }
      } catch (_) {}
    }
    if (foundImageUrl) break;
  }

  if (foundImageUrl) {
    return { data: [{ url: foundImageUrl }] };
  }
  throw new Error('Qwen did not return an image URL for the requested prompt.');
}

export async function stopChat(config) {
  if (!activeQwenChatId) return;
  try {
    var cookieStr = (config && config.apiKey) || (typeof globalThis.qwenGetActiveCookie === 'function' && globalThis.qwenGetActiveCookie()) || '';
    if (!cookieStr) return;
    cookieStr = cookieStr.trim();
    if (cookieStr.startsWith('eyJ')) cookieStr = 'token=' + cookieStr;
    var token = '';
    var parts = cookieStr.split(';');
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].trim();
      if (p.startsWith('token=')) {
        token = p.substring(6);
        break;
      }
    }
    var headers = {
      'Accept': 'application/json, */*',
      'Content-Type': 'application/json',
      'Cookie': cookieStr,
      'Origin': 'https://chat.qwen.ai',
      'Referer': 'https://chat.qwen.ai/c/' + activeQwenChatId
    };
    if (token) headers['Authorization'] = 'Bearer ' + token;

    await fetch('https://chat.qwen.ai/api/v2/chat/completions/stop', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ chat_id: activeQwenChatId })
    });
    console.log('[QWEN] Successfully sent stop signal for chat ' + activeQwenChatId);
  } catch (e) {
    console.warn('[QWEN] Could not send stop signal:', e.message);
  }
}

function getUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function createJsonStreamExtractor() {
  var buffer = '';
  var streamedThinkingLength = 0;
  var streamedContentLength = 0;

  function decodeJsonStringChunk(raw) {
    try {
      return JSON.parse('"' + raw + '"');
    } catch (_) {
      return raw.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
  }

  function extractStringField(key) {
    var searchKey = '"' + key + '"';
    var keyIdx = buffer.lastIndexOf(searchKey);
    if (keyIdx === -1) return null;
    var colonIdx = buffer.indexOf(':', keyIdx + searchKey.length);
    if (colonIdx === -1) return null;
    var quoteIdx = buffer.indexOf('"', colonIdx + 1);
    if (quoteIdx === -1) return null;

    var start = quoteIdx + 1;
    var end = -1;
    var i = start;
    while (i < buffer.length) {
      if (buffer[i] === '"' && buffer[i - 1] !== '\\') {
        var after = buffer.substring(i + 1).trim();
        if (after.startsWith(',') || after.startsWith('}') || after.startsWith('"') || after.length === 0) {
          end = i;
          break;
        }
      }
      i++;
    }

    if (end !== -1) {
      return { value: buffer.substring(start, end), isComplete: true };
    } else {
      var partial = buffer.substring(start);
      if (partial.endsWith('\\')) partial = partial.slice(0, -1);
      return { value: partial, isComplete: false };
    }
  }

  function push(chunk) {
    buffer += chunk;
    var result = {};

    var reasoningField = extractStringField('reasoning');
    if (reasoningField && reasoningField.value.length > streamedThinkingLength) {
      var newRaw = reasoningField.value.substring(streamedThinkingLength);
      streamedThinkingLength = reasoningField.value.length;
      result.thinking = decodeJsonStringChunk(newRaw);
    }

    var contentField = extractStringField('content');
    if (contentField && contentField.value.length > streamedContentLength) {
      var newRawContent = contentField.value.substring(streamedContentLength);
      streamedContentLength = contentField.value.length;
      result.content = decodeJsonStringChunk(newRawContent);
    }

    return result;
  }

  return {
    push: push,
    getBuffer: function() { return buffer; },
    getStreamedThinkingLength: function() { return streamedThinkingLength; },
    getStreamedContentLength: function() { return streamedContentLength; }
  };
}

function extractReasoningField(text) {
  if (!text) return '';
  var target = '"reasoning":';
  var lastIdx = text.lastIndexOf(target);
  if (lastIdx === -1) return '';

  var quoteIdx = text.indexOf('"', lastIdx + target.length);
  if (quoteIdx === -1) return '';

  var start = quoteIdx + 1;
  var i = start;
  var end = -1;
  while (i < text.length) {
    if (text[i] === '"' && text[i - 1] !== '\\') {
      var after = text.substring(i + 1).trim();
      if (after.startsWith(',') || after.startsWith('}') || after.startsWith('"content"') || after.startsWith('"tool_calls"') || after.length === 0) {
        end = i;
        break;
      }
    }
    i++;
  }

  if (end !== -1) {
    var rawVal = text.substring(quoteIdx, end + 1);
    try {
      return JSON.parse(rawVal);
    } catch (_) {
      return text.substring(start, end)
        .replace(/\\n/g, '\n')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
    }
  }

  return '';
}

function extractContentField(text) {
  if (!text) return '';
  var target = '"content":';
  var lastIdx = text.lastIndexOf(target);
  if (lastIdx === -1) return '';

  var quoteIdx = text.indexOf('"', lastIdx + target.length);
  if (quoteIdx === -1) return '';

  var start = quoteIdx + 1;
  var i = start;
  var end = -1;
  while (i < text.length) {
    if (text[i] === '"' && text[i - 1] !== '\\') {
      var after = text.substring(i + 1).trim();
      if (after.startsWith(',') || after.startsWith('}') || after.startsWith('"tool_calls"') || after.startsWith('"finish_reason"') || after.length === 0) {
        end = i;
        break;
      }
    }
    i++;
  }

  if (end !== -1) {
    var rawVal = text.substring(quoteIdx, end + 1);
    try {
      return JSON.parse(rawVal);
    } catch (_) {
      return text.substring(start, end)
        .replace(/\\n/g, '\n')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
    }
  }

  return '';
}

function extractToolCallsField(text) {
  if (!text) return [];
  var target = '"tool_calls":';
  var lastIdx = text.lastIndexOf(target);
  if (lastIdx === -1) return [];

  var bracketIdx = text.indexOf('[', lastIdx + target.length);
  if (bracketIdx === -1) return [];

  var depth = 0;
  var end = -1;
  for (var i = bracketIdx; i < text.length; i++) {
    if (text[i] === '[') depth++;
    else if (text[i] === ']') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  if (end !== -1) {
    try {
      return JSON.parse(text.substring(bracketIdx, end + 1));
    } catch (_) {}
  }
  return [];
}

export function cleanAndParseOpenAiJson(raw) {
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

  // Resilient fallback: If the raw text contains an OpenAI envelope structure
  // (e.g. {"id": "chatcmpl-qwen" ... }) but JSON.parse failed because of unescaped quotes
  // or multi-block outputs, extract reasoning, content, and tool_calls directly!
  if (s.includes('"chatcmpl') || s.includes('"choices"') || s.includes('"role": "assistant"') || s.includes('"tool_calls"')) {
    var extractedReasoning = extractReasoningField(s);
    var extractedContent = extractContentField(s);
    var extractedTools = extractToolCallsField(s);

    if (extractedContent || extractedTools.length > 0 || extractedReasoning) {
      return {
        id: 'chatcmpl-qwen',
        object: 'chat.completion',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              reasoning: extractedReasoning,
              content: extractedContent,
              tool_calls: extractedTools
            },
            finish_reason: extractedTools.length > 0 ? 'tool_calls' : 'stop'
          }
        ]
      };
    }
  }

  return null;
}

/**
 * Serialize the full messages[] array into a single user message for Qwen.
 * Self-managed context: We maintain the complete conversation history locally,
 * formatting every previous assistant OpenAI response and tool result, while
 * re-sending the required response format and tool documentation on every turn.
 */
function serializeMessages(messages, systemContent, tools) {
  var parts = [];

  // 1. System Prompt + Tools Documentation + OpenAI Response Format (Always Included Every Turn)
  var sysPrompt = (systemContent || 'You are an autonomous AI coding agent operating in a VS Code workspace.') +
    '\n\n## AVAILABLE WORKSPACE TOOLS (Sent on every turn)\n' +
    formatToolsForPrompt(tools) +
    '\n\n## RESPONSE FORMAT REQUIREMENT (Strict OpenAI Format)\n' +
    'You MUST respond ONLY with a raw JSON object matching the standard OpenAI chat.completion format.\n' +
    'Do NOT output conversational text before or after the JSON.\n' +
    'Do NOT wrap the response in markdown code blocks like ```json ... ```. Output raw JSON only.\n\n' +
    'Required structure:\n' +
    '{\n' +
    '  "id": "chatcmpl-qwen",\n' +
    '  "object": "chat.completion",\n' +
    '  "choices": [\n' +
    '    {\n' +
    '      "index": 0,\n' +
    '      "message": {\n' +
    '        "role": "assistant",\n' +
    '        "reasoning": "internal step-by-step thinking and analysis",\n' +
    '        "content": "user-facing response text in rich markdown (use empty string \\"\\" when calling tools)",\n' +
    '        "tool_calls": [\n' +
    '          {\n' +
    '            "id": "call_1",\n' +
    '            "type": "function",\n' +
    '            "function": {\n' +
    '              "name": "exact_tool_name",\n' +
    '              "arguments": { "param_name": "param_value" }\n' +
    '            }\n' +
    '          }\n' +
    '        ]\n' +
    '      },\n' +
    '      "finish_reason": "stop | tool_calls"\n' +
    '    }\n' +
    '  ]\n' +
    '}\n' +
    'Rules:\n' +
    '1. When you need to inspect/modify files or run commands, call tools: set "content": "" and "finish_reason": "tool_calls".\n' +
    '2. When you answer directly or complete the task, provide your full markdown answer in "content", set "tool_calls": [], and "finish_reason": "stop".\n';

  parts.push(sysPrompt);

  // 2. Previous Conversation History (Formatted properly with OpenAI-type responses and tool results)
  var convMessages = messages.filter(function(m) { return m.role !== 'system'; });
  if (convMessages.length > 1) {
    parts.push('\n--- CONVERSATION HISTORY ---');
    for (var i = 0; i < convMessages.length - 1; i++) {
      var m = convMessages[i];
      if (m.role === 'user') {
        parts.push('\nUser:\n' + (m.content || ''));
      } else if (m.role === 'assistant') {
        var aText = '\nAssistant:';
        var r = m.reasoning || m.thinking;
        if (r) aText += '\nReasoning: ' + r;
        if (m.tool_calls && m.tool_calls.length) {
          aText += '\nTool Calls:\n' + JSON.stringify(m.tool_calls, null, 2);
        }
        if (m.content) aText += '\nContent:\n' + m.content;
        parts.push(aText);
      } else if (m.role === 'tool') {
        var toolId = m.tool_call_id || '';
        var toolName = m.tool_name || '';
        var tHeader = toolName ? toolName + ' (ID: ' + toolId + ')' : 'ID: ' + toolId;
        parts.push('\n[Tool Result for ' + tHeader + ']:\n' + (m.content || ''));
      }
    }
  }

  // 3. Current Step / Request
  var lastMsg = convMessages.length > 0 ? convMessages[convMessages.length - 1] : null;
  if (lastMsg) {
    if (lastMsg.role === 'tool') {
      var lastToolId = lastMsg.tool_call_id || '';
      var lastToolName = lastMsg.tool_name || '';
      var lastHeader = lastToolName ? lastToolName + ' (ID: ' + lastToolId + ')' : 'ID: ' + lastToolId;
      parts.push('\n--- CURRENT STEP ---\n[Latest Tool Execution Result for ' + lastHeader + ']:\n' + (lastMsg.content || '') + '\n\nAnalyze this result and decide the next step or final answer in strict OpenAI chat.completion format.');
    } else if (lastMsg.role === 'user') {
      parts.push('\n--- CURRENT REQUEST ---\nUser:\n' + (lastMsg.content || ''));
    } else if (lastMsg.role === 'assistant') {
      parts.push('\n--- CURRENT ASSISTANT REQUEST ---\n' + (lastMsg.content || ''));
    }
  }

  return parts.join('\n\n');
}

function formatToolsForPrompt(tools) {
  if (!tools || !tools.length) return 'No tools available.';
  var s = '';
  for (var i = 0; i < tools.length; i++) {
    var t = tools[i];
    var fn = t.function || t;
    s += '\n### ' + fn.name + '\n';
    s += 'Description: ' + (fn.description || '') + '\n';
    if (fn.parameters && fn.parameters.properties) {
      s += 'Parameters (JSON schema properties):\n';
      var props = fn.parameters.properties;
      var required = fn.parameters.required || [];
      var propNames = Object.keys(props);
      for (var p = 0; p < propNames.length; p++) {
        var pName = propNames[p];
        var prop = props[pName];
        var req = required.includes(pName) ? ' (required)' : '';
        s += '- ' + pName + ' (' + prop.type + '): ' + (prop.description || '') + req + '\n';
      }
    }
  }
  return s;
}

function parseTextToolCalls(text) {
  var toolCalls = [];
  var idx = 0;

  var markdownRegex = /```json\s*(\{[\s\S]*?\})\s*(?:```|$)/g;
  var match;
  while ((match = markdownRegex.exec(text)) !== null) {
    try {
      var obj = JSON.parse(match[1].trim());
      if (obj && Array.isArray(obj.tool_calls)) {
        for (var i = 0; i < obj.tool_calls.length; i++) {
          var tc = obj.tool_calls[i];
          toolCalls.push({
            id: 'text_call_' + idx++,
            type: 'function',
            function: {
              name: tc.name,
              arguments: typeof tc.arguments === 'object' ? JSON.stringify(tc.arguments) : String(tc.arguments || '')
            }
          });
        }
      }
    } catch (_) {}
  }

  if (toolCalls.length === 0) {
    var firstBrace = text.indexOf('{');
    var lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      var potentialJson = text.substring(firstBrace, lastBrace + 1);
      if (potentialJson.includes('"tool_calls"')) {
        try {
          var obj2 = JSON.parse(potentialJson.trim());
          if (obj2 && Array.isArray(obj2.tool_calls)) {
            for (var j = 0; j < obj2.tool_calls.length; j++) {
              var tc2 = obj2.tool_calls[j];
              toolCalls.push({
                id: 'text_call_' + idx++,
                type: 'function',
                function: {
                  name: tc2.name,
                  arguments: typeof tc2.arguments === 'object' ? JSON.stringify(tc2.arguments) : String(tc2.arguments || '')
                }
              });
            }
          }
        } catch (_) {}
      }
    }
  }
  return toolCalls;
}

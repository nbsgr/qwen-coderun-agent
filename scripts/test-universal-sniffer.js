// test-universal-sniffer.js — Automated API and Network Discovery via CDP
// Usage: node scripts/test-universal-sniffer.js <target_url>
// Example:
//   node scripts/test-universal-sniffer.js https://chat.deepseek.com
//   node scripts/test-universal-sniffer.js https://kimi.moonshot.cn
//   node scripts/test-universal-sniffer.js https://chatgpt.com

import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import readline from 'readline';

function sleep(ms) {
  return new Promise(function(resolve) {
    setTimeout(resolve, ms);
  });
}

function waitForEnter(promptText) {
  var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise(function(resolve) {
    rl.question(promptText, function(answer) {
      rl.close();
      resolve(answer);
    });
  });
}

function detectSystemBrowser() {
  var candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'Edge', 'Application', 'msedge.exe')
  ];

  for (var i = 0; i < candidates.length; i++) {
    if (fs.existsSync(candidates[i])) {
      return candidates[i];
    }
  }
  return '';
}

async function runSniffer(targetUrl) {
  console.log('===========================================================');
  console.log('🌐 UNIVERSAL WEB CHAT API SNIFFER & DISCOVERY');
  console.log('===========================================================');
  console.log('Target URL:', targetUrl);

  var browserPath = detectSystemBrowser();
  if (!browserPath) {
    console.error('❌ No Chromium browser found on system.');
    return;
  }

  var port = 9445;
  var tempDir = path.join(os.tmpdir(), 'coderun_sniffer_' + Date.now());
  fs.mkdirSync(tempDir, { recursive: true });

  var args = [
    '--remote-debugging-port=' + port,
    '--user-data-dir=' + tempDir,
    '--new-window',
    targetUrl,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1100,850'
  ];

  console.log('\n🚀 Opening visible browser window for:', targetUrl);
  var proc = spawn(browserPath, args, { stdio: 'ignore', detached: true });

  // Connect to CDP
  var wsUrl = '';
  for (var attempt = 0; attempt < 35; attempt++) {
    await sleep(400);
    try {
      var targetsRes = await fetch('http://127.0.0.1:' + port + '/json');
      if (targetsRes.ok) {
        var targets = await targetsRes.json();
        for (var t of targets) {
          if (t.type === 'page' && t.webSocketDebuggerUrl) {
            wsUrl = t.webSocketDebuggerUrl;
            break;
          }
        }
      }
    } catch (_) {}
    if (wsUrl) break;
  }

  if (!wsUrl) {
    console.error('❌ Failed to connect to CDP endpoint.');
    proc.kill();
    return;
  }

  console.log('🔌 Connected to Chrome DevTools Protocol.');
  var ws = new WebSocket(wsUrl);

  await new Promise(function(resolve, reject) {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  var reqCounter = 1;
  var discovered = {
    targetUrl: targetUrl,
    chatCompletions: [],
    modelLists: [],
    chatSessions: [],
    interestingApis: [],
    authHeaders: {},
    allCookies: [],
    localStorage: {}
  };

  // Enable Network and Runtime inspection
  ws.send(JSON.stringify({ id: reqCounter++, method: 'Network.enable' }));
  ws.send(JSON.stringify({ id: reqCounter++, method: 'Runtime.enable' }));

  function requestSnapshot() {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ id: reqCounter++, method: 'Network.getAllCookies' }));
      ws.send(JSON.stringify({
        id: reqCounter++,
        method: 'Runtime.evaluate',
        params: {
          expression: 'JSON.stringify(Object.assign({}, localStorage))',
          returnByValue: true
        }
      }));
    }
  }

  // Poll storage and cookies every 2 seconds
  var pollInterval = setInterval(requestSnapshot, 2000);

  var requestMap = {};

  ws.onmessage = function(event) {
    try {
      var msg = JSON.parse(event.data);
      if (!msg) return;

      // 1. Capture outgoing requests
      if (msg.method === 'Network.requestWillBeSent') {
        var req = msg.params.request;
        var rId = msg.params.requestId;
        requestMap[rId] = req;

        // Capture authentication headers automatically
        if (req.headers) {
          for (var hName of Object.keys(req.headers)) {
            var low = hName.toLowerCase();
            if (low === 'authorization' || low.includes('token') || low.includes('csrf') || low.startsWith('bx-') || low.includes('auth')) {
              discovered.authHeaders[hName] = req.headers[hName];
            }
          }
        }
      }

      // 2. Capture incoming responses
      if (msg.method === 'Network.responseReceived') {
        var resp = msg.params.response;
        var rId = msg.params.requestId;
        var req = requestMap[rId] || {};
        var mime = (resp.mimeType || '').toLowerCase();
        var cType = ((resp.headers && resp.headers['content-type']) || '').toLowerCase();
        var url = resp.url;

        // Skip static assets
        if (url.endsWith('.js') || url.endsWith('.css') || url.endsWith('.svg') || url.endsWith('.png') || url.endsWith('.woff2')) {
          return;
        }

        // Check A: Is this an Event-Stream (Chat Completion)?
        if (mime.includes('event-stream') || cType.includes('event-stream') || cType.includes('stream')) {
          var exists = discovered.chatCompletions.some(function(item) { return item.url === url; });
          if (!exists) {
            var entry = {
              type: 'CHAT_COMPLETION_STREAM',
              url: url,
              method: req.method || 'POST',
              postData: req.postData ? req.postData.substring(0, 500) : null
            };
            console.log('\n🎯 [DETECTED STREAMING CHAT COMPLETIONS API]');
            console.log('   URL:   ', entry.url);
            console.log('   Method:', entry.method);
            if (entry.postData) console.log('   Body:  ', entry.postData.substring(0, 150) + '...');
            discovered.chatCompletions.push(entry);
          }
        }

        // Check B: Is this a Model List or Config API?
        else if (url.includes('/models') || url.includes('/model_list') || url.includes('/config') || url.includes('/user/models')) {
          var exists2 = discovered.modelLists.some(function(item) { return item.url === url; });
          if (!exists2) {
            var entry2 = {
              type: 'MODEL_LIST_OR_CONFIG',
              url: url,
              method: req.method || 'GET',
              status: resp.status
            };
            console.log('\n📦 [DETECTED MODEL / CONFIG API]');
            console.log('   URL:   ', entry2.url);
            discovered.modelLists.push(entry2);
          }
        }

        // Check C: Is this Conversation/Chat creation or listing?
        else if (url.includes('/chats') || url.includes('/conversations') || url.includes('/session')) {
          var exists3 = discovered.chatSessions.some(function(item) { return item.url === url; });
          if (!exists3) {
            var entry3 = {
              type: 'CONVERSATION_API',
              url: url,
              method: req.method || 'POST',
              status: resp.status
            };
            console.log('\n💬 [DETECTED CONVERSATION API]');
            console.log('   URL:   ', entry3.url);
            console.log('   Method:', entry3.method);
            discovered.chatSessions.push(entry3);
          }
        } else if (cType.includes('json')) {
          var exists4 = discovered.interestingApis.some(function(item) { return item.url === url; });
          if (!exists4) {
            discovered.interestingApis.push({
              url: url,
              method: req.method,
              status: resp.status
            });
          }
        }
      }

      // 3. Handle Cookies result
      if (msg.result && Array.isArray(msg.result.cookies)) {
        discovered.allCookies = msg.result.cookies.map(function(c) {
          return { name: c.name, value: c.value, domain: c.domain, httpOnly: c.httpOnly };
        });
      }

      // 4. Handle LocalStorage evaluation result
      if (msg.result && msg.result.result && typeof msg.result.result.value === 'string') {
        try {
          var parsed = JSON.parse(msg.result.result.value);
          if (parsed && typeof parsed === 'object') {
            discovered.localStorage = parsed;
          }
        } catch (_) {}
      }

    } catch (err) {}
  };

  console.log('\n===========================================================');
  console.log('👉 ACTION REQUIRED IN THE OPENED BROWSER WINDOW:');
  console.log('   1. Enter your login credentials and sign in.');
  console.log('   2. (Optional) Send a quick chat message (e.g. "hi") to capture the stream endpoint.');
  console.log('   3. When you are done, press [ENTER] in this terminal or close the window.');
  console.log('===========================================================\n');

  var userDonePromise = waitForEnter('⌨️  Press [ENTER] here when you have completed login / testing: ');
  var procClosePromise = new Promise(function(resolve) { proc.on('close', resolve); });

  await Promise.race([userDonePromise, procClosePromise]);

  console.log('\n⏳ Finalizing discovery snapshot...');
  requestSnapshot();
  await sleep(1000);

  clearInterval(pollInterval);
  try { ws.close(); } catch (_) {}
  try { proc.kill(); } catch (_) {}

  console.log('\n===========================================================');
  console.log('📊 DISCOVERY SUMMARY FOR:', targetUrl);
  console.log('===========================================================');

  console.log('\n1. Streaming Chat Completions Endpoints Detected (' + discovered.chatCompletions.length + '):');
  for (var cc of discovered.chatCompletions) {
    console.log('   - [' + cc.method + '] ' + cc.url);
  }

  console.log('\n2. Model / Config Endpoints Detected (' + discovered.modelLists.length + '):');
  for (var ml of discovered.modelLists) {
    console.log('   - [' + ml.method + '] ' + ml.url);
  }

  console.log('\n3. Conversation / Session Endpoints Detected (' + discovered.chatSessions.length + '):');
  for (var cs of discovered.chatSessions) {
    console.log('   - [' + cs.method + '] ' + cs.url);
  }

  console.log('\n4. Discovered Auth Headers (' + Object.keys(discovered.authHeaders).length + '):');
  for (var h of Object.keys(discovered.authHeaders)) {
    console.log('   - ' + h + ': ' + String(discovered.authHeaders[h]).substring(0, 60) + '...');
  }

  console.log('\n5. Captured Cookies Count: ' + discovered.allCookies.length);
  if (discovered.allCookies.length > 0) {
    var sampleCookies = discovered.allCookies.slice(0, 5).map(function(c) { return c.name; }).join(', ');
    console.log('   Sample cookie names: ' + sampleCookies + (discovered.allCookies.length > 5 ? '...' : ''));
  }

  console.log('\n6. LocalStorage Keys Discovered (' + Object.keys(discovered.localStorage).length + '):');
  if (Object.keys(discovered.localStorage).length > 0) {
    console.log('   Keys: ' + Object.keys(discovered.localStorage).join(', '));
  }

  var domainClean = 'profile';
  try { domainClean = new URL(targetUrl).hostname.replace(/\./g, '_'); } catch (_) {}
  var savePath = path.join(process.cwd(), 'scripts', 'discovered_profile_' + domainClean + '.json');
  fs.writeFileSync(savePath, JSON.stringify(discovered, null, 2));
  console.log('\n💾 Full profile saved to: ' + savePath);
  console.log('===========================================================');
}

var target = process.argv[2] || 'https://chat.deepseek.com';
runSniffer(target);

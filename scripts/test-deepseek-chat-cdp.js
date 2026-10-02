// test-deepseek-chat-cdp.js — Sends a prompt to DeepSeek via CDP and reads the live response stream
var WebSocketClient = globalThis.WebSocket;

async function sendPrompt(promptText) {
  console.log('===========================================================');
  console.log('🤖 TESTING DEEPSEEK LIVE COMPLETION RESPONSE STREAM VIA CDP');
  console.log('===========================================================');
  console.log('Prompt:', promptText);

  var ws = new WebSocketClient('ws://127.0.0.1:9445/devtools/page/5CF8C597D66497349E2DF9ED17D77C43');

  var reqId = 1;

  ws.onopen = function() {
    console.log('🔌 Connected to DeepSeek browser tab.');

    // Listen to network events to intercept the live completion stream!
    ws.send(JSON.stringify({ id: reqId++, method: 'Network.enable' }));

    // Inject prompt into the DeepSeek textarea and click send button!
    var injectCode = [
      '(function() {',
      '  var textarea = document.querySelector("textarea") || document.querySelector("input[type=text]") || document.querySelector("[contenteditable=true]");',
      '  if (!textarea) return { error: "Textarea not found" };',
      '  textarea.focus();',
      '  textarea.value = ' + JSON.stringify(promptText) + ';',
      '  textarea.dispatchEvent(new Event("input", { bubbles: true }));',
      '  textarea.dispatchEvent(new Event("change", { bubbles: true }));',
      '  setTimeout(function() {',
      '    // Find send button (usually the blue circular button or with arrow)',
      '    var btn = document.querySelector("button[type=submit]") || document.querySelector(".chat-input-send-button") || document.querySelector("div[role=button]:last-child");',
      '    if (!btn) {',
      '      var buttons = document.querySelectorAll("button, div[role=button]");',
      '      for (var i = buttons.length - 1; i >= 0; i--) {',
      '        if (buttons[i].querySelector("svg") && !buttons[i].disabled) {',
      '          btn = buttons[i];',
      '          break;',
      '        }',
      '      }',
      '    }',
      '    if (btn) {',
      '      btn.click();',
      '    } else {',
      '      // Press Enter key',
      '      textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));',
      '    }',
      '  }, 300);',
      '  return { success: true };',
      '})()'
    ].join('\n');

    setTimeout(function() {
      ws.send(JSON.stringify({
        id: reqId++,
        method: 'Runtime.evaluate',
        params: {
          expression: injectCode,
          returnByValue: true
        }
      }));
    }, 500);
  };

  var completionRequestId = null;

  ws.onmessage = function(e) {
    try {
      var msg = JSON.parse(e.data);
      if (!msg) return;

      // Detect the completion request
      if (msg.method === 'Network.requestWillBeSent') {
        var url = msg.params.request.url;
        if (url.includes('/chat/completion')) {
          completionRequestId = msg.params.requestId;
          console.log('\n🚀 DeepSeek Completion Request Dispatched:');
          console.log('   URL:', url);
          console.log('   Method:', msg.params.request.method);
          console.log('   Headers captured (PoW, auth):', Object.keys(msg.params.request.headers).length);
        }
      }

      // Detect stream response
      if (msg.method === 'Network.responseReceived') {
        var respUrl = msg.params.response.url;
        if (respUrl.includes('/chat/completion')) {
          console.log('   Status:', msg.params.response.status, msg.params.response.statusText);
          console.log('   Content-Type:', msg.params.response.headers['content-type'] || msg.params.response.mimeType);
        }
      }

      // Stream finished or data arrived
      if (msg.method === 'Network.loadingFinished' && msg.params.requestId === completionRequestId) {
        console.log('\n✅ Completion streaming finished over wire!');
      }

    } catch (_) {}
  };

  // Poll the DOM every 1 second to print the live streaming text response!
  var lastText = '';
  var unchangedCount = 0;
  var pollTimer = setInterval(function() {
    if (ws.readyState !== WebSocketClient.OPEN) return;
    var readCode = [
      '(function() {',
      '  var messages = document.querySelectorAll(".ds-markdown, [class*=\\"message\\"], [class*=\\"markdown\\"]");',
      '  if (!messages || messages.length === 0) return "";',
      '  var lastMsg = messages[messages.length - 1];',
      '  return lastMsg.innerText || "";',
      '})()'
    ].join('\n');

    ws.send(JSON.stringify({
      id: 999,
      method: 'Runtime.evaluate',
      params: { expression: readCode, returnByValue: true }
    }));
  }, 1000);

  // Catch the DOM poll response
  var origOnMessage = ws.onmessage;
  ws.onmessage = function(e) {
    origOnMessage(e);
    try {
      var msg = JSON.parse(e.data);
      if (msg.id === 999 && msg.result && msg.result.result) {
        var currentText = msg.result.result.value || '';
        if (currentText && currentText !== lastText) {
          lastText = currentText;
          unchangedCount = 0;
          process.stdout.write('\r🤖 DeepSeek Live Response: ' + currentText.replace(/\n/g, ' ').substring(0, 120));
        } else if (lastText && currentText === lastText) {
          unchangedCount++;
          if (unchangedCount >= 4) { // 4 seconds without new text = completed
            clearInterval(pollTimer);
            console.log('\n\n===========================================================');
            console.log('🎉 FULL RESPONSE RECEIVED FROM DEEPSEEK:');
            console.log('===========================================================');
            console.log(lastText.trim());
            console.log('===========================================================');
            ws.close();
            process.exit(0);
          }
        }
      }
    } catch (_) {}
  };
}

var testPrompt = process.argv[2] || 'Explain in one short sentence what an autonomous AI agent is.';
sendPrompt(testPrompt);

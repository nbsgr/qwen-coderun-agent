// test-deepseek-via-browser-context.js — Executes chat completion inside DeepSeek's own authenticated browser tab via CDP
var WebSocketClient = globalThis.WebSocket;

async function testInsideBrowser() {
  console.log('Connecting to DeepSeek browser tab on port 9445...');
  var ws = new WebSocketClient('ws://127.0.0.1:9445/devtools/page/5CF8C597D66497349E2DF9ED17D77C43');

  ws.onopen = function() {
    console.log('Connected! Executing test chat directly inside DeepSeek page context...');

    var code = [
      '(async function() {',
      '  // 1. Create a session',
      '  var sRes = await fetch("https://chat.deepseek.com/api/v0/chat_session/create", {',
      '    method: "POST",',
      '    headers: { "Content-Type": "application/json" },',
      '    body: JSON.stringify({ character_id: null })',
      '  });',
      '  var sData = await sRes.json();',
      '  var sessionId = sData?.data?.biz_data?.id;',
      '  return { success: true, sessionId: sessionId, raw: sData };',
      '})()'
    ].join('\n');

    ws.send(JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: {
        expression: code,
        awaitPromise: true,
        returnByValue: true
      }
    }));
  };

  ws.onmessage = function(e) {
    var msg = JSON.parse(e.data);
    console.log('Result from browser:');
    console.log(JSON.stringify(msg?.result?.result?.value, null, 2));
    ws.close();
    process.exit(0);
  };
}

testInsideBrowser();

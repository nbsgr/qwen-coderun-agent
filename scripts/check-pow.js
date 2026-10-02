var WebSocketClient = globalThis.WebSocket;

var ws = new WebSocketClient('ws://127.0.0.1:9445/devtools/page/5CF8C597D66497349E2DF9ED17D77C43');

ws.onopen = function() {
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: 'JSON.stringify(window._capturedHeaders || [])',
      returnByValue: true
    }
  }));
};

ws.onmessage = function(e) {
  var msg = JSON.parse(e.data);
  console.log('Result:', msg?.result?.result?.value);
  ws.close();
  process.exit(0);
};

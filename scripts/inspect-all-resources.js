var WebSocketClient = globalThis.WebSocket;

var ws = new WebSocketClient('ws://127.0.0.1:9445/devtools/page/5CF8C597D66497349E2DF9ED17D77C43');

ws.onopen = function() {
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: 'JSON.stringify(performance.getEntriesByType("resource").map(function(r) { return r.name; }))',
      returnByValue: true
    }
  }));
};

ws.onmessage = function(e) {
  var msg = JSON.parse(e.data);
  var list = JSON.parse(msg?.result?.result?.value || '[]');
  console.log('--- ALL RECENT RESOURCE URLS ---');
  list.forEach(function(url) {
    if (url.includes('api/v0') || url.includes('chat')) {
      console.log(url);
    }
  });
  ws.close();
  process.exit(0);
};

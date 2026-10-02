var WebSocketClient = globalThis.WebSocket;

async function check() {
  var ws = new WebSocketClient('ws://127.0.0.1:9445/devtools/page/5CF8C597D66497349E2DF9ED17D77C43');
  ws.onopen = function() {
    ws.send(JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: {
        expression: 'JSON.stringify(performance.getEntriesByType("resource").map(function(r) { return { name: r.name, initiatorType: r.initiatorType }; }))',
        returnByValue: true
      }
    }));
  };

  ws.onmessage = function(event) {
    var msg = JSON.parse(event.data);
    if (msg.id === 1 && msg.result && msg.result.result) {
      var list = JSON.parse(msg.result.result.value || '[]');
      var apiCalls = list.filter(function(item) {
        return item.initiatorType === 'fetch' || item.initiatorType === 'xmlhttprequest';
      });
      console.log('--- API / FETCH CALLS DETECTED IN DEEPSEEK ---');
      apiCalls.forEach(function(c) {
        console.log('- ' + c.name);
      });
      ws.close();
      process.exit(0);
    }
  };
}

check();

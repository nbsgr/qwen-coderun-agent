var WebSocketClient = globalThis.WebSocket;

var ws = new WebSocketClient('ws://127.0.0.1:9445/devtools/page/5CF8C597D66497349E2DF9ED17D77C43');

ws.onopen = function() {
  var code = [
    'if (!window._origFetch) {',
    '  window._origFetch = window.fetch;',
    '  window._capturedHeaders = [];',
    '  window.fetch = function(url, opts) {',
    '    if (opts && opts.headers) {',
    '      window._capturedHeaders.push({ url: String(url), headers: opts.headers });',
    '    }',
    '    return window._origFetch.apply(this, arguments);',
    '  };',
    '}',
    'window._capturedHeaders;'
  ].join('\n');

  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: code,
      returnByValue: true
    }
  }));
};

ws.onmessage = function(e) {
  var msg = JSON.parse(e.data);
  console.log('Hook result:', JSON.stringify(msg.result));
  ws.close();
  process.exit(0);
};

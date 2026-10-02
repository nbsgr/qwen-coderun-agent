// inspect-input-box.js — Find exact input element on DeepSeek
var WebSocketClient = globalThis.WebSocket;
var ws = new WebSocketClient('ws://127.0.0.1:9445/devtools/page/5CF8C597D66497349E2DF9ED17D77C43');

ws.onopen = function() {
  var code = [
    '(function() {',
    '  var textareas = Array.from(document.querySelectorAll("textarea, [contenteditable=true]")).map(function(el) {',
    '    return { tag: el.tagName, id: el.id, className: el.className, placeholder: el.placeholder };',
    '  });',
    '  var buttons = Array.from(document.querySelectorAll("button, div[role=button]")).slice(-10).map(function(b) {',
    '    return { tag: b.tagName, className: b.className, text: b.innerText, ariaLabel: b.getAttribute("aria-label") };',
    '  });',
    '  return { textareas: textareas, buttons: buttons };',
    '})()'
  ].join('\n');

  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: { expression: code, returnByValue: true }
  }));
};

ws.onmessage = function(e) {
  var msg = JSON.parse(e.data);
  console.log(JSON.stringify(msg.result.result.value, null, 2));
  ws.close();
  process.exit(0);
};

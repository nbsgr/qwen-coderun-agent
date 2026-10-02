// inspect-deepseek-dom.js
var WebSocketClient = globalThis.WebSocket;

function inspectDom() {
  var ws = new WebSocketClient('ws://127.0.0.1:9445/devtools/page/5CF8C597D66497349E2DF9ED17D77C43');

  function handleOpen() {
    var expr = 'var ta = document.querySelector("textarea"); var btns = Array.from(document.querySelectorAll("button, [role=button], div[class*=button]")); JSON.stringify({ textareaFound: !!ta, placeholder: ta ? ta.placeholder : "", value: ta ? ta.value : "", buttonCount: btns.length, sampleButtons: btns.slice(0, 10).map(function(b) { return { tag: b.tagName, cls: b.className, text: b.innerText }; }) })';
    ws.send(JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: { expression: expr, returnByValue: true }
    }));
  }

  function handleMessage(e) {
    var res = JSON.parse(e.data);
    if (res.id === 1) {
      console.log('DOM Inspection Result:');
      console.log(res.result.result.value);
      ws.close();
      process.exit(0);
    }
  }

  ws.onopen = handleOpen;
  ws.onmessage = handleMessage;
}

inspectDom();

async function main() {
  var js = await fetch('https://assets.alicdn.com/g/qwenweb/qwen-chat-fe/0.3.12/js/main.js').then(r => r.text());
  var idx = 0;
  while ((idx = js.indexOf('chat/completions', idx + 1)) !== -1) {
    console.log('--- Found chat/completions at', idx);
    console.log(js.substring(Math.max(0, idx - 100), Math.min(js.length, idx + 500)));
  }
}
main();

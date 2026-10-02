async function main() {
  var js = await fetch('https://assets.alicdn.com/g/qwenweb/qwen-chat-fe/0.3.12/js/main.js').then(r => r.text());
  var idx = js.indexOf('execUpload(e){');
  console.log(js.substring(idx, idx + 1500));
}
main();

async function main() {
  var js = await fetch('https://assets.alicdn.com/g/qwenweb/qwen-chat-fe/0.3.12/js/main.js').then(r => r.text());
  var idx = js.indexOf('execUpload(e){');
  if (idx === -1) idx = js.indexOf('execUpload');
  console.log(js.substring(idx, idx + 2500));
}
main();

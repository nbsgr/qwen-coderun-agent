async function main() {
  var t = await fetch('https://chat.qwen.ai/').then(r => r.text());
  var re = /[a-zA-Z0-9_\-\.\/]+\.js/g;
  var m = t.match(re) || [];
  console.log('JS files found in HTML:', [...new Set(m)]);
}
main();

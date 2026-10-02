async function main() {
  console.log('Fetching main.js...');
  var js = await fetch('https://assets.alicdn.com/g/qwenweb/qwen-chat-fe/0.3.12/js/main.js').then(r => r.text());
  console.log('main.js size:', js.length);

  // Search for upload or file API calls
  var matches = js.match(/\/api\/v2\/[a-zA-Z0-9_\/]+/g) || [];
  var unique = [...new Set(matches)];
  console.log('All /api/v2/ endpoints in main.js:');
  for (var u of unique) {
    console.log('  ', u);
  }

  // Also search for upload functions or OSS
  var uploadLines = [];
  var idx = 0;
  while ((idx = js.indexOf('upload', idx + 1)) !== -1) {
    var snippet = js.substring(Math.max(0, idx - 50), Math.min(js.length, idx + 100));
    if (snippet.includes('/api/') || snippet.includes('oss') || snippet.includes('FormData') || snippet.includes('file')) {
      uploadLines.push(snippet);
      if (uploadLines.length > 15) break;
    }
  }
  console.log('\nUpload snippets:');
  for (var s of uploadLines) {
    console.log('---', s);
  }
}
main();

async function test() {
  var html = await fetch('https://chat.qwen.ai/').then(function(r) { return r.text(); });
  var matches = html.match(/src="([^"]+\.js)"/g) || [];
  console.log('Script matches:', matches.length);
  for (var m of matches) {
    var src = m.replace(/src="|"/g, '');
    if (src.startsWith('/')) src = 'https://chat.qwen.ai' + src;
    console.log('Fetching', src);
    try {
      var js = await fetch(src).then(function(r) { return r.text(); });
      // Search for upload or file API
      var uploadMatches = js.match(/\/api\/v2\/[a-zA-Z0-9_\/]+/g) || [];
      var unique = [...new Set(uploadMatches)];
      var fileApis = unique.filter(function(u) { return /file|upload|oss|attachment|vision/i.test(u); });
      if (fileApis.length) {
        console.log('Found File/Upload APIs in', src, ':', fileApis);
      }
    } catch (e) {
      console.log('Err fetching', src, e.message);
    }
  }
}
test();

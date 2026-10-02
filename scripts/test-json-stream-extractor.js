// test-json-stream-extractor.js
function createJsonStreamExtractor() {
  var buffer = '';
  var streamedThinkingLength = 0;
  var streamedContentLength = 0;

  function decodeJsonStringChunk(raw) {
    try {
      return JSON.parse('"' + raw + '"');
    } catch (_) {
      return raw.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
  }

  function extractStringField(key) {
    var searchKey = '"' + key + '"';
    var keyIdx = buffer.indexOf(searchKey);
    if (keyIdx === -1) return null;
    var colonIdx = buffer.indexOf(':', keyIdx + searchKey.length);
    if (colonIdx === -1) return null;
    var quoteIdx = buffer.indexOf('"', colonIdx + 1);
    if (quoteIdx === -1) return null;

    var start = quoteIdx + 1;
    var end = -1;
    var i = start;
    while (i < buffer.length) {
      if (buffer[i] === '"' && buffer[i - 1] !== '\\') {
        end = i;
        break;
      }
      i++;
    }

    if (end !== -1) {
      return { value: buffer.substring(start, end), isComplete: true };
    } else {
      // Partial string currently being streamed
      var partial = buffer.substring(start);
      // Avoid cutting in the middle of an escape sequence like \n or \"
      if (partial.endsWith('\\')) partial = partial.slice(0, -1);
      return { value: partial, isComplete: false };
    }
  }

  function push(chunk) {
    buffer += chunk;
    var result = {};

    var reasoningField = extractStringField('reasoning');
    if (reasoningField && reasoningField.value.length > streamedThinkingLength) {
      var newRaw = reasoningField.value.substring(streamedThinkingLength);
      streamedThinkingLength = reasoningField.value.length;
      result.thinking = decodeJsonStringChunk(newRaw);
    }

    var contentField = extractStringField('content');
    if (contentField && contentField.value.length > streamedContentLength) {
      var newRawContent = contentField.value.substring(streamedContentLength);
      streamedContentLength = contentField.value.length;
      result.content = decodeJsonStringChunk(newRawContent);
    }

    return result;
  }

  return { push: push, getBuffer: function() { return buffer; } };
}

// Test with simulated token chunks
var sampleJson = '{\n  "id": "chatcmpl-qwen",\n  "choices": [\n    {\n      "message": {\n        "reasoning": "Thinking step 1... \\nThinking step 2...",\n        "content": "Hello user!\\nHere is your code.",\n        "tool_calls": []\n      }\n    }\n  ]\n}';

var extractor = createJsonStreamExtractor();
console.log('Simulating streaming token by token:');
for (var i = 0; i < sampleJson.length; i += 7) {
  var chunk = sampleJson.substring(i, i + 7);
  var out = extractor.push(chunk);
  if (out.thinking) process.stdout.write('[THINK: ' + out.thinking + ']');
  if (out.content) process.stdout.write('[CONTENT: ' + out.content + ']');
}
console.log('\n\nExtraction simulation complete.');

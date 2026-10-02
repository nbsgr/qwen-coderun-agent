function extractLastOpenAiBlock(text) {
  if (!text) return null;
  // Look for {"id": or {"choices":
  var lastObjStart = text.lastIndexOf('{"id"');
  if (lastObjStart === -1) lastObjStart = text.lastIndexOf('{"choices"');
  if (lastObjStart === -1) lastObjStart = text.indexOf('{');
  if (lastObjStart === -1) return null;

  var sub = text.substring(lastObjStart).trim();
  try {
    return JSON.parse(sub);
  } catch (_) {}

  var lastBrace = sub.lastIndexOf('}');
  if (lastBrace !== -1) {
    try {
      return JSON.parse(sub.substring(0, lastBrace + 1));
    } catch (_) {}
  }

  return null;
}

function extractReasoningField(text) {
  if (!text) return '';
  var target = '"reasoning":';
  var lastIdx = text.lastIndexOf(target);
  if (lastIdx === -1) return '';

  var quoteIdx = text.indexOf('"', lastIdx + target.length);
  if (quoteIdx === -1) return '';

  var start = quoteIdx + 1;
  var i = start;
  var end = -1;
  while (i < text.length) {
    if (text[i] === '"' && text[i - 1] !== '\\') {
      var after = text.substring(i + 1).trim();
      if (after.startsWith(',') || after.startsWith('}') || after.startsWith('"content"') || after.startsWith('"tool_calls"')) {
        end = i;
        break;
      }
    }
    i++;
  }

  if (end !== -1) {
    var rawVal = text.substring(quoteIdx, end + 1);
    try {
      return JSON.parse(rawVal);
    } catch (_) {
      return text.substring(start, end)
        .replace(/\\n/g, '\n')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
    }
  }

  return '';
}

function extractContentField(text) {
  if (!text) return '';
  var target = '"content":';
  var lastIdx = text.lastIndexOf(target);
  if (lastIdx === -1) return '';

  var quoteIdx = text.indexOf('"', lastIdx + target.length);
  if (quoteIdx === -1) return '';

  var start = quoteIdx + 1;
  var i = start;
  var end = -1;
  while (i < text.length) {
    if (text[i] === '"' && text[i - 1] !== '\\') {
      var after = text.substring(i + 1).trim();
      if (after.startsWith(',') || after.startsWith('}') || after.startsWith('"tool_calls"') || after.startsWith('"finish_reason"') || after.length === 0) {
        end = i;
        break;
      }
    }
    i++;
  }

  if (end !== -1) {
    var rawVal = text.substring(quoteIdx, end + 1);
    try {
      return JSON.parse(rawVal);
    } catch (_) {
      return text.substring(start, end)
        .replace(/\\n/g, '\n')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
    }
  }

  return '';
}

function extractToolCallsField(text) {
  if (!text) return [];
  var target = '"tool_calls":';
  var lastIdx = text.lastIndexOf(target);
  if (lastIdx === -1) return [];

  var bracketIdx = text.indexOf('[', lastIdx + target.length);
  if (bracketIdx === -1) return [];

  var depth = 0;
  var end = -1;
  for (var i = bracketIdx; i < text.length; i++) {
    if (text[i] === '[') depth++;
    else if (text[i] === ']') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  if (end !== -1) {
    try {
      return JSON.parse(text.substring(bracketIdx, end + 1));
    } catch (_) {}
  }
  return [];
}

import { cleanAndParseOpenAiJson } from '../src/providerQwen.js';

var malformedOutput = '{\n"id": "chatcmpl-qwen",\n"object": "chat.completion",\n"choices": [\n{\n"index": 0,\n"message": {\n"role": "assistant",\n"reasoning": "The user has now attached two images (image1.png and pastedimage.png). I need to analyze them... \'If{ the user provides an image\' \\"idpassed in visual context),\': \'chatcmpl-qwen\'",\n"content": "Got it now, Balu! 🎉 I can see your screen clearly.\\n\\n## What I See in Your Screenshot",\n"tool_calls": []\n},\n"finish_reason": "stop"\n}\n]\n}';

var malformedToolCalls = '{\n"id": "chatcmpl-qwen",\n"choices": [{\n"message": {\n"role": "assistant",\n"reasoning": "Unescaped quotes "here" test",\n"content": "",\n"tool_calls": [\n{\n"id": "call_1",\n"type": "function",\n"function": { "name": "get_file_info", "arguments": { "filepath": "image1.png" } }\n}\n]\n}\n}]\n}';

var parsedTools = cleanAndParseOpenAiJson(malformedToolCalls);
console.log('Cleaned and parsed tool calls successfully:', !!parsedTools);
if (parsedTools) {
  console.log('Extracted Tools:', JSON.stringify(parsedTools.choices[0].message.tool_calls));
}


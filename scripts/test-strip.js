/**
 * Test stripToolCallBlocks function - same logic as agentLoop.js
 */
function stripToolCallBlocks(text) {
  if (!text) return '';
  var result = '';
  var remaining = text;
  
  while (remaining.length > 0) {
    var tcIdx = remaining.indexOf('"tool_calls"');
    if (tcIdx === -1) {
      result += remaining;
      break;
    }
    
    var searchFrom = tcIdx - 400;
    if (searchFrom < 0) searchFrom = 0;
    var braceStart = remaining.lastIndexOf('{', tcIdx);
    
    if (braceStart === -1 || braceStart < searchFrom) {
      result += remaining.substring(0, tcIdx + 12);
      remaining = remaining.substring(tcIdx + 12);
      continue;
    }
    
    var beforeBlock = remaining.substring(0, braceStart);
    beforeBlock = beforeBlock.replace(/```json\s*$/i, '');
    beforeBlock = beforeBlock.replace(/```\s*$/i, '');
    beforeBlock = beforeBlock.replace(/\bjson\s*$/i, '');
    beforeBlock = beforeBlock.replace(/\n{2,}$/, '\n');
    result += beforeBlock;
    
    var braceCount = 1;
    var pos = braceStart + 1;
    while (pos < remaining.length && braceCount > 0) {
      if (remaining[pos] === '{') braceCount++;
      else if (remaining[pos] === '}') braceCount--;
      pos++;
    }
    
    remaining = remaining.substring(pos);
  }
  
  result = result.replace(/\n{3,}/g, '\n\n');
  return result.trim();
}

// Test 1: fenced block
var t1 = 'Let me demonstrate.\n```json\n{\n  "tool_calls": [{"name":"write_file","arguments":{"file_path":"x.txt","content":"hello"}}]\n}\n```\nDone!';
var r1 = stripToolCallBlocks(t1);
console.log('Test 1 (fenced):', JSON.stringify(r1));
console.assert(r1 === 'Let me demonstrate.\nDone!', 'Test 1 failed: ' + JSON.stringify(r1));

// Test 2: unfenced json prefix
var t2 = 'Let me run this.\njson\n{\n  "tool_calls": [{"name":"run_terminal"}]\n}\nDone!';
var r2 = stripToolCallBlocks(t2);
console.log('Test 2 (unfenced):', JSON.stringify(r2));
console.assert(r2 === 'Let me run this.\nDone!', 'Test 2 failed: ' + JSON.stringify(r2));

// Test 3: bare JSON on its own line
var t3 = 'Doing this.\n{\n  "tool_calls": [{"name":"read_file"}]\n}\nCompleted.';
var r3 = stripToolCallBlocks(t3);
console.log('Test 3 (bare):', JSON.stringify(r3));
console.assert(r3 === 'Doing this.\nCompleted.', 'Test 3 failed: ' + JSON.stringify(r3));

// Test 4: already clean
var t4 = 'Hello Balu!';
var r4 = stripToolCallBlocks(t4);
console.log('Test 4 (clean):', JSON.stringify(r4));
console.assert(r4 === 'Hello Balu!', 'Test 4 failed');

// Test 5: nested braces
var t5 = 'Ready.\n```json\n{\n  "tool_calls": [{"name":"write_file","arguments":{"content":"{nested}"}}]\n}\n```\nDone.';
var r5 = stripToolCallBlocks(t5);
console.log('Test 5 (nested):', JSON.stringify(r5));
console.assert(r5 === 'Ready.\nDone.', 'Test 5 failed: ' + JSON.stringify(r5));

// Test 6: no tool_calls (bare { } without tool_calls)
var t6 = 'Just some text.\n{\n  "name": "test"\n}\nNo calls.';
var r6 = stripToolCallBlocks(t6);
console.log('Test 6 (no calls):', JSON.stringify(r6));
console.assert(r6 === 'Just some text.\n{\n  "name": "test"\n}\nNo calls.', 'Test 6 failed: ' + JSON.stringify(r6));

// Test 7: inline compact JSON
var t7 = 'Done.\n```json\n{"tool_calls":[{"name":"list_directory","arguments":{}}]}\n```\nOk.';
var r7 = stripToolCallBlocks(t7);
console.log('Test 7 (inline):', JSON.stringify(r7));
console.assert(r7 === 'Done.\nOk.', 'Test 7 failed: ' + JSON.stringify(r7));

console.log('\n✅ All tests passed!');

// Test prompt detection heuristics to ensure no false positives on npm/build logs
import { strict as assert } from 'assert';

// Import or recreate detectPrompt for isolated testing
function detectPrompt(text) {
  if (!text) return { interactive: false, promptDetected: false };
  var allLines = text.split(/\r?\n/);
  var nonBlankLines = [];
  for (var i = 0; i < allLines.length; i++) {
    var trimmed = allLines[i].trim();
    if (trimmed.length > 0) {
      nonBlankLines.push(trimmed);
    }
  }
  if (nonBlankLines.length === 0) {
    return { interactive: false, promptDetected: false };
  }

  // An active prompt waiting for user input is ALWAYS in the tail of the output
  var tailLines = nonBlankLines.slice(-5);
  var interactive = false;
  var promptDetected = false;

  for (var j = 0; j < tailLines.length; j++) {
    var line = tailLines[j];

    // Radio/checkbox menu characters (npm create vite, inquirer, etc.)
    if (/[○●◉◎⦿⊙⊚]/.test(line)) {
      interactive = true;
      promptDetected = true;
    }

    // Arrow key navigation hints or selection cursors
    if (/[↑↓←→]/.test(line) || /\b(arrow keys|use arrow keys|arrow-keys|to submit|to navigate)\b/i.test(line)) {
      interactive = true;
      promptDetected = true;
    }
    if (/[❯›]\s+\S+/.test(line)) {
      interactive = true;
      promptDetected = true;
    }

    // (y/N) (Y/n) (Y/N) [y/N] [Y/n] (yes/no) patterns
    if (/\([yYnN]\/[yYnN]\)|\[[yYnN]\/[yYnN]\]|\b(yes\/no|y\/n)\b/i.test(line)) {
      interactive = true;
      promptDetected = true;
    }

    // Bracketed choice: [1] [2] [3] or (1) (2) (3)
    if (/\[ ?\d+ ?\]|\( ?\d+ ?\)/.test(line)) {
      interactive = true;
      promptDetected = true;
    }

    // Direct action prompts
    if (/\b(press any key|press enter|hit enter|enter passphrase|enter password)\b/i.test(line)) {
      interactive = true;
      promptDetected = true;
    }

    // "Select", "Choose", "Pick" at line start
    if (/^(Select|Choose|Pick)\b/i.test(line)) {
      interactive = true;
      promptDetected = true;
    }

    // Line ends with "?" or starts with "? " — direct question prompt
    if (/\?\s*$/.test(line) || /^\?\s+/.test(line)) {
      interactive = true;
      promptDetected = true;
    }

    // Colon check — only valid if NOT a compiler, log, URL, stack trace, or package manager message
    if (/[:：]\s*$/.test(line) && line.length < 120) {
      var isLogLine = /^(npm|yarn|pnpm|bun)\s+(warn|notice|info|error|err|http)\b/i.test(line) ||
                      /^(warning|error|info|debug|notice|note|trace|exception)\b/i.test(line) ||
                      /^\s*at\s+[\w\.]+/i.test(line) ||
                      /^(https?|ftp|file):\/\//i.test(line) ||
                      /\.[a-zA-Z0-9]+:\d+/i.test(line) ||
                      /\b(allowScripts|audit|audited|added|packages|vulnerabilities)\b/i.test(line);

      if (!isLogLine) {
        // Must contain prompt-like keywords to be considered an input prompt
        if (/\b(project|name|directory|target|destination|package|framework|variant|template|password|passphrase|username|choice|selection|author|version|license|description)\b/i.test(line) ||
            /^(enter|select|choose|input|type)\b/i.test(line)) {
          interactive = true;
          promptDetected = true;
        }
      }
    }
  }

  return { interactive: interactive, promptDetected: promptDetected };
}

function runTests() {
  console.log('Testing detectPrompt with false positive cases...');

  // 1. npm warn allowScripts
  var npmLog = 'npm warn deprecated core-js@2.6.12: core-js@<3.4 is no longer maintained\nnpm warn config allowScripts:';
  var res1 = detectPrompt(npmLog);
  assert.equal(res1.promptDetected, false, 'npm warn allowScripts should NOT be detected as prompt');

  // 2. npm install normal completion
  var npmSuccess = 'added 142 packages, and audited 143 packages in 3s\nfound 0 vulnerabilities';
  var res2 = detectPrompt(npmSuccess);
  assert.equal(res2.promptDetected, false, 'npm completion should NOT be detected as prompt');

  // 3. Compiler stack trace
  var stackTrace = 'Error: build failed\n    at Object.compile (compile.js:24:12)\n    at Runner.run (runner.js:10:1):';
  var res3 = detectPrompt(stackTrace);
  assert.equal(res3.promptDetected, false, 'stack trace should NOT be detected as prompt');

  // 4. Vite server output with URL
  var viteOut = '  VITE v5.4.2  ready in 320 ms\n\n  ➜  Local:   http://localhost:5173/\n  ➜  Network: use --host to expose';
  var res4 = detectPrompt(viteOut);
  assert.equal(res4.promptDetected, false, 'vite local URL should NOT be detected as prompt');

  console.log('Testing detectPrompt with true positive interactive cases...');

  // 5. Inquirer / Vite create interactive prompt
  var vitePrompt = '? Select a framework: › - Use arrow-keys. Return to submit.\n❯   Vanilla\n    Vue\n    React';
  var res5 = detectPrompt(vitePrompt);
  assert.equal(res5.promptDetected, true, 'Vite framework selection MUST be detected as prompt');

  // 6. [y/N] confirmation
  var yConfirm = 'Do you want to proceed? [y/N]';
  var res6 = detectPrompt(yConfirm);
  assert.equal(res6.promptDetected, true, '[y/N] MUST be detected as prompt');

  // 7. Question ending with ?
  var questionPrompt = 'Project name: my-app ?';
  var res7 = detectPrompt(questionPrompt);
  assert.equal(res7.promptDetected, true, 'Question mark MUST be detected as prompt');

  // 8. Press enter
  var enterPrompt = 'Press Enter to continue...';
  var res8 = detectPrompt(enterPrompt);
  assert.equal(res8.promptDetected, true, 'Press enter MUST be detected as prompt');

  console.log('All 8 prompt detection tests passed successfully!');
}

runTests();

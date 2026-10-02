// extension.js — Qwen CodeRun AI Agent Extension
// All provider settings (URL, model, provider) are read from VS Code user settings.
// API key is stored in VS Code secrets.

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { fileURLToPath } from 'url';
import { runAgent } from './agent.js';
import * as agentLoop from './agentLoop.js';
import { registerAllTools } from './tools.js';
import * as config from './config.js';
import * as providerManager from './providerManager.js';
import { getWorkspaceFolder } from './workspaceContext.js';
import * as terminalManager from './terminalManager.js';
import * as permissions from './permissions.js';
import * as projectKnowledge from './projectKnowledge.js';
import * as checkpointManager from './checkpointManager.js';
import * as diffManager from './diffManager.js';
import { PROVIDER_DEFAULTS } from './constants.js';
import * as browserLoginManager from './browserLoginManager.js';
import { cleanAndParseOpenAiJson, stopChat as qwenStopChat } from './providerQwen.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let statusBarItem;
let currentWebview = null;
let sidebarWebviewView = null;
let extensionContext = null;
let currentAbortController = null;

function mergeSetCookies(currentCookieStr, setCookiesArray) {
  if (!setCookiesArray || !setCookiesArray.length) return currentCookieStr;
  
  if (currentCookieStr && currentCookieStr.trim().startsWith('eyJ')) {
    currentCookieStr = 'token=' + currentCookieStr.trim();
  }
  
  var cookieMap = new Map();
  if (currentCookieStr) {
    var parts = currentCookieStr.split(';');
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i].trim();
      if (!part) continue;
      var eqIdx = part.indexOf('=');
      if (eqIdx !== -1) {
        var key = part.substring(0, eqIdx).trim();
        var val = part.substring(eqIdx + 1).trim();
        if (key) cookieMap.set(key, val);
      } else if (part.startsWith('eyJ')) {
        cookieMap.set('token', part);
      }
    }
  }
  
  for (var j = 0; j < setCookiesArray.length; j++) {
    var setCookieStr = setCookiesArray[j];
    var mainPart = setCookieStr.split(';')[0].trim();
    var eqIdx2 = mainPart.indexOf('=');
    if (eqIdx2 !== -1) {
      var key2 = mainPart.substring(0, eqIdx2).trim();
      var val2 = mainPart.substring(eqIdx2 + 1).trim();
      if (key2) cookieMap.set(key2, val2);
    }
  }
  
  var newParts = [];
  cookieMap.forEach(function(val, key) {
    newParts.push(key + '=' + val);
  });
  return newParts.join('; ');
}

globalThis.qwenMergeSetCookies = mergeSetCookies;

// =====================================================
// ACTIVATE
// =====================================================
export function activate(context) {
  console.log('[QWEN_CODERUN] Extension Activated');
  extensionContext = context;

  try {
    var key = context.globalState.get('qwen-coderun.fallbackCookie') || '';
    fs.writeFileSync('D:/coderun-extension/debug_auth.log', JSON.stringify({
      timestamp: new Date().toISOString(),
      activated: true,
      hasContext: !!context,
      cookieLength: key ? key.length : 0,
      cookieStart: key ? key.substring(0, 30) : '',
      globalStateKeys: context ? context.globalState.keys() : []
    }, null, 2));
  } catch (err) {
    console.error('[QWEN_CODERUN] activate write error:', err);
  }

  globalThis.qwenOnCookieUpdate = async function(newCookie) {
    if (context && newCookie) {
      await config.setApiKey(context, newCookie);
      console.log('[QWEN_CODERUN] Cookies updated and saved automatically!');
    }
  };

  globalThis.qwenGetActiveCookie = function() {
    return (context && context.globalState && context.globalState.get('qwen-coderun.fallbackCookie')) || '';
  };

  // Register all tools
  registerAllTools();

  // Give the permission system access to extensionContext for "always" persistence
  permissions.setExtensionContext(context);

  // Register terminal shell integration listeners
  terminalManager.registerTerminalListeners(context);

  // Initialize project knowledge base (SQLite, indexing, file watcher, memory)
  projectKnowledge.initialize(context);

  // Status bar
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'qwen-coderun.openSidebar';
  statusBarItem.text = '$(comment-discussion) Qwen CodeRun';
  statusBarItem.tooltip = 'Open Qwen CodeRun AI Agent';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('qwen-coderun.openSidebar', function() {
      vscode.commands.executeCommand('qwen-coderun.chatView.focus');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('qwen-coderun.openPanel', function() {
      createOrShowPanel(context.extensionUri);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('qwen-coderun.newChat', function() {
      if (currentWebview) {
        currentWebview.postMessage({ type: 'newChat' });
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('qwen-coderun.undoLastEdit', async function() {
      var ws = getWorkspaceFolder();
      if (!ws) {
        vscode.window.showInformationMessage('No workspace folder open');
        return;
      }
      var result = await checkpointManager.undoLast(ws, null);
      if (result.success) {
        vscode.window.showInformationMessage(result.message);
        // Notify the webview to refresh
        if (currentWebview) {
          currentWebview.postMessage({ type: 'undoComplete', message: result.message });
        }
      } else {
        vscode.window.showInformationMessage(result.message || 'Nothing to undo');
      }
    })
  );

  // Sidebar provider
  var sidebarProvider = createSidebarWebviewViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('qwen-coderun.chatView', sidebarProvider, {
      webviewOptions: { retainContextWhenHidden: true }
    })
  );

  // Terminal cleanup
  context.subscriptions.push(
    vscode.window.onDidCloseTerminal(function(terminal) {
      terminalManager.onTerminalClosed(terminal);
    })
  );

  // Config changes — when user edits settings.json, notify webview
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async function(e) {
      if (e.affectsConfiguration('qwen-coderun')) {
        config.invalidateCache();
        if (currentWebview) {
          await sendCurrentSettings(currentWebview);
          await checkProviderHealth(currentWebview);
        }
      }
    })
  );
}

function createSidebarWebviewViewProvider(extensionUri) {
  return {
    extensionUri: extensionUri,
    resolveWebviewView: function(webviewView, context, token) {
      console.log('[QWEN_CODERUN] resolveWebviewView called');
      try {
        fs.appendFileSync('D:/coderun-extension/debug_auth.log', '\n[EVENT] ' + new Date().toISOString() + ' - resolveWebviewView called\n');
      } catch (_) {}
      sidebarWebviewView = webviewView;

      webviewView.webview.options = {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.file(path.join(extensionUri.fsPath, 'src'))]
      };

      webviewView.webview.html = getWebviewHtml(webviewView.webview, extensionUri);

      webviewView.webview.onDidReceiveMessage(function(message) {
        handleFrontendMessage(message, webviewView.webview);
      });

      currentWebview = webviewView.webview;
    }
  };
}

// =====================================================
// PANEL CREATOR
// =====================================================
function createOrShowPanel(extensionUri) {
  try {
    fs.appendFileSync('D:/coderun-extension/debug_auth.log', `\n[EVENT] ${new Date().toISOString()} - createOrShowPanel called\n`);
  } catch (_) {}
  var panel = vscode.window.createWebviewPanel(
    'qwen-coderunPanel',
    'Qwen CodeRun Agent',
    vscode.ViewColumn.Two,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.file(path.join(extensionUri.fsPath, 'src'))]
    }
  );

  panel.webview.html = getWebviewHtml(panel.webview, extensionUri);

  panel.webview.onDidReceiveMessage(function(message) {
    handleFrontendMessage(message, panel.webview);
  });

  currentWebview = panel.webview;
}

// =====================================================
// HTML GENERATOR
// =====================================================
function getWebviewHtml(webview, extensionUri) {
  var srcPath = path.join(extensionUri.fsPath, 'src');
  var nonce = getNonce();

  var dashboardCss = webview.asWebviewUri(vscode.Uri.file(path.join(srcPath, 'Dashboard.css')));
  var chatSpaceCss = webview.asWebviewUri(vscode.Uri.file(path.join(srcPath, 'ChatSpace.css')));
  var markdownJs = webview.asWebviewUri(vscode.Uri.file(path.join(srcPath, 'MarkdownRenderer.js')));
  var dashboardJs = webview.asWebviewUri(vscode.Uri.file(path.join(srcPath, 'Dashboard.js')));
  var chatSpaceJs = webview.asWebviewUri(vscode.Uri.file(path.join(srcPath, 'ChatSpace.js')));

  var workspaceFolder = getWorkspaceFolder();
  var cfg = config.getConfig();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data: blob:; font-src ${webview.cspSource} https:; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'nonce-${nonce}' 'unsafe-eval'; connect-src https: http:;">
  <title>Qwen CodeRun Agent</title>
  <link rel="stylesheet" href="${dashboardCss}">
  <link rel="stylesheet" href="${chatSpaceCss}">
  <script nonce="${nonce}">
    window.addEventListener('error', function(e) {
      if (window.VSCODE_API) {
        window.VSCODE_API.postMessage({
          type: 'webviewError',
          message: e.message,
          filename: e.filename,
          lineno: e.lineno,
          colno: e.colno,
          error: e.error ? e.error.stack : ''
        });
      }
    });
  </script>
</head>
<body>
  <div id="app"></div>

  <script nonce="${nonce}">
    window.QWEN_CODERUN_CONFIG = ${JSON.stringify({ provider: cfg.provider, baseUrl: cfg.baseUrl, model: cfg.model })};
    window.WORKSPACE_FOLDER = ${JSON.stringify(workspaceFolder)};
    window.VSCODE = true;
    try {
      const vscode = acquireVsCodeApi();
      window.VSCODE_API = vscode;
      console.log("[QWEN_CODERUN WEBVIEW] VS Code API acquired");
    } catch(e) {
      console.error("[QWEN_CODERUN WEBVIEW] Failed to acquire VS Code API:", e);
    }
  </script>

  <script nonce="${nonce}" src="${markdownJs}"></script>
  <script nonce="${nonce}" src="${dashboardJs}"></script>
  <script nonce="${nonce}" src="${chatSpaceJs}"></script>

  <script nonce="${nonce}">
    console.log("[QWEN_CODERUN WEBVIEW] Scripts loaded, calling renderDashboard...");
    if (typeof renderDashboard === 'function') {
      renderDashboard(document.getElementById('app'));
    } else {
      document.getElementById('app').innerHTML = '<div style="color:red;padding:20px;">Error: renderDashboard not found</div>';
    }
  </script>
</body>
</html>`;
}

function getNonce() {
  var text = '';
  var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (var i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

// =====================================================
// SEND CURRENT SETTINGS TO WEBVIEW
// =====================================================
async function sendCurrentSettings(webview) {
  var activeProvider = extensionContext?.globalState.get('qwen-coderun_selected_provider', '') || '';
  var cfg;
  if (activeProvider) {
    var saved = config.getSavedProviderConfig(extensionContext, activeProvider) || {};
    var isCompatible = activeProvider.startsWith('compatible');
    var defaults = isCompatible ? PROVIDER_DEFAULTS.compatible : (PROVIDER_DEFAULTS[activeProvider] || PROVIDER_DEFAULTS.ollama);
    cfg = {
      provider: activeProvider,
      baseUrl: saved.baseUrl || defaults.baseUrl,
      model: saved.model || '',
      maxIterations: config.getConfig().maxIterations,
      streaming: config.getConfig().streaming,
      showThinking: config.getConfig().showThinking,
      confirmDangerous: config.getConfig().confirmDangerous
    };
  } else {
    cfg = config.getConfig();
  }

  var hasKey = false;
  try {
    if (activeProvider) {
      var saved = config.getSavedProviderConfig(extensionContext, activeProvider);
      hasKey = saved && !!saved.apiKey;
    } else {
      var key = await config.getApiKey(extensionContext);
      hasKey = !!key && key.length > 0;
    }
  } catch (e) {
    hasKey = false;
  }

  // Include all saved provider configs so the frontend can show them
  var providerConfigs = config.getAllProviderConfigs(extensionContext);

  webview.postMessage({
    type: 'currentSettings',
    settings: {
      provider: cfg.provider,
      baseUrl: cfg.baseUrl,
      model: cfg.model,
      maxIterations: cfg.maxIterations,
      streaming: cfg.streaming,
      showThinking: cfg.showThinking,
      confirmDangerous: cfg.confirmDangerous,
      hasApiKey: hasKey
    },
    providerConfigs: providerConfigs
  });
}

async function qwenGetHeaders(context) {
  var cookieStr = await config.getApiKey(context) || '';
  if (!cookieStr) return null;
  
  var token = '';
  var finalCookie = cookieStr;
  
  if (cookieStr.trim().startsWith('eyJ')) {
    token = cookieStr.trim();
    finalCookie = 'token=' + token;
  } else {
    var parts = cookieStr.split(';');
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i].trim();
      if (part.startsWith('token=')) {
        token = part.substring(6);
        break;
      }
    }
  }

  var h = {
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Connection': 'keep-alive',
    'Host': 'chat.qwen.ai',
    'Sec-Ch-Ua': '"Not/A)Brand";v="99", "Chromium";v="148"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'source': 'web',
    'timezone': new Date().toString(),
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Code/1.130.0 Chrome/148.0.7778.280 Electron/42.6.0 Safari/537.36',
    'version': '0.2.78',
    'Referer': 'https://chat.qwen.ai/',
    'Origin': 'https://chat.qwen.ai',
    'Cookie': finalCookie
  };
  if (token) h['authorization'] = 'Bearer ' + token;
  return h;
}

async function fetchQwenChatsList(context) {
  var headers = await qwenGetHeaders(context);
  if (!headers) {
    console.error('[QWEN_CODERUN] qwenGetHeaders returned null');
    return { success: false, isAuthError: true, error: 'No Qwen session cookie found.' };
  }
  headers['x-request-id'] = 'req-uuid-' + Date.now();
  
  try {
    var r = await fetch('https://chat.qwen.ai/api/v2/chats', { headers: headers });
    console.log('[QWEN_CODERUN] fetchQwenChatsList response status:', r.status);
    
    if (r.ok) {
      var setCookies = typeof r.headers.getSetCookie === 'function' ? r.headers.getSetCookie() : (r.headers.get('set-cookie') ? r.headers.get('set-cookie').split(',') : null);
      if (setCookies && setCookies.length && typeof globalThis.qwenOnCookieUpdate === 'function') {
        var currentCookie = await config.getApiKey(context);
        var merged = mergeSetCookies(currentCookie, setCookies);
        if (merged !== currentCookie) {
          await globalThis.qwenOnCookieUpdate(merged);
        }
      }
      var text = await r.text();
      try {
        var data = JSON.parse(text);
        if (data.success) {
          return { success: true, data: data.data || [] };
        } else {
          console.error('[QWEN_CODERUN] fetchQwenChatsList API success is false:', data);
          var detailStr = (data.data && data.data.details) || data.message || '';
          var isAuth = (data.data && data.data.code === 'unauthorized') || (typeof detailStr === 'string' && (detailStr.indexOf('expired') !== -1 || detailStr.indexOf('unauthorized') !== -1)) || (data.ret && JSON.stringify(data.ret).indexOf('FAIL_SYS_USER_VALIDATE') !== -1);
          return { success: false, isAuthError: isAuth, error: detailStr || 'Failed to list chats' };
        }
      } catch (jsonErr) {
        console.error('[QWEN_CODERUN] fetchQwenChatsList JSON parse error on response:', text.substring(0, 1000));
        return { success: false, isAuthError: false, error: 'Invalid JSON from Qwen API' };
      }
    } else {
      var errText = await r.text();
      console.error('[QWEN_CODERUN] fetchQwenChatsList HTTP error:', r.status, r.statusText, errText.substring(0, 1000));
      return { success: false, isAuthError: r.status === 401 || r.status === 403, error: 'HTTP ' + r.status };
    }
  } catch (e) {
    console.error('[QWEN_CODERUN] Error fetching chats list:', e);
    return { success: false, isAuthError: false, error: e.message };
  }
}

async function fetchQwenChatDetail(context, chatId) {
  var headers = await qwenGetHeaders(context);
  if (!headers) return { success: false, isAuthError: true, error: 'No Qwen session cookie found.' };
  headers['x-request-id'] = 'req-uuid-' + Date.now();
  headers['Referer'] = 'https://chat.qwen.ai/c/' + chatId;
  
  try {
    var r = await fetch('https://chat.qwen.ai/api/v2/chats/' + chatId, { headers: headers });
    console.log('[QWEN_CODERUN] fetchQwenChatDetail status:', r.status);
    if (r.ok) {
      var setCookies = typeof r.headers.getSetCookie === 'function' ? r.headers.getSetCookie() : (r.headers.get('set-cookie') ? r.headers.get('set-cookie').split(',') : null);
      if (setCookies && setCookies.length && typeof globalThis.qwenOnCookieUpdate === 'function') {
        var currentCookie = await config.getApiKey(context);
        var merged = mergeSetCookies(currentCookie, setCookies);
        if (merged !== currentCookie) {
          await globalThis.qwenOnCookieUpdate(merged);
        }
      }
      var text = await r.text();
      try {
        var data = JSON.parse(text);
        if (data.success && data.data && data.data.chat) {
          return { success: true, messages: data.data.chat.messages || [] };
        } else {
          console.error('[QWEN_CODERUN] fetchQwenChatDetail API success is false or missing data:', data);
          var detailStr2 = (data.data && data.data.details) || data.message || '';
          var isAuth2 = (data.data && data.data.code === 'unauthorized') || (typeof detailStr2 === 'string' && (detailStr2.indexOf('expired') !== -1 || detailStr2.indexOf('unauthorized') !== -1)) || (data.ret && JSON.stringify(data.ret).indexOf('FAIL_SYS_USER_VALIDATE') !== -1);
          return { success: false, isAuthError: isAuth2, error: detailStr2 || 'Failed to fetch details.' };
        }
      } catch (jsonErr) {
        console.error('[QWEN_CODERUN] fetchQwenChatDetail JSON parse error on response:', text.substring(0, 1000));
        return { success: false, isAuthError: false, error: 'Invalid JSON from Qwen API' };
      }
    } else {
      var errText2 = await r.text();
      console.error('[QWEN_CODERUN] fetchQwenChatDetail HTTP error:', r.status, r.statusText, errText2.substring(0, 1000));
      return { success: false, isAuthError: r.status === 401 || r.status === 403, error: 'HTTP ' + r.status };
    }
  } catch (e) {
    console.error('[QWEN_CODERUN] Error fetching chat detail:', e);
    return { success: false, isAuthError: false, error: e.message };
  }
}

// =====================================================
// QWEN CHAT HISTORY RECONSTRUCTION HELPERS
// =====================================================
function parseAssistantBlock(rawContent, thinkContent, toolIdxStart) {
  var nextToolIdx = toolIdxStart || 0;
  var parsed = cleanAndParseOpenAiJson(rawContent);

  if (parsed && parsed.choices && parsed.choices[0] && parsed.choices[0].message) {
    var choiceMsg = parsed.choices[0].message;
    var thinking = choiceMsg.reasoning || thinkContent || '';
    var content = choiceMsg.content || '';
    var rawCalls = choiceMsg.tool_calls || [];
    var formattedCalls = [];

    for (var i = 0; i < rawCalls.length; i++) {
      var tc = rawCalls[i];
      var fn = tc.function || tc;
      var argsStr = '';
      if (typeof fn.arguments === 'object') {
        try {
          argsStr = JSON.stringify(fn.arguments);
        } catch (_) {
          argsStr = String(fn.arguments || '');
        }
      } else {
        argsStr = String(fn.arguments || '');
      }
      formattedCalls.push({
        id: tc.id || ('hist_tc_' + nextToolIdx++),
        type: 'function',
        function: {
          name: fn.name || '',
          arguments: argsStr
        }
      });
    }

    var resEntry = {
      role: 'assistant',
      thinking: thinking,
      content: content
    };
    if (formattedCalls.length) {
      resEntry.tool_calls = formattedCalls;
    }
    return { entry: resEntry, nextToolIdx: nextToolIdx };
  }

  var calls = [];
  var re = /```json\s*(\{[\s\S]*?\})\s*(?:```|$)/g;
  var m;
  while ((m = re.exec(rawContent)) !== null) {
    try {
      var obj = JSON.parse(m[1].trim());
      if (obj && Array.isArray(obj.tool_calls)) {
        for (var k = 0; k < obj.tool_calls.length; k++) {
          var legTc = obj.tool_calls[k];
          calls.push({
            id: 'hist_tc_' + nextToolIdx++,
            type: 'function',
            function: {
              name: legTc.name,
              arguments: typeof legTc.arguments === 'object' ? JSON.stringify(legTc.arguments) : String(legTc.arguments || '')
            }
          });
        }
      }
    } catch (_) {}
  }

  var cleanContent = rawContent.replace(/```json\s*\{[\s\S]*?"tool_calls"[\s\S]*?\}\s*```/g, '').trim();
  var fallbackEntry = {
    role: 'assistant',
    thinking: thinkContent || '',
    content: cleanContent || (calls.length ? '' : rawContent)
  };
  if (calls.length) {
    fallbackEntry.tool_calls = calls;
  }
  return { entry: fallbackEntry, nextToolIdx: nextToolIdx };
}

function parseAssistantMessage(msg, toolIdxStart) {
  var thinkContent = '';
  var answerContent = '';
  var imageMarkdown = '';
  if (msg.content_list && msg.content_list.length) {
    for (var j = 0; j < msg.content_list.length; j++) {
      var block = msg.content_list[j];
      if (block.phase === 'think') {
        thinkContent += (block.content || '');
      } else if (block.phase === 'answer') {
        answerContent += (block.content || '');
      } else if (block.phase === 'image_gen_tool' && block.extra) {
        var imgList = block.extra.image_list || block.extra.tool_result || [];
        for (var k = 0; k < imgList.length; k++) {
          var imgUrl = imgList[k] && (imgList[k].image || imgList[k].url);
          if (imgUrl) {
            imageMarkdown += '![Generated Image](' + imgUrl + ')\n\n';
          }
        }
      }
    }
  }
  if (!answerContent && !thinkContent) {
    answerContent = msg.content || '';
  }
  if (imageMarkdown) {
    answerContent = imageMarkdown + answerContent;
  }

  return parseAssistantBlock(answerContent, thinkContent, toolIdxStart);
}

function parseSerializedPrompt(text) {
  var historyIdx = text.indexOf('--- CONVERSATION HISTORY ---');
  var currentStepIdx = text.indexOf('--- CURRENT STEP ---');
  var currentReqIdx = text.indexOf('--- CURRENT REQUEST ---');

  if (historyIdx === -1 && currentStepIdx === -1 && currentReqIdx === -1) {
    var legUserIdx = text.lastIndexOf('[User Request]:\n');
    if (legUserIdx !== -1) {
      return [{ role: 'user', content: text.substring(legUserIdx + '[User Request]:\n'.length).trim() }];
    }
    if (text.indexOf('[System tool execution result]:') === 0) {
      return [{ role: 'tool', content: text.substring('[System tool execution result]:\n'.length).trim() }];
    }
    if (text.indexOf('You are an autonomous AI coding agent') !== -1) {
      var lastUserMarker = text.lastIndexOf('\nUser:\n');
      if (lastUserMarker !== -1) {
        return [{ role: 'user', content: text.substring(lastUserMarker + '\nUser:\n'.length).trim() }];
      }
    }
    return [{ role: 'user', content: text.trim() }];
  }

  var extractedMessages = [];
  var historyText = '';

  var endHistoryIdx = -1;
  if (currentStepIdx !== -1 && currentReqIdx !== -1) {
    endHistoryIdx = Math.min(currentStepIdx, currentReqIdx);
  } else if (currentStepIdx !== -1) {
    endHistoryIdx = currentStepIdx;
  } else if (currentReqIdx !== -1) {
    endHistoryIdx = currentReqIdx;
  }

  if (historyIdx !== -1) {
    var rawHist = (endHistoryIdx !== -1)
      ? text.substring(historyIdx + '--- CONVERSATION HISTORY ---'.length, endHistoryIdx)
      : text.substring(historyIdx + '--- CONVERSATION HISTORY ---'.length);
    historyText = rawHist.trim();
  }

  if (historyText) {
    var itemRegex = /(?:^|\n)(User:\n|Assistant:\n|\[Tool Result for ([^\]]+)\]:\n)/g;
    var matches = [];
    var m;
    while ((m = itemRegex.exec(historyText)) !== null) {
      matches.push({
        type: m[1].startsWith('User:') ? 'user' : (m[1].startsWith('Assistant:') ? 'assistant' : 'tool'),
        header: m[2] || '',
        startIndex: m.index,
        contentStart: m.index + m[0].length
      });
    }

    for (var i = 0; i < matches.length; i++) {
      var cur = matches[i];
      var nextStart = (i + 1 < matches.length) ? matches[i + 1].startIndex : historyText.length;
      var chunk = historyText.substring(cur.contentStart, nextStart).trim();

      if (cur.type === 'user') {
        extractedMessages.push({ role: 'user', content: chunk });
      } else if (cur.type === 'tool') {
        var toolId = '';
        var idMatch = cur.header.match(/ID:\s*([^\)]+)/);
        if (idMatch) toolId = idMatch[1].trim();
        extractedMessages.push({
          role: 'tool',
          tool_call_id: toolId,
          content: chunk
        });
      } else if (cur.type === 'assistant') {
        var reasoning = '';
        var content = '';
        var toolCalls = [];

        var rIdx = chunk.indexOf('Reasoning:');
        var tcIdx = chunk.indexOf('Tool Calls:');
        var cIdx = chunk.indexOf('Content:');

        var reasoningEnd = -1;
        if (rIdx !== -1) {
          if (tcIdx !== -1 && tcIdx > rIdx) reasoningEnd = tcIdx;
          else if (cIdx !== -1 && cIdx > rIdx) reasoningEnd = cIdx;
          else reasoningEnd = chunk.length;
          reasoning = chunk.substring(rIdx + 'Reasoning:'.length, reasoningEnd).trim();
        }

        var tcEnd = -1;
        if (tcIdx !== -1) {
          if (cIdx !== -1 && cIdx > tcIdx) tcEnd = cIdx;
          else tcEnd = chunk.length;
          var tcRaw = chunk.substring(tcIdx + 'Tool Calls:'.length, tcEnd).trim();
          try {
            toolCalls = JSON.parse(tcRaw);
          } catch (_) {}
        }

        if (cIdx !== -1) {
          content = chunk.substring(cIdx + 'Content:'.length).trim();
        } else if (rIdx === -1 && tcIdx === -1) {
          content = chunk.trim();
        }

        var aMsg = {
          role: 'assistant',
          thinking: reasoning,
          content: content
        };
        if (toolCalls && toolCalls.length) {
          aMsg.tool_calls = toolCalls;
        }
        extractedMessages.push(aMsg);
      }
    }
  }

  if (currentStepIdx !== -1) {
    var stepText = text.substring(currentStepIdx + '--- CURRENT STEP ---'.length).trim();
    var toolHeaderMatch = stepText.match(/\[(?:Latest )?Tool Execution Result for ([^\]]+)\]:\n([\s\S]*?)(?:\n\nAnalyze this result|$)/);
    if (toolHeaderMatch) {
      var headerStr = toolHeaderMatch[1];
      var stepToolContent = toolHeaderMatch[2].trim();
      var stepToolId = '';
      var sIdMatch = headerStr.match(/ID:\s*([^\)]+)/);
      if (sIdMatch) stepToolId = sIdMatch[1].trim();

      extractedMessages.push({
        role: 'tool',
        tool_call_id: stepToolId,
        content: stepToolContent
      });
    }
  } else if (currentReqIdx !== -1) {
    var reqText = text.substring(currentReqIdx + '--- CURRENT REQUEST ---'.length).trim();
    if (reqText.startsWith('User:\n')) {
      reqText = reqText.substring('User:\n'.length).trim();
    }
    extractedMessages.push({
      role: 'user',
      content: reqText
    });
  }

  return extractedMessages;
}

function parseQwenChatHistory(rawMessages) {
  var formattedMessages = [];
  var toolCallIdx = 0;

  for (var i = 0; i < rawMessages.length; i++) {
    var msg = rawMessages[i];
    var role = msg.role;

    if (role === 'user') {
      var userContent = msg.content || '';
      var unpacked = parseSerializedPrompt(userContent);

      var attachedImages = [];
      var attachedDocs = [];
      if (msg.files && Array.isArray(msg.files)) {
        for (var f = 0; f < msg.files.length; f++) {
          var fileObj = msg.files[f];
          var fileUrl = fileObj.url || (fileObj.file && fileObj.file.url) || '';
          var isImg = fileObj.type === 'image' || fileObj.file_class === 'vision' || (fileObj.file_type && fileObj.file_type.startsWith('image/')) || (fileObj.name && /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(fileObj.name));
          if (isImg && fileUrl) {
            attachedImages.push(fileUrl);
          } else if (fileUrl || fileObj.name) {
            attachedDocs.push({
              name: fileObj.name || 'Document.pdf',
              type: fileObj.file_type || 'application/pdf',
              url: fileUrl,
              isPdf: (fileObj.file_type === 'application/pdf') || (fileObj.name && fileObj.name.toLowerCase().endsWith('.pdf'))
            });
          }
        }
      }

      var targetMsg = null;
      if (rawMessages.length > 2 && formattedMessages.length > 0) {
        if (unpacked.length > 1) {
          targetMsg = unpacked[unpacked.length - 1];
          formattedMessages.push(targetMsg);
        } else if (unpacked.length === 1) {
          targetMsg = unpacked[0];
          formattedMessages.push(targetMsg);
        }
      } else {
        for (var u = 0; u < unpacked.length; u++) {
          formattedMessages.push(unpacked[u]);
          if (unpacked[u].role === 'user') targetMsg = unpacked[u];
        }
      }

      if (targetMsg && targetMsg.role === 'user') {
        if (attachedImages.length > 0) {
          targetMsg.image = attachedImages[0];
          targetMsg.images = attachedImages;
        }
        if (attachedDocs.length > 0) {
          targetMsg.attachment = attachedDocs[0];
          targetMsg.attachments = attachedDocs;
        }
        if (msg.files && msg.files.length) {
          targetMsg.files = msg.files;
        }
      }
    } else if (role === 'assistant') {
      var res = parseAssistantMessage(msg, toolCallIdx);
      toolCallIdx = res.nextToolIdx;
      formattedMessages.push(res.entry);
    }
  }

  return formattedMessages;
}

// =====================================================
// FRONTEND MESSAGE HANDLER
// =====================================================
async function handleFrontendMessage(message, webview) {
  console.log('[QWEN_CODERUN] Received message:', message.type || message.command);
  var msgType = message.type || message.command;

  try {
    fs.appendFileSync('D:/coderun-extension/debug_auth.log', `\n[MSG] ${new Date().toISOString()} - ${msgType}\n`);
  } catch (err) {}

  switch (msgType) {
    case 'webviewReady': {
      var wsFolder = getWorkspaceFolder();
      webview.postMessage({ type: 'workspaceFolder', path: wsFolder });
      try {
        webview.postMessage({
          type: 'permissionState',
          decisions: permissions.listAlwaysDecisions()
        });

        // Check Qwen Auth
        var cookie = await config.getApiKey(extensionContext);
        
        // Log details to debug file
        try {
          fs.writeFileSync('D:/coderun-extension/debug_auth.log', JSON.stringify({
            timestamp: new Date().toISOString(),
            hasExtensionContext: !!extensionContext,
            cookieLength: cookie ? cookie.length : 0,
            cookieStart: cookie ? cookie.substring(0, 30) : '',
            globalStateKeys: extensionContext ? extensionContext.globalState.keys() : []
          }, null, 2));
        } catch (logErr) {
          console.error('[QWEN_CODERUN] Failed to write debug log:', logErr);
        }

        if (cookie) {
          try {
            var chatListRes = await fetchQwenChatsList(extensionContext);
            if (chatListRes && chatListRes.success) {
              webview.postMessage({ type: 'qwenAuthState', authenticated: true });
              var mappedChats = (chatListRes.data || []).map(function(c) {
                return { id: c.id, title: c.title || 'Untitled Session' };
              });
              webview.postMessage({ type: 'loadConversations', conversations: JSON.stringify(mappedChats) });
            } else if (chatListRes && chatListRes.isAuthError) {
              console.warn('[QWEN_CODERUN] Stored token has expired. Prompting user to log in.');
              webview.postMessage({
                type: 'qwenAuthState',
                authenticated: false,
                error: 'Your session token has expired. Please sign in again.'
              });
            } else {
              webview.postMessage({ type: 'qwenAuthState', authenticated: true });
            }
          } catch(e) {
            console.error('[QWEN_CODERUN] Error verifying Qwen auth:', e.message);
            webview.postMessage({ type: 'qwenAuthState', authenticated: false, error: 'Failed to verify Qwen connection: ' + e.message });
          }
        } else {
          webview.postMessage({ type: 'qwenAuthState', authenticated: false });
        }
      } catch (e) {
        console.error('[QWEN_CODERUN] Failed to send initial data:', e);
      }
      // Send current VS Code settings to frontend so UI is in sync
      await sendCurrentSettings(webview);
      break;
    }

    case 'webviewError': {
      try {
        fs.appendFileSync('D:/coderun-extension/debug_auth.log', `\n[WEBVIEW ERROR] ${JSON.stringify(message, null, 2)}\n`);
      } catch (_) {}
      break;
    }

    case 'startChat': {
      var userPrompt = message.message;
      var userImage = message.image || null;
      var userAttachment = message.attachment || null;
      var history = message.history;
      var workspaceFolder = message.workspaceFolder;
      // Start with a fresh terminal only if this is the first message in a new chat session
      if (!history || history.length === 0) {
        terminalManager.resetTerminal();
      }

      // Determine which provider to use from the frontend
      var providerName = message.provider || '';
      var frontendModel = message.model || '';

      // If frontend sent a provider, look up its saved config
      var providerConfig;
      if (providerName && (PROVIDER_DEFAULTS[providerName] || providerName.startsWith('compatible:'))) {
        providerConfig = await config.getProviderConfigByName(extensionContext, providerName);
      } else {
        providerConfig = await config.getProviderConfigWithKey(extensionContext);
      }
      providerConfig.chatId = message.conversationId;

      // Override model from frontend (most important — user selected it)
      if (frontendModel && frontendModel.trim()) {
        providerConfig.model = frontendModel.trim();
      }

      // Validate we have required config
      if (!providerConfig.model) {
        webview.postMessage({
          type: 'agentEvent',
          event: { type: 'stream_error', error: 'No model configured. Please select a model in the Qwen CodeRun model dropdown.' }
        });
        break;
      }

      if (config.needsApiKey(providerConfig.provider) && !providerConfig.apiKey) {
        webview.postMessage({
          type: 'agentEvent',
          event: { type: 'stream_error', error: 'API key required for ' + providerConfig.provider + '. Please set it in Qwen CodeRun settings.' }
        });
        break;
      }

      // Set up terminal event forwarding callback
      terminalManager.setSendEventCallback(function(event) {
        webview.postMessage({ type: 'agentEvent', event: event });
      });

      // Build a permission bridge: the agent calls askPermission(toolName, args, id);
      // we ask the webview, the user clicks Allow/Deny/Always-*, and the webview
      // calls back via 'permissionResponse' which routes into
      // permissions.resolvePermission — which resolves the right Promise.
      var askPermission = function(toolName, args, id) {
        // Short-circuit: if a persistent "always" decision exists, requestPermission
        // returns a resolved promise immediately and no UI prompt is needed.
        var persistent = permissions.getAlwaysDecision(toolName);
        if (persistent) {
          sendEvent({
            type: 'requestPermission',
            tool: toolName,
            arguments: args,
            id: id,
            autoResolved: true,
            decision: persistent
          });
          return Promise.resolve(persistent === 'allow');
        }
        // Otherwise: ask the webview to render the 4-button permission card.
        sendEvent({
          type: 'requestPermission',
          tool: toolName,
          arguments: args,
          id: id
        });
        return permissions.requestPermission(toolName, args, id, null);
      };

      var sendEvent = function(event) {
        webview.postMessage({ type: 'agentEvent', event: event });

        // Handle diff review requests — store as pending patch
        if (event.type === 'request_diff' && event.id) {
          diffManager.storePatch(event);
        }
      };

      // Cooperative stop: the frontend can fire 'stopChat' to set this flag,
      // the agent loop checks it between iterations.
      currentAbortController = { stopped: false };
      var abortCtrl = currentAbortController;

      try {
        console.log('[EXTENSION] Calling runAgent...');
        globalThis.qwenActiveConfig = providerConfig;
        await runAgent(userPrompt, providerConfig.model, workspaceFolder, history, providerConfig, sendEvent, askPermission, { signal: abortCtrl, image: userImage, attachment: userAttachment });
        console.log('[EXTENSION] runAgent completed');
        webview.postMessage({ type: 'agentEvent', event: { type: 'stream_end', stopped: abortCtrl.stopped } });
        
        if (providerConfig.chatId && message.conversationId && message.conversationId !== providerConfig.chatId) {
          webview.postMessage({
            type: 'qwenChatIdTransition',
            oldId: message.conversationId,
            newId: providerConfig.chatId
          });
        }
      } catch (err) {
        console.error('[EXTENSION] Agent error:', err);
        var isAuth = !!err.isAuthError || (err.message && (err.message.indexOf('Token has expired') !== -1 || err.message.indexOf('unauthorized') !== -1));
        webview.postMessage({
          type: 'agentEvent',
          event: {
            type: 'stream_error',
            error: err.message,
            isAuthError: isAuth
          }
        });
      } finally {
        console.log('[EXTENSION] runAgent finally block');
        if (currentAbortController === abortCtrl) currentAbortController = null;
      }
      break;
    }

    case 'stopChat': {
      if (currentAbortController) {
        currentAbortController.stopped = true;
      }
      permissions.cancelAllPermissions();
      diffManager.cancelAll();
      try {
        qwenStopChat(globalThis.qwenActiveConfig);
      } catch (_) {}
      break;
    }

    case 'permissionResponse': {
      permissions.resolvePermission(
        message.toolCallId,
        !!message.approved,
        { always: !!message.always, tool: message.tool }
      );
      break;
    }

    case 'clearPermissionDecision': {
      if (message.tool) {
        permissions.clearAlwaysDecision(message.tool);
      } else {
        permissions.clearAlwaysDecision();
      }
      webview.postMessage({
        type: 'permissionState',
        decisions: permissions.listAlwaysDecisions()
      });
      break;
    }

    case 'showAlert': {
      if (message.message) vscode.window.showErrorMessage(message.message);
      break;
    }

    case 'confirmDelete': {
      vscode.window.showWarningMessage(
        'Delete this conversation?',
        { modal: true },
        'Delete'
      ).then(function(choice) {
        if (choice === 'Delete' && webview) {
          webview.postMessage({ type: 'deleteConversationConfirmed', id: message.id });
        }
      });
      break;
    }

    case 'confirmClearAll': {
      vscode.window.showWarningMessage(
        'Delete ALL conversations? This cannot be undone.',
        { modal: true },
        'Delete All'
      ).then(function(choice) {
        if (choice === 'Delete All' && webview) {
          webview.postMessage({ type: 'clearAllConversationsConfirmed' });
        }
      });
      break;
    }

    case 'runInTerminal':
    case 'terminalCommand': {
      terminalManager.executeCommandLegacy(message.text);
      break;
    }

    case 'requestWorkspaceFolder': {
      webview.postMessage({ type: 'workspaceFolder', path: getWorkspaceFolder() });
      break;
    }

    case 'saveConversations': {
      if (message.conversations && extensionContext) {
        try {
          await extensionContext.globalState.update('qwen-coderun_conversations', message.conversations);
        } catch (e) {
          console.error('[QWEN_CODERUN] Failed to save conversations:', e);
        }
      }
      break;
    }

    case 'saveSelectedModel': {
      if (message.model && extensionContext) {
        try {
          await extensionContext.globalState.update('qwen-coderun_selected_model', message.model);
        } catch (e) {
          console.error('[QWEN_CODERUN] Failed to save model:', e);
        }
      }
      if (message.provider !== undefined && extensionContext) {
        try {
          await extensionContext.globalState.update('qwen-coderun_selected_provider', message.provider);
        } catch (e) {
          console.error('[QWEN_CODERUN] Failed to save provider:', e);
        }
      }
      await sendCurrentSettings(webview);
      break;
    }

    case 'openQwenLogin': {
      vscode.env.openExternal(vscode.Uri.parse('https://chat.qwen.ai/'));
      break;
    }

    case 'openExternal': {
      if (message.url) {
        try {
          vscode.env.openExternal(vscode.Uri.parse(message.url));
        } catch (_) {}
      }
      break;
    }

    case 'startQwenBrowserLogin': {
      webview.postMessage({ type: 'qwenLoginWaiting', message: 'Opening login window... Please sign in to your Qwen account.' });

      browserLoginManager.startBrowserLogin({
        url: 'https://chat.qwen.ai',
        cookieName: 'token'
      }, async function onLoginSuccess(fullCookieStr, tokenValue, fullLocalStorage) {
        console.log('[QWEN_CODERUN] Automated login succeeded! Saving cookie & storage...');
        await config.setApiKey(extensionContext, fullCookieStr);
        if (fullLocalStorage) {
          try {
            await extensionContext.globalState.update('qwen-coderun.localStorage', JSON.stringify(fullLocalStorage));
          } catch (_) {}
        }

        try {
          var testChats = await fetchQwenChatsList(extensionContext);
          webview.postMessage({ type: 'qwenAuthState', authenticated: true });
          if (testChats && testChats.success && testChats.data) {
            var mappedChats = [];
            for (var k = 0; k < testChats.data.length; k++) {
              var c = testChats.data[k];
              mappedChats.push({ id: c.id, title: c.title || 'Untitled Session' });
            }
            webview.postMessage({ type: 'loadConversations', conversations: JSON.stringify(mappedChats) });
          }
          vscode.window.showInformationMessage('CodeRun: Successfully signed in to Qwen!');
        } catch (authVerifyErr) {
          webview.postMessage({ type: 'qwenAuthState', authenticated: true });
        }
      }, function onLoginError(err) {
        console.error('[QWEN_CODERUN] Browser login error:', err);
        webview.postMessage({ type: 'qwenAuthState', authenticated: false, error: err.message });
        vscode.window.showErrorMessage('CodeRun Qwen Login Error: ' + err.message);
      }, function onLoginCancel() {
        console.log('[QWEN_CODERUN] Browser login was closed or cancelled.');
        webview.postMessage({ type: 'qwenAuthState', authenticated: false, error: 'Login window was closed.' });
      });
      break;
    }

    case 'cancelQwenBrowserLogin': {
      browserLoginManager.cancelBrowserLogin();
      webview.postMessage({ type: 'qwenAuthState', authenticated: false, error: 'Login cancelled.' });
      break;
    }

    case 'solveQwenCaptcha': {
      var captchaUrl = message.captchaUrl || 'https://chat.qwen.ai';
      webview.postMessage({ type: 'qwenCaptchaWaiting', message: 'Opening verification window... Please complete the slider puzzle.' });

      browserLoginManager.startCaptchaVerification({
        url: captchaUrl,
        existingCookie: config.getApiKey()
      }, async function onCaptchaSuccess(fullCookieStr) {
        console.log('[QWEN_CODERUN] Captcha solved! Saving updated cookies with x5sec...');
        await config.setApiKey(extensionContext, fullCookieStr);
        webview.postMessage({ type: 'qwenCaptchaResolved', message: 'Verification completed! You can now continue.' });
        vscode.window.showInformationMessage('CodeRun: Qwen security verification completed!');
      }, function onCaptchaError(err) {
        console.error('[QWEN_CODERUN] Captcha verification error:', err);
        webview.postMessage({ type: 'qwenCaptchaFailed', error: err.message });
        vscode.window.showErrorMessage('CodeRun Verification Error: ' + err.message);
      }, function onCaptchaCancel() {
        console.log('[QWEN_CODERUN] Verification window was closed.');
        webview.postMessage({ type: 'qwenCaptchaFailed', error: 'Verification window was closed.' });
      });
      break;
    }

    case 'loginQwen': {
      var pastedCookie = message.cookie || '';
      if (!pastedCookie) {
        webview.postMessage({ type: 'qwenAuthState', authenticated: false, error: 'Empty cookie string.' });
        break;
      }
      
      await config.setApiKey(extensionContext, pastedCookie);
      
      try {
        var testChats = await fetchQwenChatsList(extensionContext);
        if (testChats && testChats.success) {
          webview.postMessage({ type: 'qwenAuthState', authenticated: true });
          var mappedChats = (testChats.data || []).map(function(c) {
            return { id: c.id, title: c.title || 'Untitled Session' };
          });
          webview.postMessage({ type: 'loadConversations', conversations: JSON.stringify(mappedChats) });
        } else {
          await config.deleteApiKey(extensionContext);
          var errMsg = (testChats && testChats.error) || 'Invalid cookie. Please copy the fresh headers cookie string from chat.qwen.ai.';
          webview.postMessage({ type: 'qwenAuthState', authenticated: false, error: errMsg });
        }
      } catch(e) {
        await config.deleteApiKey(extensionContext);
        webview.postMessage({ type: 'qwenAuthState', authenticated: false, error: 'Network connection failed: ' + e.message });
      }
      break;
    }

    case 'logoutQwen': {
      await config.deleteApiKey(extensionContext);
      webview.postMessage({ type: 'qwenAuthState', authenticated: false });
      break;
    }

    case 'getQwenChatDetail': {
      var chatId = message.chatId;
      try {
        var detailRes = await fetchQwenChatDetail(extensionContext, chatId);
        if (detailRes && detailRes.success && detailRes.messages) {
          var rawMessages = detailRes.messages;
          var formattedMessages = parseQwenChatHistory(rawMessages);
          webview.postMessage({ type: 'qwenChatDetail', success: true, chatId: chatId, messages: formattedMessages });
        } else {
          var isAuthDetail = detailRes && detailRes.isAuthError;
          if (isAuthDetail) {
            console.warn('[QWEN_CODERUN] getQwenChatDetail auth failed. Prompting user to log in.');
            webview.postMessage({
              type: 'qwenAuthState',
              authenticated: false,
              error: 'Your session token has expired. Please sign in again.'
            });
          }
          webview.postMessage({
            type: 'qwenChatDetail',
            success: false,
            isAuthError: isAuthDetail,
            error: (detailRes && detailRes.error) || 'Failed to fetch details.'
          });
        }
      } catch(e) {
        webview.postMessage({ type: 'qwenChatDetail', success: false, error: e.message });
      }
      break;
    }

    case 'saveSettings': {
      // Save provider settings to VS Code configuration (settings.json)
      if (message.settings) {
        console.log('[QWEN_CODERUN] Saving settings:', JSON.stringify(message.settings));
        try {
          var settingsToUpdate = {};
          if (message.settings.provider !== undefined) settingsToUpdate.provider = message.settings.provider;
          if (message.settings.baseUrl !== undefined) settingsToUpdate.baseUrl = message.settings.baseUrl;
          if (message.settings.model !== undefined) settingsToUpdate.model = message.settings.model;
          if (message.settings.maxIterations !== undefined) settingsToUpdate.maxIterations = message.settings.maxIterations;
          if (message.settings.streaming !== undefined) settingsToUpdate.streaming = message.settings.streaming;
          if (message.settings.showThinking !== undefined) settingsToUpdate.showThinking = message.settings.showThinking;
          if (message.settings.confirmDangerous !== undefined) settingsToUpdate.confirmDangerous = message.settings.confirmDangerous;

          console.log('[QWEN_CODERUN] Updating VS Code settings:', JSON.stringify(settingsToUpdate));
          await config.updateSettings(settingsToUpdate, vscode.ConfigurationTarget.Global);
          console.log('[QWEN_CODERUN] Settings saved successfully');

          // Save API key to secrets BEFORE health check
          var resolvedApiKey = '';
          if (message.apiKey !== undefined && message.apiKey !== null) {
            if (message.apiKey === '') {
              console.log('[QWEN_CODERUN] Deleting API key from secrets');
              await config.deleteApiKey(extensionContext);
            } else if (message.apiKey !== '••••••••') {
              console.log('[QWEN_CODERUN] Saving API key to secrets');
              await config.setApiKey(extensionContext, message.apiKey);
              resolvedApiKey = message.apiKey;
            } else {
              // Placeholder — get existing key
              try { resolvedApiKey = await config.getApiKey(extensionContext) || ''; } catch (_) {}
            }
          }

          // Also save per-provider config for multi-provider support
          var savedProvider = message.settings.provider || config.getConfig().provider;
          var savedBaseUrl = message.settings.baseUrl || config.getConfig().baseUrl;
          await config.saveProviderConfig(extensionContext, savedProvider, {
            baseUrl: savedBaseUrl,
            apiKey: resolvedApiKey,
            model: message.settings.model || '',
            apiType: message.settings.apiType || 'openai'
          });

          var overrideCfg = await config.getProviderConfigWithKey(extensionContext);
          if (message.settings.provider) overrideCfg.provider = message.settings.provider;
          if (message.settings.baseUrl) overrideCfg.baseUrl = message.settings.baseUrl;
          if (message.settings.model) overrideCfg.model = message.settings.model;

          await sendCurrentSettings(webview);
          await checkProviderHealth(webview, overrideCfg);
          await refreshAllProviderModels(webview);
        } catch (e) {
          console.error('[QWEN_CODERUN] Failed to save settings:', e);
          webview.postMessage({ type: 'showAlert', message: 'Failed to save settings: ' + e.message });
        }
      }
      break;
    }

    case 'saveApiKey': {
      if (message.apiKey !== undefined && extensionContext) {
        if (message.apiKey === '') {
          await config.deleteApiKey(extensionContext);
        } else {
          await config.setApiKey(extensionContext, message.apiKey);
        }
        await sendCurrentSettings(webview);
        await checkProviderHealth(webview);
        await refreshAllProviderModels(webview);
      }
      break;
    }

    case 'removeProviderConfig': {
      if (message.provider && extensionContext) {
        console.log('[QWEN_CODERUN] Removing saved config for provider:', message.provider);
        await config.deleteProviderConfig(extensionContext, message.provider);
        await sendCurrentSettings(webview);
        await refreshAllProviderModels(webview);
      }
      break;
    }

    case 'requestConversations': {
      if (!extensionContext) {
        webview.postMessage({ type: 'loadConversations', conversations: '[]', selectedModel: '', selectedProvider: '' });
        return;
      }
      try {
        var stored = extensionContext.globalState.get('qwen-coderun_conversations', '[]');
        var selectedModel = extensionContext.globalState.get('qwen-coderun_selected_model', '');
        var selectedProvider = extensionContext.globalState.get('qwen-coderun_selected_provider', '');
        webview.postMessage({ type: 'loadConversations', conversations: stored, selectedModel: selectedModel, selectedProvider: selectedProvider });
      } catch (e) {
        webview.postMessage({ type: 'loadConversations', conversations: '[]', selectedModel: '', selectedProvider: '' });
      }
      break;
    }

    case 'checkHealth': {
      await checkProviderHealth(webview);
      break;
    }

    case 'refreshAllModels': {
      await refreshAllProviderModels(webview);
      break;
    }

    case 'openFile': {
      if (message.path) {
        var wsPath = getWorkspaceFolder();
        var fullPath = path.join(wsPath, message.path);
        vscode.workspace.openTextDocument(fullPath).then(function(doc) {
          vscode.window.showTextDocument(doc);
        }).catch(function(err) {
          console.error('[QWEN_CODERUN] Failed to open file:', err);
        });
      }
      break;
    }

    case 'undoFile': {
      var wsPath = getWorkspaceFolder();
      var result;
      if (message.path) {
        result = await checkpointManager.undoFile(message.path, wsPath, null);
      } else {
        result = await checkpointManager.undoLast(wsPath, null);
      }
      if (result && result.success) {
        vscode.window.showInformationMessage(result.message);
        webview.postMessage({ type: 'undoComplete', message: result.message });
      } else {
        var errMsg = (result && result.message) || 'Nothing to undo';
        vscode.window.showInformationMessage(errMsg);
        webview.postMessage({ type: 'undoComplete', message: errMsg });
      }
      break;
    }

    case 'undoCheckpoint': {
      if (message.filePath) {
        var wsPath = getWorkspaceFolder();
        var result = await checkpointManager.undoFile(message.filePath, wsPath, null);
        webview.postMessage({
          type: 'undoCheckpointResult',
          filePath: message.filePath,
          success: result ? result.success : false,
          message: result ? result.message : 'Failed'
        });
        if (result && result.success) {
          vscode.window.showInformationMessage(result.message);
        }
      }
      break;
    }

    case 'acceptDiff': {
      var wsPath = getWorkspaceFolder();
      var result = await diffManager.applyPatch(message.diffId, wsPath);
      // Resolve the deferred promise so tools.js generator continues
      if (result.success) {
        agentLoop.resolveDiff(message.diffId, true);
      }
      webview.postMessage({ type: 'diffResult', diffId: message.diffId, result: result });
      break;
    }

    case 'acceptAllDiffs': {
      var wsPath = getWorkspaceFolder();
      var results = await diffManager.acceptAll(wsPath);
      // Resolve all deferreds
      for (var ri = 0; ri < results.length; ri++) {
        var r = results[ri];
        if (r.success) {
          agentLoop.resolveDiff(r.diffId || r.message, true);
        }
      }
      webview.postMessage({ type: 'diffAllResult', results: results });
      break;
    }

    case 'rejectDiff': {
      if (message.diffId) {
        var result = diffManager.rejectPatch(message.diffId);
        // Reject the deferred so tools.js generator continues
        agentLoop.resolveDiff(message.diffId, false);
        webview.postMessage({ type: 'diffResult', diffId: message.diffId, result: result });
      }
      break;
    }

    case 'rejectAllDiffs': {
      var results = diffManager.rejectAll();
      // Reject all deferreds
      for (var ri = 0; ri < results.length; ri++) {
        var r = results[ri];
        agentLoop.resolveDiff(r.diffId, false);
      }
      webview.postMessage({ type: 'diffAllResult', results: results });
      break;
    }

    case 'openDiffEditor': {
      if (message.diffId) {
        var wsPath = getWorkspaceFolder();
        diffManager.openDiffEditor(message.diffId, wsPath);
      }
      break;
    }

    default: {
      console.log('[QWEN_CODERUN] Unknown message type:', msgType);
    }
  }
}

// =====================================================
// HEALTH CHECK & MODEL FETCH
// =====================================================
async function checkProviderHealth(webview, overrideConfig) {
  var cfg = overrideConfig;
  if (!cfg) {
    cfg = await config.getProviderConfigWithKey(extensionContext);
  }
  cfg.provider = 'qwen';
  if (!cfg.baseUrl) cfg.baseUrl = 'https://chat.qwen.ai/api/v2';
  console.log('[QWEN_CODERUN] Checking health for provider:', cfg.provider, 'at', cfg.baseUrl, 'model:', cfg.model);

  if (!cfg.baseUrl) {
    console.error('[QWEN_CODERUN] Health check skipped: No baseUrl configured');
    statusBarItem.text = '$(warning) Qwen CodeRun (No URL)';
    statusBarItem.tooltip = 'Please configure base URL in Qwen CodeRun settings';
    if (webview) {
      webview.postMessage({
        type: 'healthStatus',
        online: false,
        provider: 'qwen',
        error: 'No base URL configured. Please set it in settings.'
      });
    }
    return;
  }

  if (config.needsApiKey(cfg.provider) && !cfg.apiKey) {
    console.error('[QWEN_CODERUN] Health check skipped: API key required but not set');
    statusBarItem.text = '$(warning) Qwen CodeRun (No API Key)';
    statusBarItem.tooltip = 'Please set API key in Qwen CodeRun settings';
    if (webview) {
      webview.postMessage({
        type: 'healthStatus',
        online: false,
        provider: 'qwen',
        error: 'API key required. Please enter your API key in settings and click Save.',
        models: []
      });
    }
    return;
  }

  try {
    var provider = (await import('./providerManager.js')).createProvider(cfg);
    var models = await provider.listModels(cfg);

    statusBarItem.text = '$(comment-discussion) Qwen CodeRun (Online)';
    statusBarItem.tooltip = cfg.provider + ': ' + cfg.baseUrl + ' | Models: ' + models.length;

    if (webview) {
      webview.postMessage({
        type: 'healthStatus',
        online: true,
        provider: 'qwen',
        models: models
      });
    }
  } catch (err) {
    console.error('[QWEN_CODERUN] Health check failed:', err.message);
    console.error('[QWEN_CODERUN] Config used:', JSON.stringify({ provider: cfg.provider, baseUrl: cfg.baseUrl, model: cfg.model, hasKey: !!cfg.apiKey }));
    statusBarItem.text = '$(warning) Qwen CodeRun (Offline)';
    statusBarItem.tooltip = 'Cannot reach ' + cfg.provider + ' at ' + cfg.baseUrl + ' - ' + err.message;

    if (webview) {
      webview.postMessage({
        type: 'healthStatus',
        online: false,
        provider: 'qwen',
        error: err.message,
        models: []
      });
    }
  }
}

/**
 * Refresh models for the dedicated Qwen provider.
 */
async function refreshAllProviderModels(webview) {
  var provCfg = await config.getProviderConfigWithKey(extensionContext);
  provCfg.provider = 'qwen';
  await checkProviderHealth(webview, provCfg);
}

// =====================================================
// DEACTIVATE
// =====================================================
export function deactivate() {
  if (statusBarItem) statusBarItem.dispose();
  terminalManager.dispose();
  permissions.cancelAllPermissions();
  projectKnowledge.dispose();
  currentAbortController = null;
}
// Dashboard.js — Qwen CodeRun Agent Dashboard
// Settings (provider, baseUrl, model, apiKey) are read from VS Code user settings.
// The backend is the single source of truth for provider configuration.

(function() {
  "use strict";

  var DEFAULT_BASE_URL = "http://localhost:11434";
  var STORAGE_KEY = "qwen-coderun_conversations";
  var SETTINGS_KEY = "qwen-coderun_settings";
  var MODEL_KEY = "qwen-coderun_selected_model";

  var vscodeState = {};
  if (!!window.VSCODE && window.VSCODE_API) {
    try { vscodeState = window.VSCODE_API.getState() || {}; } catch (e) {}
  }

  var state = {
    sidebarOpen: vscodeState.sidebarOpen !== undefined ? vscodeState.sidebarOpen : (window.innerWidth > 600),
    conversations: vscodeState.conversations || [],
    activeConversationId: vscodeState.activeConversationId || null,
    renamingId: null,
    renameValue: "",
    selectedModel: "",
    selectedProvider: "",
    savedProviderConfigs: {},
    workspaceFolder: vscodeState.workspaceFolder || window.WORKSPACE_FOLDER || "",
    models: [],
    modelsByProvider: {},
    isVsCode: !!window.VSCODE,
    baseUrl: DEFAULT_BASE_URL,
    provider: "qwen",
    isOnline: false,
    apiKey: "",
    hasApiKey: false,
    settingsLoadedFromVscode: false,
    // "Always Allow / Always Deny" decisions per tool. Populated from the
    // extension host via the 'permissionState' message on webviewReady and
    // after every change. ChatSpace can read it via getDashboardAlwaysDecisions.
    alwaysDecisions: {},
    settings: {
      provider: "qwen",
      baseUrl: DEFAULT_BASE_URL,
      apiKey: "",
      model: "",
      maxIterations: 20,
      streaming: true,
      showThinking: true,
      autoScroll: true,
      confirmDangerous: true
    }
  };

  function saveStateToVscode() {
    if (state.isVsCode && window.VSCODE_API) {
      try {
        window.VSCODE_API.setState({
          sidebarOpen: state.sidebarOpen,
          conversations: state.conversations,
          activeConversationId: state.activeConversationId,
          selectedModel: state.selectedModel,
          selectedProvider: state.selectedProvider,
          workspaceFolder: state.workspaceFolder
        });
      } catch (e) {}
    }
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function genId() {
    return "cr_" + Date.now() + "_" + Math.random().toString(36).slice(2, 10);
  }

  function loadConversations() {
    try { state.conversations = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch (_) { state.conversations = []; }
  }

  function saveConversations() {
    var raw = JSON.stringify(state.conversations);
    saveStateToVscode();
    try { localStorage.setItem(STORAGE_KEY, raw); } catch (_) {}
    if (state.isVsCode && window.VSCODE_API) {
      window.VSCODE_API.postMessage({ type: "saveConversations", conversations: raw });
    }
  }

  function saveSelectedModel() {
    saveStateToVscode();
    try { localStorage.setItem(MODEL_KEY, state.selectedModel); } catch (_) {}
    if (state.isVsCode && window.VSCODE_API) {
      window.VSCODE_API.postMessage({ type: "saveSelectedModel", model: state.selectedModel, provider: state.selectedProvider });
    }
  }

  window.loadConversationsFromExtension = function(conversationsJson, selectedModel, selectedProvider) {
    try {
      var extConvs = typeof conversationsJson === "string" ? JSON.parse(conversationsJson || "[]") : Array.isArray(conversationsJson) ? conversationsJson : [];
      if (extConvs && extConvs.length > 0) {
        state.conversations = extConvs;
        saveStateToVscode();
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.conversations)); } catch (_) {}
      }
    } catch (_) {}
    
    try {
      if (selectedModel) {
        state.selectedModel = selectedModel;
        saveStateToVscode();
        try { localStorage.setItem(MODEL_KEY, state.selectedModel); } catch (_) {}
      }
      if (selectedProvider) {
        state.selectedProvider = selectedProvider;
      }
    } catch (_) {}
    renderSidebar();
    if (state.activeConversationId && state.conversations.some(function(c) { return c.id === state.activeConversationId; })) {
      selectConversation(state.activeConversationId);
    } else if (state.conversations.length) {
      selectConversation(state.conversations[0].id);
    } else {
      selectConversation(null);
    }
    updateModelSelectValue();
    updateModelBadge();
  };

  window.setDashboardWorkspace = function(folderPath) {
    state.workspaceFolder = folderPath || "";
    var display = document.getElementById("cfgWorkspaceDisplay");
    if (display) display.textContent = state.workspaceFolder || "(not detected)";
    saveStateToVscode();
  };

  /**
   * Apply settings received from VS Code backend.
   * This is the primary way settings are loaded in VS Code mode.
   */
  window.applyVscodeSettings = function(vscodeSettings) {
    if (!vscodeSettings) return;
    state.settingsLoadedFromVscode = true;

    if (vscodeSettings.provider !== undefined) {
      state.provider = vscodeSettings.provider;
      state.settings.provider = vscodeSettings.provider;
    }
    if (vscodeSettings.baseUrl !== undefined) {
      state.baseUrl = vscodeSettings.baseUrl;
      state.settings.baseUrl = vscodeSettings.baseUrl;
    }
    if (vscodeSettings.model !== undefined) {
      state.settings.model = vscodeSettings.model;
      // Always sync settings model to selectedModel if selectedModel is empty or not set
      if (!state.selectedModel) {
        state.selectedModel = vscodeSettings.model;
      }
    }
    if (vscodeSettings.maxIterations !== undefined) state.settings.maxIterations = vscodeSettings.maxIterations;
    if (vscodeSettings.streaming !== undefined) state.settings.streaming = vscodeSettings.streaming;
    if (vscodeSettings.showThinking !== undefined) state.settings.showThinking = vscodeSettings.showThinking;
    if (vscodeSettings.confirmDangerous !== undefined) state.settings.confirmDangerous = vscodeSettings.confirmDangerous;
    if (vscodeSettings.hasApiKey !== undefined) state.hasApiKey = vscodeSettings.hasApiKey;

    // Update settings UI if visible
    updateSettingsUI();
    updateModelBadge();
    updateModelSelectValue();
  };

  function updateSettingsUI() {
    var providerEl = document.getElementById("cfgProvider");
    var baseUrlEl = document.getElementById("cfgBaseUrl");
    var apiKeyEl = document.getElementById("cfgApiKey");
    var modelEl = document.getElementById("cfgModel");
    var maxIterEl = document.getElementById("cfgMaxIterations");
    var streamingEl = document.getElementById("cfgStreaming");
    var showThinkingEl = document.getElementById("cfgShowThinking");
    var confirmEl = document.getElementById("cfgConfirmDangerous");
    var compNameGroup = document.getElementById("cfgCompatibleNameGroup");
    var compNameEl = document.getElementById("cfgCompatibleName");
    var compApiTypeGroup = document.getElementById("cfgCompatibleApiTypeGroup");
    var compApiTypeEl = document.getElementById("cfgCompatibleApiType");

    if (providerEl) {
      // Re-populate dropdown dynamically
      var configs = state.savedProviderConfigs || {};
      var keys = Object.keys(configs);
      
      var html = 
        '<option value="ollama">Ollama</option>' +
        '<option value="openai">OpenAI</option>' +
        '<option value="anthropic">Anthropic</option>' +
        '<option value="gemini">Google Gemini</option>' +
        '<option value="openrouter">OpenRouter</option>' +
        '<option value="xai">xAI (Grok)</option>' +
        '<option value="groq">Groq</option>' +
        '<option value="qwen">Qwen Browser API</option>';
      
      // Add custom compatible options
      var hasCurrentAsCustom = false;
      for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (key.startsWith('compatible:')) {
          var name = key.substring(11);
          var cfg = configs[key] || {};
          var type = cfg.apiType || 'openai';
          var typeLabel = type === 'anthropic' ? 'Anthropic' : (type === 'gemini' ? 'Gemini' : 'Compatible');
          html += '<option value="' + esc(key) + '">' + esc(name) + ' (' + typeLabel + ')</option>';
          if (key === state.settings.provider) {
            hasCurrentAsCustom = true;
          }
        }
      }
      
      // If the current provider is compatible:XYZ but not saved yet
      if (state.settings.provider && state.settings.provider.startsWith('compatible:') && !hasCurrentAsCustom) {
        var name = state.settings.provider.substring(11);
        var type = state.settings.apiType || 'openai';
        var typeLabel = type === 'anthropic' ? 'Anthropic' : (type === 'gemini' ? 'Gemini' : 'Compatible');
        html += '<option value="' + esc(state.settings.provider) + '">' + esc(name) + ' (' + typeLabel + ')</option>';
      }
      
      html += '<option value="compatible">OpenAI/Anthropic/Gemini Compatible (New...)</option>';
      providerEl.innerHTML = html;
      providerEl.value = state.settings.provider || 'ollama';
    }

    var currentProvider = state.settings.provider || 'ollama';
    var isCompatible = currentProvider === 'compatible' || currentProvider.startsWith('compatible:');

    // Toggle visibility for Qwen specific fields
    var baseUrlGroup = document.getElementById("cfgBaseUrlGroup");
    var apiKeyLabel = document.getElementById("cfgApiKeyLabel");
    if (currentProvider === 'qwen') {
      if (baseUrlGroup) baseUrlGroup.style.display = 'none';
      if (apiKeyLabel) apiKeyLabel.textContent = 'Qwen Cookie String';
      if (apiKeyEl) apiKeyEl.placeholder = 'token=...; cnaui=...; acw_tc=...';
    } else {
      if (baseUrlGroup) baseUrlGroup.style.display = 'flex';
      if (apiKeyLabel) apiKeyLabel.textContent = 'API Key';
      if (apiKeyEl) apiKeyEl.placeholder = 'sk-...';
    }

    if (compNameGroup && compNameEl && compApiTypeGroup && compApiTypeEl) {
      if (isCompatible) {
        compNameGroup.style.display = 'flex';
        compApiTypeGroup.style.display = 'flex';
        if (currentProvider.startsWith('compatible:')) {
          compNameEl.value = currentProvider.substring(11);
          var saved = (state.savedProviderConfigs || {})[currentProvider] || {};
          compApiTypeEl.value = saved.apiType || 'openai';
        } else {
          compNameEl.value = '';
          compApiTypeEl.value = 'openai';
        }
      } else {
        compNameGroup.style.display = 'none';
        compApiTypeGroup.style.display = 'none';
        compNameEl.value = '';
        compApiTypeEl.value = 'openai';
      }
    }

    if (baseUrlEl) baseUrlEl.value = state.settings.baseUrl;

    // Check if the current selected provider has a saved key, otherwise show empty
    var configs = state.savedProviderConfigs || {};
    var hasApiKeyForCurrent = false;
    if (configs[currentProvider] && configs[currentProvider].apiKey) {
      hasApiKeyForCurrent = true;
    } else if (currentProvider === state.settings.provider && state.hasApiKey) {
      hasApiKeyForCurrent = true;
    }
    if (apiKeyEl) apiKeyEl.value = hasApiKeyForCurrent ? "••••••••" : "";

    if (modelEl) modelEl.value = state.settings.model;
    if (maxIterEl) maxIterEl.value = state.settings.maxIterations;
    if (streamingEl) streamingEl.checked = state.settings.streaming;
    if (showThinkingEl) showThinkingEl.checked = state.settings.showThinking;
    if (confirmEl) confirmEl.checked = state.settings.confirmDangerous;
  }

  /**
   * Render the list of saved provider configs in the settings panel.
   */
  function renderSavedProviders() {
    var section = document.getElementById("savedProvidersSection");
    if (!section) return;
    var configs = state.savedProviderConfigs || {};
    var keys = Object.keys(configs);
    if (!keys.length) {
      section.innerHTML = '';
      return;
    }
    var html = '<div class="cr-saved-providers-heading">Saved Providers</div>';
    for (var i = 0; i < keys.length; i++) {
      var prov = keys[i];
      var cfg = configs[prov] || {};
      var label = prov;
      if (prov.startsWith('compatible:')) {
        var name = prov.substring(11);
        var type = cfg.apiType || 'openai';
        var typeLabel = type === 'anthropic' ? 'Anthropic' : (type === 'gemini' ? 'Gemini' : 'Compatible');
        label = name + ' (' + typeLabel + ')';
      } else {
        label = prov.charAt(0).toUpperCase() + prov.slice(1);
      }
      var hasKey = cfg.apiKey ? '🔑' : '○';
      var url = cfg.baseUrl ? cfg.baseUrl.replace(/^https?:\/\//, '').substring(0, 30) : '(no URL)';
      html += '<div class="cr-saved-provider-item" data-provider="' + esc(prov) + '">' +
        '<span class="cr-saved-provider-name">' + hasKey + ' ' + esc(label) + '</span>' +
        '<span class="cr-saved-provider-url" title="' + esc(cfg.baseUrl || '') + '">' + esc(url) + '</span>' +
        '<button class="cr-saved-provider-load" title="Load this provider\'s settings">Load</button>' +
        '<button class="cr-saved-provider-remove" title="Remove this provider config">✕</button>' +
        '</div>';
    }
    section.innerHTML = html;

    section.querySelectorAll('.cr-saved-provider-load').forEach(function(btn) {
      btn.onclick = function(e) {
        e.stopPropagation();
        var item = btn.closest('.cr-saved-provider-item');
        var prov = item ? item.dataset.provider : '';
        if (prov && configs[prov]) {
          loadProviderToForm(prov, configs[prov]);
        }
      };
    });
    section.querySelectorAll('.cr-saved-provider-remove').forEach(function(btn) {
      btn.onclick = function(e) {
        e.stopPropagation();
        var item = btn.closest('.cr-saved-provider-item');
        var prov = item ? item.dataset.provider : '';
        if (prov) {
          delete configs[prov];
          state.savedProviderConfigs = configs;
          renderSavedProviders();
          if (state.isVsCode && window.VSCODE_API) {
            window.VSCODE_API.postMessage({ type: 'removeProviderConfig', provider: prov });
          }
        }
      };
    });
  }

  /**
   * Load a saved provider's config into the settings form fields.
   */
  function loadProviderToForm(provider, cfg) {
    var providerEl = document.getElementById("cfgProvider");
    var baseUrlEl = document.getElementById("cfgBaseUrl");
    var apiKeyEl = document.getElementById("cfgApiKey");
    var modelEl = document.getElementById("cfgModel");
    if (providerEl) providerEl.value = provider;
    if (baseUrlEl) baseUrlEl.value = cfg.baseUrl || '';
    if (apiKeyEl) apiKeyEl.value = cfg.apiKey ? '••••••••' : '';
    if (modelEl) modelEl.value = cfg.model || '';
    state.settings.provider = provider;
    state.settings.baseUrl = cfg.baseUrl || '';
    state.hasApiKey = !!cfg.apiKey;
  }

  window.renderDashboard = function(container) {
    if (!container) return;
    loadConversations();
    container.innerHTML = buildShell();
    initUI();
    renderSidebar();

    var sidebar = document.getElementById("cr-chat-sidebar");
    if (sidebar) {
      sidebar.classList.toggle("open", state.sidebarOpen);
      sidebar.classList.toggle("closed", !state.sidebarOpen);
    }
    var toggleBtn = document.getElementById("rail-toggle");
    if (toggleBtn) {
      toggleBtn.textContent = state.sidebarOpen ? "✕" : "☰";
    }

    if (state.activeConversationId && state.conversations.some(function(c) { return c.id === state.activeConversationId; })) {
      selectConversation(state.activeConversationId);
    } else if (state.conversations.length) {
      selectConversation(state.conversations[0].id);
    } else {
      selectConversation(null);
    }

    // In VS Code mode, request current settings from backend
    if (state.isVsCode && window.VSCODE_API) {
      window.VSCODE_API.postMessage({ type: "webviewReady" });
    } else {
      // Standalone mode: load from localStorage / window.QWEN_CODERUN_CONFIG
      loadStandaloneSettings();
      loadModels();
    }
  };

  function loadStandaloneSettings() {
    // Standalone fallback: read from localStorage or window.QWEN_CODERUN_CONFIG
    try {
      var saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      if (saved.provider) state.provider = state.settings.provider = saved.provider;
      if (saved.baseUrl) state.baseUrl = state.settings.baseUrl = saved.baseUrl;
      if (saved.apiKey) state.apiKey = state.settings.apiKey = saved.apiKey;
      if (saved.model) {
        state.settings.model = saved.model;
        state.selectedModel = saved.model;
      }
    } catch (_) {}

    // Override with window.QWEN_CODERUN_CONFIG if present
    if (window.QWEN_CODERUN_CONFIG) {
      if (window.QWEN_CODERUN_CONFIG.provider) state.provider = state.settings.provider = window.QWEN_CODERUN_CONFIG.provider;
      if (window.QWEN_CODERUN_CONFIG.baseUrl) state.baseUrl = state.settings.baseUrl = window.QWEN_CODERUN_CONFIG.baseUrl;
      if (window.QWEN_CODERUN_CONFIG.model) {
        state.settings.model = window.QWEN_CODERUN_CONFIG.model;
        if (!state.selectedModel) state.selectedModel = window.QWEN_CODERUN_CONFIG.model;
      }
    }

    updateSettingsUI();
  }

  function buildShell() {
    return (
      '<div class="cr-root">' +
        '<header class="cr-header">' +
          '<div class="cr-header-left">' +
            '<span class="cr-copilot-mark">R</span>' +
            '<span class="cr-title">Qwen CodeRun Agent</span>' +
            '<span class="cr-model-badge" id="headerModelBadge"></span>' +
          '</div>' +
          '<div class="cr-header-right">' +
            '<span class="cr-status"><span class="cr-status-dot connecting" id="status-dot"></span><span id="status-text">Connecting</span></span>' +
            '<button id="newChatHeaderBtn" class="cr-icon-btn" title="New Chat">+</button>' +
          '</div>' +
        '</header>' +
        '<div class="cr-body">' +
          '<nav class="cr-rail">' +
            '<button id="rail-toggle" class="cr-rail-btn" title="Toggle chats" style="display: none;">☰</button>' +
            '<button id="rail-chat" class="cr-rail-btn active" title="Chat" style="display: none;">💬</button>' +
            '<button id="rail-settings" class="cr-rail-btn" title="Settings" style="display: none;">⚙</button>' +
          '</nav>' +
          '<main class="cr-viewport">' +
            '<section id="panel-login" class="cr-panel active" style="display: flex;">' +
              '<div class="cr-login-container" style="padding: 32px; display: flex; flex-direction: column; gap: 16px; align-items: center; justify-content: center; height: 100%; max-width: 400px; margin: 0 auto;">' +
                '<div class="cr-login-logo" style="font-size: 3.5rem; color: #6366f1; font-weight: bold; background: rgba(99,102,241,0.1); width: 80px; height: 80px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 8px 32px rgba(99,102,241,0.2);">Q</div>' +
                '<h2 style="margin: 0; font-size: 1.5rem; text-align: center; color: var(--text-primary);">Qwen CodeRun Agent</h2>' +
                '<p style="margin: 0; font-size: 0.9rem; text-align: center; color: var(--text-secondary); line-height: 1.5;">' +
                  'Connect your Qwen account to use the AI agent. Login once and your session is saved permanently.' +
                '</p>' +
                '<div style="width: 100%; display: flex; flex-direction: column; gap: 14px;">' +
                  '<div style="background: linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(139,92,246,0.08) 100%); border: 1px solid rgba(99,102,241,0.25); border-radius: 10px; padding: 16px; text-align: center;">' +
                    '<div style="font-size: 1rem; font-weight: 600; color: var(--text-primary); margin-bottom: 6px;">Automatic 1-Click Login</div>' +
                    '<p style="margin: 0 0 12px 0; font-size: 0.82rem; color: var(--text-secondary); line-height: 1.4;">' +
                      'Opens a secure browser window to log in. Your session token will be captured and saved automatically.' +
                    '</p>' +
                    '<button id="qwenAutoLoginBtn" class="cr-save-btn" style="width: 100%; padding: 11px; font-weight: 600; background: #6366f1; color: #fff; border: none; border-radius: 7px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 0.95rem; box-shadow: 0 4px 14px rgba(99,102,241,0.35);">' +
                      '🚀 Sign In with Qwen (1-Click)' +
                    '</button>' +
                    '<div id="qwenAutoLoginWaiting" style="display: none; padding: 10px 0; flex-direction: column; gap: 10px; align-items: center;">' +
                      '<div style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem; color: #6366f1; font-weight: 500;">' +
                        '<span class="cr-loading-spinner" style="display: inline-block; width: 14px; height: 14px; border: 2px solid #6366f1; border-top-color: transparent; border-radius: 50%; animation: crSpin 0.8s linear infinite;"></span>' +
                        '<span id="qwenAutoLoginWaitingText">Opening browser window...</span>' +
                      '</div>' +
                      '<button id="qwenCancelAutoLoginBtn" style="padding: 5px 12px; font-size: 0.8rem; background: transparent; border: 1px solid var(--border); color: var(--text-secondary); border-radius: 5px; cursor: pointer;">Cancel</button>' +
                    '</div>' +
                  '</div>' +
                  '<details style="background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 8px; padding: 12px; text-align: left;">' +
                    '<summary style="font-size: 0.82rem; font-weight: 600; color: var(--text-secondary); cursor: pointer; user-select: none;">' +
                      'Manual Token Entry (Fallback)' +
                    '</summary>' +
                    '<div style="margin-top: 10px; display: flex; flex-direction: column; gap: 10px;">' +
                      '<p style="margin: 0; font-size: 0.78rem; color: var(--text-secondary); line-height: 1.4;">' +
                        '1. Click below to open Qwen in browser and log in.<br>' +
                        '2. Press F12 → Application → Cookies → chat.qwen.ai → copy the "token" value.' +
                      '</p>' +
                      '<button id="qwenOpenLoginBtn" class="cr-save-btn" style="width: 100%; padding: 8px; font-size: 0.82rem; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border); border-radius: 6px; cursor: pointer;">' +
                        'Open chat.qwen.ai in Browser ↗' +
                      '</button>' +
                      '<textarea id="qwenLoginCookie" rows="2" style="width: 100%; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 6px; padding: 8px; color: var(--text-primary); font-family: monospace; font-size: 0.78rem; resize: none; box-sizing: border-box;" placeholder="Paste token value (starts with eyJ...)"></textarea>' +
                      '<button id="qwenManualConnectBtn" class="cr-save-btn" style="width: 100%; padding: 8px; font-weight: 600; background: #10b981; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 0.85rem;">' +
                        'Connect & Save Session' +
                      '</button>' +
                    '</div>' +
                  '</details>' +
                '</div>' +
                '<div id="qwenLoginError" style="color: #ef4444; font-size: 0.85rem; text-align: center; min-height: 20px; font-weight: 500;"></div>' +
              '</div>' +
            '</section>' +
            '<section id="panel-chat" class="cr-panel" style="display: none;">' +
              '<div class="cr-chat-layout">' +
                '<aside id="cr-chat-sidebar" class="cr-sidebar open">' +
                  '<div class="cr-sidebar-head"><span>Chats</span><button id="newChatBtn" class="cr-mini-btn" title="New chat">+</button></div>' +
                  '<div id="thread-list" class="cr-thread-list"></div>' +
                '</aside>' +
                '<section class="cr-chat-main">' +
                  '<div class="cr-model-bar">' +
                    '<label for="modelSelect">Model</label>' +
                    '<select id="modelSelect"><option value="">Loading models...</option></select>' +
                    '<button id="refreshModelsBtn" class="cr-refresh-btn" title="Refresh models">↻</button>' +
                    '<button id="stopGenerationBtn" class="cr-stop-gen-btn" title="Stop generation" style="display:none">Stop</button>' +
                  '</div>' +
                  '<div id="chat-area-container"></div>' +
                '</section>' +
              '</div>' +
            '</section>' +
            '<section id="panel-settings" class="cr-panel" style="display: none;">' +
              '<div class="cr-settings">' +
                '<h3 style="margin-top:0; color:var(--text-primary);">Qwen Configuration</h3>' +
                '<div class="cr-input-group"><label>Model</label><input type="text" id="cfgModel" value="' + esc(state.settings.model) + '" placeholder="Model name (e.g. qwen3.7-max)"></div>' +
                '<div class="cr-input-group"><label>Max Iterations</label><input type="number" id="cfgMaxIterations" value="' + (state.settings.maxIterations || 20) + '" min="1" max="50"></div>' +
                '<div class="cr-input-group"><label>Workspace Folder</label><div id="cfgWorkspaceDisplay" class="cr-workspace-display">' + esc(state.workspaceFolder || "(not detected)") + '</div></div>' +
                '<div class="cr-input-group cr-checkbox"><label><input type="checkbox" id="cfgStreaming" ' + (state.settings.streaming !== false ? 'checked' : '') + '> Enable Streaming</label></div>' +
                '<div class="cr-input-group cr-checkbox"><label><input type="checkbox" id="cfgShowThinking" ' + (state.settings.showThinking !== false ? 'checked' : '') + '> Show Thinking</label></div>' +
                '<div class="cr-input-group cr-checkbox"><label><input type="checkbox" id="cfgConfirmDangerous" ' + (state.settings.confirmDangerous !== false ? 'checked' : '') + '> Confirm Dangerous Actions</label></div>' +
                '<button id="saveSettingsBtn" class="cr-save-btn">Save Settings</button>' +
                '<button id="clearAllConvBtn" class="cr-danger-btn" style="margin-left: 8px;">Clear All Conversations</button>' +
                '<div style="margin-top: 30px; border-top: 1px solid var(--border); padding-top: 20px;">' +
                  '<button id="qwenLogoutBtn" class="cr-danger-btn" style="width:100%; font-weight: bold;">Disconnect Qwen Account</button>' +
                '</div>' +
              '</div>' +
            '</section>' +
          '</main>' +
        '</div>' +
      '</div>'
    );
  }

  function initUI() {
    document.getElementById("rail-toggle").onclick = toggleSidebar;

    var chatMain = document.querySelector(".cr-chat-main");
    if (chatMain) {
      chatMain.addEventListener("click", function(e) {
        if (window.innerWidth <= 600 && state.sidebarOpen) {
          toggleSidebar();
        }
      });
    }
    document.getElementById("rail-chat").onclick = function() { switchPanel("panel-chat", this); };
    document.getElementById("rail-settings").onclick = function() { switchPanel("panel-settings", this); };
    document.getElementById("newChatBtn").onclick = createNewChat;
    document.getElementById("newChatHeaderBtn").onclick = createNewChat;
    document.getElementById("refreshModelsBtn").onclick = loadModels;

    var loginError = document.getElementById("qwenLoginError");

    function handleAutoLoginClick() {
      if (loginError) loginError.textContent = '';
      var autoLoginBtn = document.getElementById("qwenAutoLoginBtn");
      var waitingBox = document.getElementById("qwenAutoLoginWaiting");
      var waitingText = document.getElementById("qwenAutoLoginWaitingText");
      if (autoLoginBtn) autoLoginBtn.style.display = 'none';
      if (waitingBox) waitingBox.style.display = 'flex';
      if (waitingText) waitingText.textContent = 'Launching browser...';
      if (state.isVsCode && window.VSCODE_API) {
        window.VSCODE_API.postMessage({ type: 'startQwenBrowserLogin' });
      }
    }

    function handleCancelAutoLoginClick() {
      if (state.isVsCode && window.VSCODE_API) {
        window.VSCODE_API.postMessage({ type: 'cancelQwenBrowserLogin' });
      }
    }

    var autoLoginBtn = document.getElementById("qwenAutoLoginBtn");
    if (autoLoginBtn) {
      autoLoginBtn.onclick = handleAutoLoginClick;
    }

    var cancelAutoLoginBtn = document.getElementById("qwenCancelAutoLoginBtn");
    if (cancelAutoLoginBtn) {
      cancelAutoLoginBtn.onclick = handleCancelAutoLoginClick;
    }

    var openLoginBtn = document.getElementById("qwenOpenLoginBtn");
    if (openLoginBtn) {
      openLoginBtn.onclick = function() {
        if (state.isVsCode && window.VSCODE_API) {
          window.VSCODE_API.postMessage({ type: 'openQwenLogin' });
        }
      };
    }

    var manualConnectBtn = document.getElementById("qwenManualConnectBtn");
    if (manualConnectBtn) {
      manualConnectBtn.onclick = function() {
        var cookieInput = document.getElementById("qwenLoginCookie");
        var cookie = cookieInput ? cookieInput.value.trim() : '';
        if (!cookie) {
          if (loginError) loginError.textContent = 'Please paste a valid cookie string.';
          return;
        }
        if (loginError) loginError.textContent = '';
        manualConnectBtn.disabled = true;
        manualConnectBtn.innerHTML = 'Connecting...';
        
        if (state.isVsCode && window.VSCODE_API) {
          window.VSCODE_API.postMessage({ type: 'loginQwen', cookie: cookie });
        }
      };
    }

    var logoutBtn = document.getElementById("qwenLogoutBtn");
    if (logoutBtn) {
      logoutBtn.onclick = function() {
        if (state.isVsCode && window.VSCODE_API) {
          window.VSCODE_API.postMessage({ type: 'logoutQwen' });
        }
      };
    }

    var modelSelect = document.getElementById("modelSelect");
    modelSelect.onchange = function() {
      state.selectedModel = modelSelect.value;
      state.selectedProvider = 'qwen';
      saveSelectedModel();
      updateModelBadge();
    };

    document.getElementById("saveSettingsBtn").onclick = function() {
      var newModel = document.getElementById("cfgModel").value.trim() || 'qwen3.7-max';
      var newMaxIter = parseInt(document.getElementById("cfgMaxIterations").value) || 20;
      var newStreaming = document.getElementById("cfgStreaming").checked;
      var newShowThinking = document.getElementById("cfgShowThinking").checked;
      var newConfirm = document.getElementById("cfgConfirmDangerous").checked;

      // Update local state
      state.provider = 'qwen';
      state.baseUrl = 'https://chat.qwen.ai/api/v2';
      state.settings.provider = 'qwen';
      state.settings.baseUrl = 'https://chat.qwen.ai/api/v2';
      state.settings.model = newModel;
      state.settings.maxIterations = newMaxIter;
      state.settings.streaming = newStreaming;
      state.settings.showThinking = newShowThinking;
      state.settings.confirmDangerous = newConfirm;
      state.settings.apiType = 'openai';

      if (newModel) {
        state.selectedModel = newModel;
        state.selectedProvider = 'qwen';
      }

      if (state.isVsCode && window.VSCODE_API) {
        window.VSCODE_API.postMessage({
          type: "saveSettings",
          settings: {
            provider: 'qwen',
            baseUrl: 'https://chat.qwen.ai/api/v2',
            model: newModel,
            maxIterations: newMaxIter,
            streaming: newStreaming,
            showThinking: newShowThinking,
            confirmDangerous: newConfirm,
            apiType: 'openai'
          },
          apiKey: '••••••••'
        });
      }

      var button = document.getElementById("saveSettingsBtn");
      button.textContent = "Saved";
      setTimeout(function() { button.textContent = "Save Settings"; }, 1200);

      updateModelBadge();
      updateModelSelectValue();
    };

    var clearBtn = document.getElementById("clearAllConvBtn");
    if (clearBtn) {
      clearBtn.onclick = function() {
        if (state.isVsCode && window.VSCODE_API) {
          window.VSCODE_API.postMessage({ type: "confirmClearAll" });
          return;
        }
        if (confirm("Delete all conversations?")) performClearAll();
      };
    }

    document.getElementById("stopGenerationBtn").onclick = function() {
      if (window.stopCurrentChatStream) window.stopCurrentChatStream();
      showStopButton(false);
    };

    document.addEventListener("keydown", function(event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "l") {
        event.preventDefault();
        createNewChat();
      }
    });

    // Set initial settings values
    updateSettingsUI();
  }

  function switchPanel(panelId, button) {
    document.querySelectorAll(".cr-panel").forEach(function(panel) {
      panel.classList.remove("active");
      panel.style.display = 'none';
    });
    document.querySelectorAll(".cr-rail-btn").forEach(function(btn) {
      btn.classList.remove("active");
    });
    var activePanel = document.getElementById(panelId);
    if (activePanel) {
      activePanel.classList.add("active");
      activePanel.style.display = 'flex';
    }
    if (button) button.classList.add("active");
  }

  function toggleSidebar() {
    state.sidebarOpen = !state.sidebarOpen;
    saveStateToVscode();
    var sidebar = document.getElementById("cr-chat-sidebar");
    if (sidebar) {
      sidebar.classList.toggle("open", state.sidebarOpen);
      sidebar.classList.toggle("closed", !state.sidebarOpen);
    }
    var toggleBtn = document.getElementById("rail-toggle");
    if (toggleBtn) {
      toggleBtn.textContent = state.sidebarOpen ? "✕" : "☰";
    }
  }

  function checkHealth() {
    state.isOnline = true;
    var dot = document.getElementById("status-dot");
    var text = document.getElementById("status-text");
    if (dot) dot.className = "cr-status-dot";
    if (text) text.textContent = "Online";
    if (!state.models || !state.models.length) {
      state.models = [
        'qwen3.7-plus',
        'qwen3.8-max',
        'qwen3.8-omni-flash',
        'qwen3.7-max',
        'qwen3.6-plus',
        'qwen3.5-plus',
        'qwen3.5-omni-plus'
      ];
      state.modelsByProvider = { qwen: state.models };
      renderModelOptions();
    }
  }

  function loadModels() {
    if (state.isVsCode && window.VSCODE_API) {
      window.VSCODE_API.postMessage({ type: 'refreshAllModels' });
    } else {
      checkHealth();
    }
  }

  function renderModelOptions() {
    var select = document.getElementById("modelSelect");
    if (!select) return;
    select.innerHTML = "";

    if (!state.models.length) {
      // === FIX: Don't show error message as dropdown option ===
      // Instead show a placeholder and let the user know via status
      select.innerHTML = '<option value="">No models available</option>';
      state.selectedModel = "";
      updateModelBadge();
      return;
    }

    var providers = Object.keys(state.modelsByProvider);
    for (var p = 0; p < providers.length; p++) {
      var providerName = providers[p];
      var models = state.modelsByProvider[providerName];
      if (!models || !models.length) continue;
      var group = document.createElement("optgroup");
      
      var displayLabel = providerName;
      if (providerName.startsWith('compatible:')) {
        var name = providerName.substring(11);
        var saved = (state.savedProviderConfigs || {})[providerName] || {};
        var type = saved.apiType || 'openai';
        var typeLabel = type === 'anthropic' ? 'Anthropic' : (type === 'gemini' ? 'Gemini' : 'Compatible');
        displayLabel = name + ' (' + typeLabel + ')';
      } else {
        displayLabel = providerName.charAt(0).toUpperCase() + providerName.slice(1);
      }
      group.label = displayLabel + " models";

      for (var i = 0; i < models.length; i++) {
        var option = document.createElement("option");
        option.value = models[i];
        option.textContent = models[i];
        option.title = models[i];
        option.dataset.provider = providerName;
        group.appendChild(option);
      }
      select.appendChild(group);
    }

    if (!state.selectedModel || !optionExists(select, state.selectedModel)) {
      state.selectedModel = select.options[0] ? select.options[0].value : "";
      state.selectedProvider = select.options[0] ? (select.options[0].dataset?.provider || '') : '';
      saveSelectedModel();
    }
    updateModelSelectValue();
    updateModelBadge();
  }

  function optionExists(select, value) {
    for (var i = 0; i < select.options.length; i++) {
      if (select.options[i].value === value) return true;
    }
    return false;
  }

  function updateModelSelectValue() {
    var select = document.getElementById("modelSelect");
    if (!select || !state.selectedModel) return;

    if (!optionExists(select, state.selectedModel)) {
      if (select.options.length === 1 && !select.options[0].value) {
        select.innerHTML = "";
      }
      var provider = state.selectedProvider || 'qwen';
      
      var displayLabel = provider;
      if (provider.startsWith('compatible:')) {
        var name = provider.substring(11);
        var saved = (state.savedProviderConfigs || {})[provider] || {};
        var type = saved.apiType || 'openai';
        var typeLabel = type === 'anthropic' ? 'Anthropic' : (type === 'gemini' ? 'Gemini' : 'Compatible');
        displayLabel = name + ' (' + typeLabel + ')';
      } else {
        displayLabel = provider.charAt(0).toUpperCase() + provider.slice(1);
      }
      var groupLabel = displayLabel + " models";
      
      var optgroup = null;
      var groups = select.getElementsByTagName("optgroup");
      for (var i = 0; i < groups.length; i++) {
        if (groups[i].label === groupLabel) {
          optgroup = groups[i];
          break;
        }
      }
      
      if (!optgroup) {
        optgroup = document.createElement("optgroup");
        optgroup.label = groupLabel;
        select.appendChild(optgroup);
      }
      
      var option = document.createElement("option");
      option.value = state.selectedModel;
      option.textContent = state.selectedModel;
      option.title = state.selectedModel;
      option.dataset.provider = provider;
      optgroup.appendChild(option);
    }

    select.value = state.selectedModel;
  }

  function updateModelBadge() {
    var badge = document.getElementById("headerModelBadge");
    if (!badge) return;
    badge.textContent = state.selectedModel || state.settings.model || "No model";
  }

  function renderSidebar() {
    var list = document.getElementById("thread-list");
    if (!list) return;
    list.innerHTML = "";

    if (!state.conversations.length) {
      list.innerHTML = '<div class="cr-empty">No chats yet</div>';
      return;
    }

    for (var i = 0; i < state.conversations.length; i++) {
      var conversation = state.conversations[i];
      var item = document.createElement("div");
      item.className = "cr-thread-item" + (state.activeConversationId === conversation.id ? " active" : "");
      item.dataset.id = conversation.id;

      if (state.renamingId === conversation.id) {
        var input = document.createElement("input");
        input.className = "cr-rename-input";
        input.id = "rename-input-" + conversation.id;
        input.value = state.renameValue;
        item.appendChild(input);
      } else {
        item.innerHTML =
          '<span class="cr-thread-title">' + esc(conversation.title || "New chat") + '</span>' +
          '<span class="cr-thread-actions">' +
            '<button class="cr-thread-dots" title="Rename" data-action="rename" data-id="' + esc(conversation.id) + '">✎</button>' +
            '<button class="cr-thread-delete" title="Delete" data-action="delete" data-id="' + esc(conversation.id) + '">×</button>' +
          '</span>';
      }

      list.appendChild(item);
    }

    var items = list.querySelectorAll(".cr-thread-item");
    for (var j = 0; j < items.length; j++) {
      items[j].onclick = function(event) {
        var button = event.target.closest("[data-action]");
        if (button) {
          if (button.dataset.action === "rename") startRename(button.dataset.id);
          if (button.dataset.action === "delete") deleteConversation(button.dataset.id);
          return;
        }
        if (state.renamingId !== this.dataset.id) selectConversation(this.dataset.id);
      };
    }

    if (state.renamingId) bindRenameInput();
  }

  function bindRenameInput() {
    var input = document.getElementById("rename-input-" + state.renamingId);
    if (!input) return;
    input.focus();
    input.select();
    input.onblur = function() { saveRename(state.renamingId); };
    input.onkeydown = function(event) {
      if (event.key === "Enter") saveRename(state.renamingId);
      if (event.key === "Escape") {
        state.renamingId = null;
        renderSidebar();
      }
    };
  }

  function selectConversation(id) {
    state.activeConversationId = id || null;
    state.renamingId = null;
    saveStateToVscode();
    renderSidebar();

    if (window.innerWidth <= 600 && state.sidebarOpen) {
      toggleSidebar();
    }

    var container = document.getElementById("chat-area-container");
    if (!container) return;

    if (!id) {
      container.innerHTML =
        '<div class="cr-empty-chat">' +
          '<div class="cr-empty-mark">Q</div>' +
          '<p class="cr-empty-chat-title">Ask Qwen CodeRun about this workspace</p>' +
          '<p class="cr-empty-chat-sub">Ask Qwen to write code, read files, run terminal commands, and solve tasks.</p>' +
        '</div>';
      return;
    }

    var conversation = state.conversations.find(function(item) { return item.id === id; });
    if (!conversation) return;

    if (id.startsWith('new-')) {
      if (typeof window.renderChatSpace === "function") {
        window.renderChatSpace(container, conversation, {
          model: state.selectedModel,
          workspaceFolder: state.workspaceFolder,
          baseUrl: state.baseUrl,
          onStreamStart: function() { showStopButton(true); },
          onStreamEnd: function() { showStopButton(false); },
          onStreamError: function() { showStopButton(false); }
        });
      }
    } else {
      container.innerHTML =
        '<div class="cr-empty-chat">' +
          '<div class="cr-empty-mark cr-spin-icon" style="animation: cr-spin 2s linear infinite; display: inline-block;">↻</div>' +
          '<p class="cr-empty-chat-title">Loading Qwen chat history...</p>' +
        '</div>';
        
      if (state.isVsCode && window.VSCODE_API) {
        window.VSCODE_API.postMessage({ type: 'getQwenChatDetail', chatId: id });
      }
    }
  }

  function createNewChat() {
    var conversation = {
      id: 'new-' + genId(),
      title: "New chat",
      messages: [],
      createdAt: Date.now()
    };
    state.conversations.unshift(conversation);
    saveConversations();
    selectConversation(conversation.id);
  }

  function startRename(id) {
    var conversation = state.conversations.find(function(item) { return item.id === id; });
    state.renamingId = id;
    state.renameValue = conversation ? conversation.title || "" : "";
    renderSidebar();
  }

  function saveRename(id) {
    var input = document.getElementById("rename-input-" + id);
    var title = input ? input.value.trim() : "";
    var conversation = state.conversations.find(function(item) { return item.id === id; });
    if (conversation && title) {
      conversation.title = title;
      saveConversations();
    }
    state.renamingId = null;
    renderSidebar();
  }

  function deleteConversation(id) {
    if (state.isVsCode && window.VSCODE_API) {
      window.VSCODE_API.postMessage({ type: "confirmDelete", id: id });
      return;
    }
    if (confirm("Delete this conversation?")) performDelete(id);
  }

  function performDelete(id) {
    state.conversations = state.conversations.filter(function(item) { return item.id !== id; });
    if (state.activeConversationId === id) {
      state.activeConversationId = state.conversations[0] ? state.conversations[0].id : null;
    }
    saveConversations();
    renderSidebar();
    selectConversation(state.activeConversationId);
  }

  function performClearAll() {
    state.conversations = [];
    state.activeConversationId = null;
    saveConversations();
    renderSidebar();
    selectConversation(null);
  }

  window.performDeleteConversation = performDelete;
  window.performClearAllConversations = performClearAll;

  function showStopButton(show) {
    var button = document.getElementById("stopGenerationBtn");
    if (button) button.style.display = show ? "inline-flex" : "none";
  }

  window.updateAgentTimeline = function() {};
  window.clearAgentTimeline = function() {};

  // ── Terminal output is now rendered ONLY via inline tool cards ────
  //    inside each assistant message. The fixed terminal panel is no
  //    longer used. These stubs prevent errors if any code still calls
  //    them.
  window.appendTerminalLine = function() {};
  window.forwardTerminalEvent = function() {};
  window.clearTerminal = function() {};
  function clearTerminal() {}

  window.getDashboardModel = function() { return state.selectedModel; };
  window.getDashboardProvider = function() { return state.selectedProvider; };
  window.getDashboardWorkspace = function() { return state.workspaceFolder; };
  window.getDashboardBaseUrl = function() { return state.baseUrl; };
  window.getDashboardAlwaysDecisions = function() { return state.alwaysDecisions || {}; };

  window.saveConversationMessage = function(convId, role, content, extra) {
    extra = extra || {};
    var conversation = state.conversations.find(function(item) { return item.id === convId; });
    if (!conversation) return;
    if (!conversation.messages) conversation.messages = [];

    var message = { role: role, content: content || "", timestamp: Date.now() };
    if (extra.thinking) message.thinking = extra.thinking;
    if (extra.sources) message.sources = extra.sources;
    if (extra.image) message.image = extra.image;
    if (extra.images) message.images = extra.images;
    if (extra.attachment) message.attachment = extra.attachment;
    if (extra.attachments) message.attachments = extra.attachments;
    if (extra.files) message.files = extra.files;
    if (extra.tool_calls) message.tool_calls = extra.tool_calls;
    if (extra.tool_call_id) message.tool_call_id = extra.tool_call_id;
    if (extra.tool_name) message.tool_name = extra.tool_name;
    if (extra.result) message.result = extra.result;

    var last = conversation.messages[conversation.messages.length - 1];
    if (last && last.role === role) {
      if (content) last.content = content;
      if (message.thinking) last.thinking = message.thinking;
      if (message.sources) last.sources = message.sources;
      if (message.image) last.image = message.image;
      if (message.images) last.images = message.images;
      if (message.attachment) last.attachment = message.attachment;
      if (message.attachments) last.attachments = message.attachments;
      if (message.files) last.files = message.files;
      if (message.tool_calls) last.tool_calls = message.tool_calls;
      if (message.tool_name) last.tool_name = message.tool_name;
      if (message.result) last.result = message.result;
    } else {
      conversation.messages.push(message);
    }

    if (conversation.title === "New chat" && role === "user" && content) {
      conversation.title = content.slice(0, 44) + (content.length > 44 ? "..." : "");
    }

    saveConversations();
    renderSidebar();
  };

  window.saveConversationMessageBatch = function(convId, newMessages, plan) {
    var conversation = state.conversations.find(function(item) { return item.id === convId; });
    if (!conversation) return;
    if (!conversation.messages) conversation.messages = [];

    // Find the index of the last user message
    var lastUserIdx = -1;
    for (var i = conversation.messages.length - 1; i >= 0; i--) {
      if (conversation.messages[i].role === 'user') {
        lastUserIdx = i;
        break;
      }
    }

    if (lastUserIdx !== -1) {
      conversation.messages = conversation.messages.slice(0, lastUserIdx + 1).concat(newMessages);
    } else {
      conversation.messages = conversation.messages.concat(newMessages);
    }

    if (plan) {
      conversation.plan = plan;
    }

    saveConversations();
    renderSidebar();
  };

  window.updateConversationTitle = function(convId, title) {
    var conversation = state.conversations.find(function(item) { return item.id === convId; });
    if (conversation && title) {
      conversation.title = title;
      saveConversations();
      renderSidebar();
    }
  };

  window.transitionActiveChatId = function(oldId, newId) {
    var conversation = state.conversations.find(function(item) { return item.id === oldId; });
    if (conversation) {
      conversation.id = newId;
      if (state.activeConversationId === oldId) {
        state.activeConversationId = newId;
      }
      saveConversations();
      renderSidebar();
    }
  };

  window.webviewAlert = function(message) {
    if (state.isVsCode && window.VSCODE_API) {
      window.VSCODE_API.postMessage({ type: "showAlert", message: message });
      return;
    }
    alert(message);
  };

  window.addEventListener("message", function(event) {
    var message = event.data || {};
    if (message.type === "qwenChatIdTransition") {
      window.transitionActiveChatId(message.oldId, message.newId);
    }
    if (message.type === "qwenLoginWaiting") {
      var autoLoginBtn = document.getElementById("qwenAutoLoginBtn");
      var waitingBox = document.getElementById("qwenAutoLoginWaiting");
      var waitingText = document.getElementById("qwenAutoLoginWaitingText");
      if (autoLoginBtn) autoLoginBtn.style.display = 'none';
      if (waitingBox) waitingBox.style.display = 'flex';
      if (waitingText) waitingText.textContent = message.message || 'Waiting for login in browser...';
    }
    if (message.type === "qwenAuthState") {
      var authenticated = message.authenticated;
      var error = message.error;
      
      var loginPanel = document.getElementById("panel-login");
      var chatPanel = document.getElementById("panel-chat");
      var settingsPanel = document.getElementById("panel-settings");
      var railToggle = document.getElementById("rail-toggle");
      var railChat = document.getElementById("rail-chat");
      var railSettings = document.getElementById("rail-settings");
      var loginError = document.getElementById("qwenLoginError");
      var autoLoginBtn = document.getElementById("qwenAutoLoginBtn");
      var waitingBox = document.getElementById("qwenAutoLoginWaiting");

      if (autoLoginBtn) autoLoginBtn.style.display = '';
      if (waitingBox) waitingBox.style.display = 'none';
      
      if (authenticated) {
        if (loginPanel) loginPanel.style.display = 'none';
        if (chatPanel) chatPanel.style.display = 'flex';
        if (railToggle) railToggle.style.display = '';
        if (railChat) railChat.style.display = '';
        if (railSettings) railSettings.style.display = '';
        if (loginError) loginError.textContent = '';
        
        if (state.activePanel === 'panel-settings') {
          switchPanel("panel-settings", railSettings);
        } else {
          switchPanel("panel-chat", railChat);
        }
        
        loadModels();
      } else {
        if (loginPanel) loginPanel.style.display = 'flex';
        if (chatPanel) chatPanel.style.display = 'none';
        if (settingsPanel) settingsPanel.style.display = 'none';
        if (railToggle) railToggle.style.display = 'none';
        if (railChat) railChat.style.display = 'none';
        if (railSettings) railSettings.style.display = 'none';
        if (loginError && error) loginError.textContent = error;
        
        var manualConnectBtn = document.getElementById("qwenManualConnectBtn");
        if (manualConnectBtn) {
          manualConnectBtn.disabled = false;
          manualConnectBtn.innerHTML = 'Connect & Save Session';
        }
      }
    }
    if (message.type === "qwenChatDetail") {
      if (message.success && message.messages) {
        var conv = state.conversations.find(function(item) { return item.id === message.chatId; });
        if (conv) {
          conv.messages = message.messages;
          var container = document.getElementById("chat-area-container");
          if (container && state.activeConversationId === message.chatId && typeof window.renderChatSpace === "function") {
            window.renderChatSpace(container, conv, {
              model: state.selectedModel,
              workspaceFolder: state.workspaceFolder,
              baseUrl: state.baseUrl,
              onStreamStart: function() { showStopButton(true); },
              onStreamEnd: function() { showStopButton(false); },
              onStreamError: function() { showStopButton(false); }
            });
          }
        }
      } else {
        var container = document.getElementById("chat-area-container");
        if (container) {
          var authActionBtn = '';
          if (message.isAuthError) {
            authActionBtn = '<button id="crChatHistorySignInBtn" class="cr-save-btn" style="margin-top: 14px; padding: 10px 18px; font-weight: 600; background: #6366f1; color: #fff; border: none; border-radius: 6px; cursor: pointer;">🚀 1-Click Sign In with Qwen</button>';
          }
          container.innerHTML =
            '<div class="cr-empty-chat">' +
              '<div class="cr-empty-mark" style="color: #ef4444;">⚠</div>' +
              '<p class="cr-empty-chat-title">Failed to load chat history</p>' +
              '<p class="cr-empty-chat-sub">' + esc(message.error || 'Connection failed') + '</p>' +
              authActionBtn +
            '</div>';

          var retrySignInBtn = container.querySelector('#crChatHistorySignInBtn');
          if (retrySignInBtn) {
            retrySignInBtn.onclick = function() {
              retrySignInBtn.disabled = true;
              retrySignInBtn.innerHTML = '⏳ Opening login window...';
              if (state.isVsCode && window.VSCODE_API) {
                window.VSCODE_API.postMessage({ type: 'startQwenBrowserLogin' });
              }
            };
          }
        }
      }
    }
    if (message.type === "loadConversations") {
      window.loadConversationsFromExtension(message.conversations, message.selectedModel, message.selectedProvider);
    }
    if (message.type === "workspaceFolder") {
      window.setDashboardWorkspace(message.path);
    }
    if (message.type === "deleteConversationConfirmed") {
      performDelete(message.id);
    }
    if (message.type === "clearAllConversationsConfirmed") {
      performClearAll();
    }
    if (message.type === "newChat") {
      createNewChat();
    }
    if (message.type === "currentSettings") {
      window.applyVscodeSettings(message.settings);
    }
    if (message.type === "permissionState") {
      state.alwaysDecisions = message.decisions || {};
    }
    if (message.type === "healthStatus") {
      state.isOnline = !!message.online;
      var dot = document.getElementById("status-dot");
      var text = document.getElementById("status-text");
      if (dot) dot.className = message.online ? "cr-status-dot" : "cr-status-dot cr-status-offline";
      if (text) text.textContent = message.online ? "Online" : "Offline";
      if (message.models && message.models.length) {
        var pName = message.provider || 'qwen';
        if (!state.modelsByProvider) state.modelsByProvider = {};
        state.modelsByProvider[pName] = message.models;
        state.models = message.models;
        renderModelOptions();
      }
    }
  });

  window.getDashboardActiveConversationId = function() {
    return state.activeConversationId;
  };

  window.selectDashboardConversation = function(id) {
    selectConversation(id);
  };
}());

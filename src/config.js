// config.js — Reads VS Code settings and merges with defaults
// All provider config (URL, API key, model name) is read from VS Code user settings.

import * as vscode from 'vscode';
import { PROVIDER_DEFAULTS, STORAGE_KEYS } from './constants.js';

var _cached = null;

/**
 * Get the full configuration from VS Code settings.
 * Settings are read from User Settings > Workspace Settings > Default values.
 */
export function getConfig() {
  if (_cached) return _cached;
  var cfg = vscode.workspace.getConfiguration('qwen-coderun');
  _cached = {
    provider: cfg.get('provider', 'qwen'),
    baseUrl: cfg.get('baseUrl', 'https://chat.qwen.ai/api/v2'),
    model: cfg.get('model', 'qwen3.7-plus'),
    maxIterations: cfg.get('maxIterations', 20),
    streaming: cfg.get('streaming', true),
    showThinking: cfg.get('showThinking', true),
    autoScroll: cfg.get('autoScroll', true),
    confirmDangerous: cfg.get('confirmDangerous', true),
    organization: cfg.get('organization', null),
    project: cfg.get('project', null)
  };
  return _cached;
}

export function invalidateCache() {
  _cached = null;
}

/**
 * Build provider configuration object for API calls.
 * Reads baseUrl, model, provider from VS Code settings.
 * API key is read from VS Code secrets (not settings).
 */
export function getProviderConfig() {
  var cfg = getConfig();
  return {
    provider: 'qwen',
    baseUrl: 'https://chat.qwen.ai/api/v2',
    model: cfg.model || 'qwen3.7-max',
    needsKey: true
  };
}

/**
 * Get provider config with API key resolved from secrets.
 * This is the complete config needed to make API calls.
 */
export async function getProviderConfigWithKey(context) {
  var cfg = getProviderConfig();
  cfg.apiKey = await getApiKey(context) || '';
  return cfg;
}

/**
 * Get API key from VS Code secrets storage (encrypted).
 */
export async function getApiKey(context) {
  var key = '';
  try {
    key = context.globalState.get('qwen-coderun.fallbackCookie') || '';
  } catch (_) {}
  if (!key) {
    try {
      key = await context.secrets.get('qwen-coderun.apiKey') || '';
    } catch (_) {}
  }
  return key;
}

export async function setApiKey(context, key) {
  try {
    await context.secrets.store('qwen-coderun.apiKey', key);
  } catch (_) {}
  await context.globalState.update('qwen-coderun.fallbackCookie', key);
  try {
    var all = getAllProviderConfigs(context);
    all['qwen'] = all['qwen'] || {};
    all['qwen'].apiKey = key;
    await context.globalState.update(STORAGE_KEYS.PROVIDER_CONFIGS, JSON.stringify(all));
  } catch (_) {}
}

export async function deleteApiKey(context) {
  try {
    await context.secrets.delete('qwen-coderun.apiKey');
  } catch (_) {}
  await context.globalState.update('qwen-coderun.fallbackCookie', undefined);
}

export function getOllamaUrl() {
  var cfg = getConfig();
  return String(cfg.baseUrl || 'http://localhost:11434').replace(/\/+$/, '');
}

export function getMaxIterations() {
  return getConfig().maxIterations;
}

export function shouldConfirmDangerous() {
  return getConfig().confirmDangerous;
}

export function isStreamingEnabled() {
  return getConfig().streaming;
}

export function shouldShowThinking() {
  return getConfig().showThinking;
}

/**
 * Update a VS Code setting. This writes to User Settings by default.
 */
export async function updateSetting(key, value, target) {
  target = target || vscode.ConfigurationTarget.Global;
  var cfg = vscode.workspace.getConfiguration('qwen-coderun');
  await cfg.update(key, value, target);
  invalidateCache();
}

/**
 * Update multiple settings at once.
 */
export async function updateSettings(settings, target) {
  target = target || vscode.ConfigurationTarget.Global;
  var cfg = vscode.workspace.getConfiguration('qwen-coderun');
  for (var key in settings) {
    await cfg.update(key, settings[key], target);
  }
  invalidateCache();
}

/**
 * Check if a provider requires an API key.
 */
export function needsApiKey(provider) {
  return true;
}

// ============================================================
// MULTI-PROVIDER CONFIG STORAGE
// Stores multiple provider configurations (baseUrl, apiKey, model)
// in VS Code globalState under qwen-coderun_provider_configs.
// ============================================================

/**
 * Get all saved provider configurations from globalState.
 * Returns an object like { ollama: { baseUrl, apiKey, model }, groq: {...} }
 */
export function getAllProviderConfigs(context) {
  if (!context) return {};
  try {
    var raw = context.globalState.get(STORAGE_KEYS.PROVIDER_CONFIGS, '{}');
    return JSON.parse(raw) || {};
  } catch (e) {
    return {};
  }
}

/**
 * Get a single provider's saved configuration.
 */
export function getSavedProviderConfig(context, provider) {
  var all = getAllProviderConfigs(context);
  return all[provider] || null;
}

/**
 * Save a provider's configuration.
 * config: { baseUrl, apiKey, model? }
 */
export async function saveProviderConfig(context, provider, config) {
  if (!context || !provider) return;
  var all = getAllProviderConfigs(context);
  all[provider] = {
    baseUrl: config.baseUrl || '',
    apiKey: config.apiKey || '',
    model: config.model || '',
    apiType: config.apiType || 'openai'
  };
  await context.globalState.update(STORAGE_KEYS.PROVIDER_CONFIGS, JSON.stringify(all));
}

/**
 * Delete a provider's saved configuration.
 */
export async function deleteProviderConfig(context, provider) {
  if (!context || !provider) return;
  var all = getAllProviderConfigs(context);
  delete all[provider];
  await context.globalState.update(STORAGE_KEYS.PROVIDER_CONFIGS, JSON.stringify(all));
}

/**
 * Get the API key for a specific provider from its saved config.
 */
export function getProviderApiKey(context, provider) {
  var saved = getSavedProviderConfig(context, provider);
  return saved ? (saved.apiKey || '') : '';
}

/**
 * Build a full provider config for API calls by merging the saved config
 * with defaults. Used by extension.js when starting a chat with a specific provider.
 */
export async function getProviderConfigByName(context, providerName) {
  var saved = getSavedProviderConfig(context, providerName) || {};
  var isCompatible = providerName.startsWith('compatible');
  var defaults = isCompatible ? PROVIDER_DEFAULTS.compatible : (PROVIDER_DEFAULTS[providerName] || PROVIDER_DEFAULTS.ollama);
  var key = '';
  if (providerName === 'qwen' || !providerName) {
    key = await getApiKey(context) || saved.apiKey || '';
  } else {
    key = saved.apiKey || '';
  }
  return {
    provider: providerName,
    baseUrl: saved.baseUrl || defaults.baseUrl,
    model: saved.model || '',
    apiKey: key,
    needsKey: defaults.needsKey,
    apiType: saved.apiType || 'openai'
  };
}
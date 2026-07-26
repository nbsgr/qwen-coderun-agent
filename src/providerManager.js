// providerManager.js — Creates the right provider based on config
// Dedicated Qwen extension: returns providerQwen unconditionally.

import * as providerQwen from './providerQwen.js';

export function createProvider(config) {
  return providerQwen;
}

export function getProviderName(config) {
  return 'qwen';
}

export function needsApiKey(provider) {
  return true;
}
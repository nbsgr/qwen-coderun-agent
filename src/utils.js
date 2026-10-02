// utils.js — Small reusable helpers

export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function genId() {
  return 'conv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
}

export function truncate(s, n) {
  return s.length > n ? s.substring(0, n) + '…' : s;
}

export function flatStr(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v); } catch (_) { return String(v); }
}

export function formatTime(ts) {
  if (!ts) return '';
  var d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function sleep(ms) {
  return new Promise(function(resolve) {
    setTimeout(resolve, ms);
  });
}

export function debounce(fn, ms) {
  var timer;
  return function() {
    var self = this;
    var args = arguments;
    clearTimeout(timer);
    timer = setTimeout(function() {
      fn.apply(self, args);
    }, ms);
  };
}

export function safeJsonParse(str, fallback) {
  try { return JSON.parse(str); } catch (_) { return fallback; }
}

export function clamp(num, min, max) {
  return Math.min(Math.max(num, min), max);
}

export function isEmpty(obj) {
  if (obj == null) return true;
  if (typeof obj === 'string') return obj.trim() === '';
  if (Array.isArray(obj)) return obj.length === 0;
  if (typeof obj === 'object') return Object.keys(obj).length === 0;
  return false;
}

export function pick(obj, keys) {
  var result = {};
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (obj.hasOwnProperty(k)) result[k] = obj[k];
  }
  return result;
}

export function mergeCookieStrings(baseCookie, newCookie) {
  var map = {};
  if (baseCookie) {
    var p1 = baseCookie.split(';');
    for (var i = 0; i < p1.length; i++) {
      var item1 = p1[i].trim();
      var eq1 = item1.indexOf('=');
      if (eq1 !== -1) {
        var k1 = item1.substring(0, eq1).trim();
        var v1 = item1.substring(eq1 + 1).trim();
        if (k1) map[k1] = v1;
      }
    }
  }
  if (newCookie) {
    var p2 = newCookie.split(';');
    for (var j = 0; j < p2.length; j++) {
      var item2 = p2[j].trim();
      var eq2 = item2.indexOf('=');
      if (eq2 !== -1) {
        var k2 = item2.substring(0, eq2).trim();
        var v2 = item2.substring(eq2 + 1).trim();
        if (k2) map[k2] = v2;
      }
    }
  }
  var res = [];
  var keys = Object.keys(map);
  for (var k = 0; k < keys.length; k++) {
    res.push(keys[k] + '=' + map[keys[k]]);
  }
  return res.join('; ');
}

export function mergeDefaults(target, defaults) {
  var result = {};
  for (var k in defaults) {
    result[k] = target.hasOwnProperty(k) ? target[k] : defaults[k];
  }
  for (var k in target) {
    if (!result.hasOwnProperty(k)) result[k] = target[k];
  }
  return result;
}

export async function handleApiResponseError(response, providerName) {
  var status = response.status;
  var statusText = response.statusText;
  
  // Try to parse structured error message from response body
  var errorMsg = '';
  try {
    var clone = response.clone();
    var bodyText = await clone.text();
    if (bodyText) {
      try {
        var bodyJson = JSON.parse(bodyText);
        // Common structured error formats:
        // OpenAI / OpenRouter / Groq: { error: { message: "..." } }
        // Anthropic: { error: { type: "...", message: "..." } }
        // Gemini: [ { error: { message: "..." } } ] or { error: { message: "..." } }
        if (bodyJson.error) {
          errorMsg = bodyJson.error.message || bodyJson.error.type || String(bodyJson.error);
        } else if (Array.isArray(bodyJson) && bodyJson[0]?.error) {
          errorMsg = bodyJson[0].error.message || String(bodyJson[0].error);
        } else if (bodyJson.message) {
          errorMsg = bodyJson.message;
        } else {
          errorMsg = truncate(bodyText, 300);
        }
      } catch (_) {
        // Not JSON - clean HTML or truncate text
        errorMsg = truncate(bodyText.replace(/<[^>]*>/g, '').trim(), 300);
      }
    }
  } catch (_) {}

  var prefix = providerName ? (providerName + ' API Error') : 'API Error';
  
  // Check common HTTP status codes
  if (status === 429) {
    return new Error(prefix + ': HTTP 429 Rate Limit Exceeded. Please check your API quota or wait a moment before trying again.' + (errorMsg ? ' Details: ' + errorMsg : ''));
  }
  if (status === 401) {
    return new Error(prefix + ': HTTP 401 Unauthorized. Invalid API key. Please check your API key in the extension settings.' + (errorMsg ? ' Details: ' + errorMsg : ''));
  }
  if (status === 403) {
    return new Error(prefix + ': HTTP 403 Forbidden. Access denied. Please verify your billing/quota or IP permissions.' + (errorMsg ? ' Details: ' + errorMsg : ''));
  }
  if (status === 404) {
    return new Error(prefix + ': HTTP 404 Not Found. The requested model or endpoint does not exist.' + (errorMsg ? ' Details: ' + errorMsg : ''));
  }
  if (status >= 500) {
    return new Error(prefix + ': HTTP ' + status + ' Upstream Server Error. The provider\'s server is overloaded, failed, or temporarily unavailable.' + (errorMsg ? ' Details: ' + errorMsg : ''));
  }
  
  return new Error(prefix + ': HTTP ' + status + ' ' + (statusText || '') + (errorMsg ? ' - ' + errorMsg : ''));
}

export async function safeReadJson(response, providerName) {
  var contentType = response.headers.get('content-type') || '';
  if (contentType && !contentType.toLowerCase().includes('application/json')) {
    var text = '';
    try {
      var cloneForText = response.clone();
      text = await cloneForText.text();
    } catch (_) {}
    if (text.trim().startsWith('<') || text.toLowerCase().includes('html')) {
      throw new Error((providerName ? providerName + ' API Error: ' : '') + 'Expected JSON response, but received HTML. Please check if your Base URL is correct.');
    }
  }

  try {
    var cloneForJson = response.clone();
    return await cloneForJson.json();
  } catch (err) {
    var bodyText = '';
    try {
      var cloneForFallback = response.clone();
      bodyText = await cloneForFallback.text();
    } catch (_) {}
    if (bodyText.trim().startsWith('<') || bodyText.toLowerCase().includes('html')) {
      throw new Error((providerName ? providerName + ' API Error: ' : '') + 'Expected JSON response, but received HTML. Please check if your Base URL is correct.');
    }
    throw new Error((providerName ? providerName + ' API Error: ' : '') + 'Failed to parse JSON response: ' + err.message);
  }
}
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/utils.js
function truncate(s, n) {
  return s.length > n ? s.substring(0, n) + "\u2026" : s;
}
async function handleApiResponseError(response, providerName) {
  var status = response.status;
  var statusText = response.statusText;
  var errorMsg = "";
  try {
    var clone = response.clone();
    var bodyText = await clone.text();
    if (bodyText) {
      try {
        var bodyJson = JSON.parse(bodyText);
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
        errorMsg = truncate(bodyText.replace(/<[^>]*>/g, "").trim(), 300);
      }
    }
  } catch (_) {
  }
  var prefix = providerName ? providerName + " API Error" : "API Error";
  if (status === 429) {
    return new Error(prefix + ": HTTP 429 Rate Limit Exceeded. Please check your API quota or wait a moment before trying again." + (errorMsg ? " Details: " + errorMsg : ""));
  }
  if (status === 401) {
    return new Error(prefix + ": HTTP 401 Unauthorized. Invalid API key. Please check your API key in the extension settings." + (errorMsg ? " Details: " + errorMsg : ""));
  }
  if (status === 403) {
    return new Error(prefix + ": HTTP 403 Forbidden. Access denied. Please verify your billing/quota or IP permissions." + (errorMsg ? " Details: " + errorMsg : ""));
  }
  if (status === 404) {
    return new Error(prefix + ": HTTP 404 Not Found. The requested model or endpoint does not exist." + (errorMsg ? " Details: " + errorMsg : ""));
  }
  if (status >= 500) {
    return new Error(prefix + ": HTTP " + status + " Upstream Server Error. The provider's server is overloaded, failed, or temporarily unavailable." + (errorMsg ? " Details: " + errorMsg : ""));
  }
  return new Error(prefix + ": HTTP " + status + " " + (statusText || "") + (errorMsg ? " - " + errorMsg : ""));
}
var init_utils = __esm({
  "src/utils.js"() {
  }
});

// src/providerQwen.js
var providerQwen_exports = {};
__export(providerQwen_exports, {
  chat: () => chat,
  embeddings: () => embeddings,
  images: () => images,
  listModels: () => listModels
});
async function* chat(config, messages, tools) {
  if (config.chatId && !config.chatId.startsWith("new-")) {
    activeQwenChatId = config.chatId;
  } else {
    activeQwenChatId = null;
  }
  var cookieStr = config.apiKey || "";
  if (!cookieStr) {
    throw new Error("Qwen Error: No session cookie set. Please paste your Qwen Cookie string in the settings panel.");
  }
  var token = "";
  var parts = cookieStr.split(";");
  for (var i = 0; i < parts.length; i++) {
    var part = parts[i].trim();
    if (part.startsWith("token=")) {
      token = part.substring(6);
      break;
    }
  }
  var getHeaders = function(chatId = "") {
    var h = {
      "Accept": "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9",
      "Connection": "keep-alive",
      "Content-Type": "application/json",
      "Host": "chat.qwen.ai",
      "Sec-Ch-Ua": '"Not/A)Brand";v="99", "Chromium";v="148"',
      "Sec-Ch-Ua-Mobile": "?0",
      "Sec-Ch-Ua-Platform": '"Windows"',
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
      "source": "web",
      "timezone": "Fri Jul 24 2026 15:13:30 GMT+0530",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Code/1.130.0 Chrome/148.0.7778.280 Electron/42.6.0 Safari/537.36",
      "version": "0.2.78",
      "x-request-id": getUuid(),
      "Cookie": cookieStr
    };
    if (token) h["authorization"] = "Bearer " + token;
    if (chatId) h["Referer"] = "https://chat.qwen.ai/c/" + chatId;
    return h;
  };
  var qwenModel = config.model || "qwen3.7-max";
  if (!activeQwenChatId) {
    try {
      var newChatUrl = "https://chat.qwen.ai/api/v2/chats/new";
      var newChatPayload = {
        title: "Qwen CodeRun Chat",
        models: [qwenModel],
        chat_mode: "normal",
        chat_type: "t2t",
        timestamp: Date.now()
      };
      var newChatRes = await fetch(newChatUrl, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(newChatPayload)
      });
      if (!newChatRes.ok) {
        throw new Error("HTTP error creating chat: " + newChatRes.status);
      }
      var newChatData = await newChatRes.json();
      if (newChatData && newChatData.success && newChatData.data && newChatData.data.id) {
        activeQwenChatId = newChatData.data.id;
        config.chatId = activeQwenChatId;
      } else {
        throw new Error("Qwen failed to return a new Chat ID: " + JSON.stringify(newChatData));
      }
    } catch (err) {
      throw new Error("Failed to initialize Qwen chat session: " + err.message);
    }
  }
  var url = "https://chat.qwen.ai/api/v2/chat/completions?chat_id=" + activeQwenChatId;
  var lastMsg = messages[messages.length - 1];
  var qwenRole = lastMsg.role === "assistant" ? "assistant" : "user";
  var qwenContent = lastMsg.content || "";
  if (lastMsg.role === "tool") {
    qwenContent = `[System tool execution result]:
${qwenContent}`;
  }
  var payloadMsg = {
    fid: getUuid(),
    parentId: null,
    childrenIds: [getUuid()],
    role: qwenRole,
    content: qwenContent,
    user_action: "chat",
    files: [],
    timestamp: Date.now(),
    models: [qwenModel],
    chat_type: "t2t",
    feature_config: {
      output_schema: "phase",
      thinking_enabled: true
    },
    extra: { meta: { subChatType: "t2t" } },
    sub_chat_type: "t2t",
    parent_id: null
  };
  var body = {
    stream: true,
    incremental_output: true,
    chat_id: activeQwenChatId,
    chat_mode: "normal",
    model: qwenModel,
    parent_id: null,
    messages: [payloadMsg],
    timestamp: Date.now()
  };
  var response = await fetch(url, {
    method: "POST",
    headers: getHeaders(activeQwenChatId),
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw await handleApiResponseError(response, "Qwen");
  }
  var setCookies = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : response.headers.get("set-cookie") ? response.headers.get("set-cookie").split(",") : null;
  if (setCookies && setCookies.length && typeof globalThis.qwenOnCookieUpdate === "function" && typeof globalThis.qwenMergeSetCookies === "function") {
    var merged = globalThis.qwenMergeSetCookies(cookieStr, setCookies);
    if (merged !== cookieStr) {
      cookieStr = merged;
      config.apiKey = merged;
      globalThis.qwenOnCookieUpdate(merged);
    }
  }
  if (!response.body) {
    throw new Error("Qwen API Error: Response body is empty.");
  }
  var reader = response.body.getReader();
  var decoder = new TextDecoder("utf-8");
  var buffer = "";
  while (true) {
    var chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    var lines = buffer.split("\n");
    buffer = lines.pop();
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      if (line.startsWith("data: ")) {
        var dataStr = line.substring(6);
        if (dataStr.trim() === "[DONE]") break;
        try {
          var data = JSON.parse(dataStr);
          var choice = data.choices?.[0];
          if (choice) {
            var delta = choice.delta || {};
            var result = {};
            if (delta.phase === "think") {
              result.thinking = delta.content || "";
            } else if (delta.phase === "answer") {
              result.content = delta.content || "";
            }
            yield result;
          }
        } catch (e) {
        }
      }
    }
  }
}
async function listModels(config) {
  return ["qwen3.7-max", "qwen-plus", "qwen-turbo"];
}
async function embeddings(config, texts) {
  throw new Error("Embeddings not supported by Qwen Browser API");
}
async function images(config, prompt) {
  throw new Error("Image generation not supported by Qwen Browser API");
}
function getUuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == "x" ? r : r & 3 | 8;
    return v.toString(16);
  });
}
var activeQwenChatId;
var init_providerQwen = __esm({
  "src/providerQwen.js"() {
    init_utils();
    activeQwenChatId = null;
  }
});

// src/providerManager.js
var providerManager_exports = {};
__export(providerManager_exports, {
  createProvider: () => createProvider,
  getProviderName: () => getProviderName,
  needsApiKey: () => needsApiKey
});
function createProvider(config) {
  return providerQwen_exports;
}
function getProviderName(config) {
  return "qwen";
}
function needsApiKey(provider) {
  return true;
}
var init_providerManager = __esm({
  "src/providerManager.js"() {
    init_providerQwen();
  }
});

// node_modules/sql.js/dist/sql-wasm.js
var require_sql_wasm = __commonJS({
  "node_modules/sql.js/dist/sql-wasm.js"(exports2, module2) {
    var initSqlJsPromise = void 0;
    var initSqlJs2 = function(moduleConfig) {
      if (initSqlJsPromise) {
        return initSqlJsPromise;
      }
      initSqlJsPromise = new Promise(function(resolveModule, reject) {
        var Module = typeof moduleConfig !== "undefined" ? moduleConfig : {};
        var originalOnAbortFunction = Module["onAbort"];
        Module["onAbort"] = function(errorThatCausedAbort) {
          reject(new Error(errorThatCausedAbort));
          if (originalOnAbortFunction) {
            originalOnAbortFunction(errorThatCausedAbort);
          }
        };
        Module["postRun"] = Module["postRun"] || [];
        Module["postRun"].push(function() {
          resolveModule(Module);
        });
        module2 = void 0;
        var k;
        k ||= typeof Module != "undefined" ? Module : {};
        var aa = !!globalThis.window, ba = !!globalThis.WorkerGlobalScope, ca = globalThis.process?.versions?.node && "renderer" != globalThis.process?.type;
        k.onRuntimeInitialized = function() {
          function a(f, l) {
            switch (typeof l) {
              case "boolean":
                bc(f, l ? 1 : 0);
                break;
              case "number":
                cc(f, l);
                break;
              case "string":
                dc(f, l, -1, -1);
                break;
              case "object":
                if (null === l) lb(f);
                else if (null != l.length) {
                  var n = da(l.length);
                  m.set(l, n);
                  ec(f, n, l.length, -1);
                  ea(n);
                } else sa(f, "Wrong API use : tried to return a value of an unknown type (" + l + ").", -1);
                break;
              default:
                lb(f);
            }
          }
          function b(f, l) {
            for (var n = [], p = 0; p < f; p += 1) {
              var u = r(l + 4 * p, "i32"), v = fc(u);
              if (1 === v || 2 === v) u = gc(u);
              else if (3 === v) u = hc(u);
              else if (4 === v) {
                v = u;
                u = ic(v);
                v = jc(v);
                for (var K = new Uint8Array(u), I = 0; I < u; I += 1) K[I] = m[v + I];
                u = K;
              } else u = null;
              n.push(u);
            }
            return n;
          }
          function c(f, l) {
            this.Qa = f;
            this.db = l;
            this.Oa = 1;
            this.mb = [];
          }
          function d(f, l) {
            this.db = l;
            this.fb = fa(f);
            if (null === this.fb) throw Error("Unable to allocate memory for the SQL string");
            this.lb = this.fb;
            this.$a = this.sb = null;
          }
          function e(f) {
            this.filename = "dbfile_" + (4294967295 * Math.random() >>> 0);
            if (null != f) {
              var l = this.filename, n = "/", p = l;
              n && (n = "string" == typeof n ? n : ha(n), p = l ? ia(n + "/" + l) : n);
              l = ja(true, true);
              p = ka(
                p,
                l
              );
              if (f) {
                if ("string" == typeof f) {
                  n = Array(f.length);
                  for (var u = 0, v = f.length; u < v; ++u) n[u] = f.charCodeAt(u);
                  f = n;
                }
                la(p, l | 146);
                n = ma(p, 577);
                na(n, f, 0, f.length, 0);
                oa(n);
                la(p, l);
              }
            }
            this.handleError(q(this.filename, g));
            this.db = r(g, "i32");
            ob(this.db);
            this.gb = {};
            this.Sa = {};
          }
          var g = y(4), h = k.cwrap, q = h("sqlite3_open", "number", ["string", "number"]), w = h("sqlite3_close_v2", "number", ["number"]), t = h("sqlite3_exec", "number", ["number", "string", "number", "number", "number"]), x = h("sqlite3_changes", "number", ["number"]), D = h(
            "sqlite3_prepare_v2",
            "number",
            ["number", "string", "number", "number", "number"]
          ), pb = h("sqlite3_sql", "string", ["number"]), lc = h("sqlite3_normalized_sql", "string", ["number"]), qb = h("sqlite3_prepare_v2", "number", ["number", "number", "number", "number", "number"]), mc = h("sqlite3_bind_text", "number", ["number", "number", "number", "number", "number"]), rb = h("sqlite3_bind_blob", "number", ["number", "number", "number", "number", "number"]), nc = h("sqlite3_bind_double", "number", ["number", "number", "number"]), oc = h("sqlite3_bind_int", "number", [
            "number",
            "number",
            "number"
          ]), pc = h("sqlite3_bind_parameter_index", "number", ["number", "string"]), qc = h("sqlite3_step", "number", ["number"]), rc = h("sqlite3_errmsg", "string", ["number"]), sc = h("sqlite3_column_count", "number", ["number"]), tc = h("sqlite3_data_count", "number", ["number"]), uc = h("sqlite3_column_double", "number", ["number", "number"]), sb = h("sqlite3_column_text", "string", ["number", "number"]), vc = h("sqlite3_column_blob", "number", ["number", "number"]), wc = h("sqlite3_column_bytes", "number", ["number", "number"]), xc = h(
            "sqlite3_column_type",
            "number",
            ["number", "number"]
          ), yc = h("sqlite3_column_name", "string", ["number", "number"]), zc = h("sqlite3_reset", "number", ["number"]), Ac = h("sqlite3_clear_bindings", "number", ["number"]), Bc = h("sqlite3_finalize", "number", ["number"]), tb = h("sqlite3_create_function_v2", "number", "number string number number number number number number number".split(" ")), fc = h("sqlite3_value_type", "number", ["number"]), ic = h("sqlite3_value_bytes", "number", ["number"]), hc = h("sqlite3_value_text", "string", ["number"]), jc = h(
            "sqlite3_value_blob",
            "number",
            ["number"]
          ), gc = h("sqlite3_value_double", "number", ["number"]), cc = h("sqlite3_result_double", "", ["number", "number"]), lb = h("sqlite3_result_null", "", ["number"]), dc = h("sqlite3_result_text", "", ["number", "string", "number", "number"]), ec = h("sqlite3_result_blob", "", ["number", "number", "number", "number"]), bc = h("sqlite3_result_int", "", ["number", "number"]), sa = h("sqlite3_result_error", "", ["number", "string", "number"]), ub = h("sqlite3_aggregate_context", "number", ["number", "number"]), ob = h(
            "RegisterExtensionFunctions",
            "number",
            ["number"]
          ), vb = h("sqlite3_update_hook", "number", ["number", "number", "number"]);
          c.prototype.bind = function(f) {
            if (!this.Qa) throw "Statement closed";
            this.reset();
            return Array.isArray(f) ? this.Gb(f) : null != f && "object" === typeof f ? this.Hb(f) : true;
          };
          c.prototype.step = function() {
            if (!this.Qa) throw "Statement closed";
            this.Oa = 1;
            var f = qc(this.Qa);
            switch (f) {
              case 100:
                return true;
              case 101:
                return false;
              default:
                throw this.db.handleError(f);
            }
          };
          c.prototype.Ab = function(f) {
            null == f && (f = this.Oa, this.Oa += 1);
            return uc(this.Qa, f);
          };
          c.prototype.Ob = function(f) {
            null == f && (f = this.Oa, this.Oa += 1);
            f = sb(this.Qa, f);
            if ("function" !== typeof BigInt) throw Error("BigInt is not supported");
            return BigInt(f);
          };
          c.prototype.Tb = function(f) {
            null == f && (f = this.Oa, this.Oa += 1);
            return sb(this.Qa, f);
          };
          c.prototype.getBlob = function(f) {
            null == f && (f = this.Oa, this.Oa += 1);
            var l = wc(this.Qa, f);
            f = vc(this.Qa, f);
            for (var n = new Uint8Array(l), p = 0; p < l; p += 1) n[p] = m[f + p];
            return n;
          };
          c.prototype.get = function(f, l) {
            l = l || {};
            null != f && this.bind(f) && this.step();
            f = [];
            for (var n = tc(this.Qa), p = 0; p < n; p += 1) switch (xc(this.Qa, p)) {
              case 1:
                var u = l.useBigInt ? this.Ob(p) : this.Ab(p);
                f.push(u);
                break;
              case 2:
                f.push(this.Ab(p));
                break;
              case 3:
                f.push(this.Tb(p));
                break;
              case 4:
                f.push(this.getBlob(p));
                break;
              default:
                f.push(null);
            }
            return f;
          };
          c.prototype.qb = function() {
            for (var f = [], l = sc(this.Qa), n = 0; n < l; n += 1) f.push(yc(this.Qa, n));
            return f;
          };
          c.prototype.zb = function(f, l) {
            f = this.get(f, l);
            l = this.qb();
            for (var n = {}, p = 0; p < l.length; p += 1) n[l[p]] = f[p];
            return n;
          };
          c.prototype.Sb = function() {
            return pb(this.Qa);
          };
          c.prototype.Pb = function() {
            return lc(this.Qa);
          };
          c.prototype.run = function(f) {
            null != f && this.bind(f);
            this.step();
            return this.reset();
          };
          c.prototype.wb = function(f, l) {
            null == l && (l = this.Oa, this.Oa += 1);
            f = fa(f);
            this.mb.push(f);
            this.db.handleError(mc(this.Qa, l, f, -1, 0));
          };
          c.prototype.Fb = function(f, l) {
            null == l && (l = this.Oa, this.Oa += 1);
            var n = da(f.length);
            m.set(f, n);
            this.mb.push(n);
            this.db.handleError(rb(this.Qa, l, n, f.length, 0));
          };
          c.prototype.vb = function(f, l) {
            null == l && (l = this.Oa, this.Oa += 1);
            this.db.handleError((f === (f | 0) ? oc : nc)(
              this.Qa,
              l,
              f
            ));
          };
          c.prototype.Ib = function(f) {
            null == f && (f = this.Oa, this.Oa += 1);
            rb(this.Qa, f, 0, 0, 0);
          };
          c.prototype.xb = function(f, l) {
            null == l && (l = this.Oa, this.Oa += 1);
            switch (typeof f) {
              case "string":
                this.wb(f, l);
                return;
              case "number":
                this.vb(f, l);
                return;
              case "bigint":
                this.wb(f.toString(), l);
                return;
              case "boolean":
                this.vb(f + 0, l);
                return;
              case "object":
                if (null === f) {
                  this.Ib(l);
                  return;
                }
                if (null != f.length) {
                  this.Fb(f, l);
                  return;
                }
            }
            throw "Wrong API use : tried to bind a value of an unknown type (" + f + ").";
          };
          c.prototype.Hb = function(f) {
            var l = this;
            Object.keys(f).forEach(function(n) {
              var p = pc(l.Qa, n);
              0 !== p && l.xb(f[n], p);
            });
            return true;
          };
          c.prototype.Gb = function(f) {
            for (var l = 0; l < f.length; l += 1) this.xb(f[l], l + 1);
            return true;
          };
          c.prototype.reset = function() {
            this.freemem();
            return 0 === Ac(this.Qa) && 0 === zc(this.Qa);
          };
          c.prototype.freemem = function() {
            for (var f; void 0 !== (f = this.mb.pop()); ) ea(f);
          };
          c.prototype.Ya = function() {
            this.freemem();
            var f = 0 === Bc(this.Qa);
            delete this.db.gb[this.Qa];
            this.Qa = 0;
            return f;
          };
          d.prototype.next = function() {
            if (null === this.fb) return { done: true };
            null !== this.$a && (this.$a.Ya(), this.$a = null);
            if (!this.db.db) throw this.ob(), Error("Database closed");
            var f = pa(), l = y(4);
            qa(g);
            qa(l);
            try {
              this.db.handleError(qb(this.db.db, this.lb, -1, g, l));
              this.lb = r(l, "i32");
              var n = r(g, "i32");
              if (0 === n) return this.ob(), { done: true };
              this.$a = new c(n, this.db);
              this.db.gb[n] = this.$a;
              return { value: this.$a, done: false };
            } catch (p) {
              throw this.sb = z(this.lb), this.ob(), p;
            } finally {
              ra(f);
            }
          };
          d.prototype.ob = function() {
            ea(this.fb);
            this.fb = null;
          };
          d.prototype.Qb = function() {
            return null !== this.sb ? this.sb : z(this.lb);
          };
          "function" === typeof Symbol && "symbol" === typeof Symbol.iterator && (d.prototype[Symbol.iterator] = function() {
            return this;
          });
          e.prototype.run = function(f, l) {
            if (!this.db) throw "Database closed";
            if (l) {
              f = this.tb(f, l);
              try {
                f.step();
              } finally {
                f.Ya();
              }
            } else this.handleError(t(this.db, f, 0, 0, g));
            return this;
          };
          e.prototype.exec = function(f, l, n) {
            if (!this.db) throw "Database closed";
            var p = null, u = null, v = null;
            try {
              v = u = fa(f);
              var K = y(4);
              for (f = []; 0 !== r(v, "i8"); ) {
                qa(g);
                qa(K);
                this.handleError(qb(this.db, v, -1, g, K));
                var I = r(
                  g,
                  "i32"
                );
                v = r(K, "i32");
                if (0 !== I) {
                  var H = null;
                  p = new c(I, this);
                  for (null != l && p.bind(l); p.step(); ) null === H && (H = { columns: p.qb(), values: [] }, f.push(H)), H.values.push(p.get(null, n));
                  p.Ya();
                }
              }
              return f;
            } catch (L) {
              throw p && p.Ya(), L;
            } finally {
              u && ea(u);
            }
          };
          e.prototype.Mb = function(f, l, n, p, u) {
            "function" === typeof l && (p = n, n = l, l = void 0);
            f = this.tb(f, l);
            try {
              for (; f.step(); ) n(f.zb(null, u));
            } finally {
              f.Ya();
            }
            if ("function" === typeof p) return p();
          };
          e.prototype.tb = function(f, l) {
            qa(g);
            this.handleError(D(this.db, f, -1, g, 0));
            f = r(g, "i32");
            if (0 === f) throw "Nothing to prepare";
            var n = new c(f, this);
            null != l && n.bind(l);
            return this.gb[f] = n;
          };
          e.prototype.Ub = function(f) {
            return new d(f, this);
          };
          e.prototype.Nb = function() {
            Object.values(this.gb).forEach(function(l) {
              l.Ya();
            });
            Object.values(this.Sa).forEach(A);
            this.Sa = {};
            this.handleError(w(this.db));
            var f = ta(this.filename);
            this.handleError(q(this.filename, g));
            this.db = r(g, "i32");
            ob(this.db);
            return f;
          };
          e.prototype.close = function() {
            null !== this.db && (Object.values(this.gb).forEach(function(f) {
              f.Ya();
            }), Object.values(this.Sa).forEach(A), this.Sa = {}, this.Za && (A(this.Za), this.Za = void 0), this.handleError(w(this.db)), ua("/" + this.filename), this.db = null);
          };
          e.prototype.handleError = function(f) {
            if (0 === f) return null;
            f = rc(this.db);
            throw Error(f);
          };
          e.prototype.Rb = function() {
            return x(this.db);
          };
          e.prototype.Kb = function(f, l) {
            Object.prototype.hasOwnProperty.call(this.Sa, f) && (A(this.Sa[f]), delete this.Sa[f]);
            var n = va(function(p, u, v) {
              u = b(u, v);
              try {
                var K = l.apply(null, u);
              } catch (I) {
                sa(p, I, -1);
                return;
              }
              a(p, K);
            }, "viii");
            this.Sa[f] = n;
            this.handleError(tb(
              this.db,
              f,
              l.length,
              1,
              0,
              n,
              0,
              0,
              0
            ));
            return this;
          };
          e.prototype.Jb = function(f, l) {
            var n = l.init || function() {
              return null;
            }, p = l.finalize || function(H) {
              return H;
            }, u = l.step;
            if (!u) throw "An aggregate function must have a step function in " + f;
            var v = {};
            Object.hasOwnProperty.call(this.Sa, f) && (A(this.Sa[f]), delete this.Sa[f]);
            l = f + "__finalize";
            Object.hasOwnProperty.call(this.Sa, l) && (A(this.Sa[l]), delete this.Sa[l]);
            var K = va(function(H, L, Pa) {
              var V = ub(H, 1);
              Object.hasOwnProperty.call(v, V) || (v[V] = n());
              L = b(L, Pa);
              L = [v[V]].concat(L);
              try {
                v[V] = u.apply(null, L);
              } catch (Dc) {
                delete v[V], sa(H, Dc, -1);
              }
            }, "viii"), I = va(function(H) {
              var L = ub(H, 1);
              try {
                var Pa = p(v[L]);
              } catch (V) {
                delete v[L];
                sa(H, V, -1);
                return;
              }
              a(H, Pa);
              delete v[L];
            }, "vi");
            this.Sa[f] = K;
            this.Sa[l] = I;
            this.handleError(tb(this.db, f, u.length - 1, 1, 0, 0, K, I, 0));
            return this;
          };
          e.prototype.Zb = function(f) {
            this.Za && (vb(this.db, 0, 0), A(this.Za), this.Za = void 0);
            if (!f) return this;
            this.Za = va(function(l, n, p, u, v) {
              switch (n) {
                case 18:
                  l = "insert";
                  break;
                case 23:
                  l = "update";
                  break;
                case 9:
                  l = "delete";
                  break;
                default:
                  throw "unknown operationCode in updateHook callback: " + n;
              }
              p = z(p);
              u = z(u);
              if (v > Number.MAX_SAFE_INTEGER) throw "rowId too big to fit inside a Number";
              f(l, p, u, Number(v));
            }, "viiiij");
            vb(this.db, this.Za, 0);
            return this;
          };
          c.prototype.bind = c.prototype.bind;
          c.prototype.step = c.prototype.step;
          c.prototype.get = c.prototype.get;
          c.prototype.getColumnNames = c.prototype.qb;
          c.prototype.getAsObject = c.prototype.zb;
          c.prototype.getSQL = c.prototype.Sb;
          c.prototype.getNormalizedSQL = c.prototype.Pb;
          c.prototype.run = c.prototype.run;
          c.prototype.reset = c.prototype.reset;
          c.prototype.freemem = c.prototype.freemem;
          c.prototype.free = c.prototype.Ya;
          d.prototype.next = d.prototype.next;
          d.prototype.getRemainingSQL = d.prototype.Qb;
          e.prototype.run = e.prototype.run;
          e.prototype.exec = e.prototype.exec;
          e.prototype.each = e.prototype.Mb;
          e.prototype.prepare = e.prototype.tb;
          e.prototype.iterateStatements = e.prototype.Ub;
          e.prototype["export"] = e.prototype.Nb;
          e.prototype.close = e.prototype.close;
          e.prototype.handleError = e.prototype.handleError;
          e.prototype.getRowsModified = e.prototype.Rb;
          e.prototype.create_function = e.prototype.Kb;
          e.prototype.create_aggregate = e.prototype.Jb;
          e.prototype.updateHook = e.prototype.Zb;
          k.Database = e;
        };
        var wa = "./this.program", xa = (a, b) => {
          throw b;
        }, ya = globalThis.document?.currentScript?.src;
        "undefined" != typeof __filename ? ya = __filename : ba && (ya = self.location.href);
        var za = "", Aa, Ba;
        if (ca) {
          var fs9 = require("node:fs");
          za = __dirname + "/";
          Ba = (a) => {
            a = Ca(a) ? new URL(a) : a;
            return fs9.readFileSync(a);
          };
          Aa = async (a) => {
            a = Ca(a) ? new URL(a) : a;
            return fs9.readFileSync(a, void 0);
          };
          1 < process.argv.length && (wa = process.argv[1].replace(/\\/g, "/"));
          process.argv.slice(2);
          "undefined" != typeof module2 && (module2.exports = k);
          xa = (a, b) => {
            process.exitCode = a;
            throw b;
          };
        } else if (aa || ba) {
          try {
            za = new URL(".", ya).href;
          } catch {
          }
          ba && (Ba = (a) => {
            var b = new XMLHttpRequest();
            b.open("GET", a, false);
            b.responseType = "arraybuffer";
            b.send(null);
            return new Uint8Array(b.response);
          });
          Aa = async (a) => {
            if (Ca(a)) return new Promise((c, d) => {
              var e = new XMLHttpRequest();
              e.open("GET", a, true);
              e.responseType = "arraybuffer";
              e.onload = () => {
                200 == e.status || 0 == e.status && e.response ? c(e.response) : d(e.status);
              };
              e.onerror = d;
              e.send(null);
            });
            var b = await fetch(a, { credentials: "same-origin" });
            if (b.ok) return b.arrayBuffer();
            throw Error(b.status + " : " + b.url);
          };
        }
        var Da = console.log.bind(console), B = console.error.bind(console), Ea, Fa = false, Ga, Ca = (a) => a.startsWith("file://"), m, C, Ha, E, F, Ia, Ja, G;
        function Ka() {
          var a = La.buffer;
          m = new Int8Array(a);
          Ha = new Int16Array(a);
          C = new Uint8Array(a);
          new Uint16Array(a);
          E = new Int32Array(a);
          F = new Uint32Array(a);
          Ia = new Float32Array(a);
          Ja = new Float64Array(a);
          G = new BigInt64Array(a);
          new BigUint64Array(a);
        }
        function Ma(a) {
          k.onAbort?.(a);
          a = "Aborted(" + a + ")";
          B(a);
          Fa = true;
          throw new WebAssembly.RuntimeError(a + ". Build with -sASSERTIONS for more info.");
        }
        var Na;
        async function Oa(a) {
          if (!Ea) try {
            var b = await Aa(a);
            return new Uint8Array(b);
          } catch {
          }
          if (a == Na && Ea) a = new Uint8Array(Ea);
          else if (Ba) a = Ba(a);
          else throw "both async and sync fetching of the wasm failed";
          return a;
        }
        async function Qa(a, b) {
          try {
            var c = await Oa(a);
            return await WebAssembly.instantiate(c, b);
          } catch (d) {
            B(`failed to asynchronously prepare wasm: ${d}`), Ma(d);
          }
        }
        async function Ra(a) {
          var b = Na;
          if (!Ea && !Ca(b) && !ca) try {
            var c = fetch(b, { credentials: "same-origin" });
            return await WebAssembly.instantiateStreaming(c, a);
          } catch (d) {
            B(`wasm streaming compile failed: ${d}`), B("falling back to ArrayBuffer instantiation");
          }
          return Qa(b, a);
        }
        class Sa {
          name = "ExitStatus";
          constructor(a) {
            this.message = `Program terminated with exit(${a})`;
            this.status = a;
          }
        }
        var Ta = (a) => {
          for (; 0 < a.length; ) a.shift()(k);
        }, Ua = [], Va = [], Wa = () => {
          var a = k.preRun.shift();
          Va.push(a);
        }, J = 0, Xa = null;
        function r(a, b = "i8") {
          b.endsWith("*") && (b = "*");
          switch (b) {
            case "i1":
              return m[a];
            case "i8":
              return m[a];
            case "i16":
              return Ha[a >> 1];
            case "i32":
              return E[a >> 2];
            case "i64":
              return G[a >> 3];
            case "float":
              return Ia[a >> 2];
            case "double":
              return Ja[a >> 3];
            case "*":
              return F[a >> 2];
            default:
              Ma(`invalid type for getValue: ${b}`);
          }
        }
        var Ya = true;
        function qa(a) {
          var b = "i32";
          b.endsWith("*") && (b = "*");
          switch (b) {
            case "i1":
              m[a] = 0;
              break;
            case "i8":
              m[a] = 0;
              break;
            case "i16":
              Ha[a >> 1] = 0;
              break;
            case "i32":
              E[a >> 2] = 0;
              break;
            case "i64":
              G[a >> 3] = BigInt(0);
              break;
            case "float":
              Ia[a >> 2] = 0;
              break;
            case "double":
              Ja[a >> 3] = 0;
              break;
            case "*":
              F[a >> 2] = 0;
              break;
            default:
              Ma(`invalid type for setValue: ${b}`);
          }
        }
        var Za = new TextDecoder(), $a = (a, b, c, d) => {
          c = b + c;
          if (d) return c;
          for (; a[b] && !(b >= c); ) ++b;
          return b;
        }, z = (a, b, c) => a ? Za.decode(C.subarray(a, $a(C, a, b, c))) : "", ab = (a, b) => {
          for (var c = 0, d = a.length - 1; 0 <= d; d--) {
            var e = a[d];
            "." === e ? a.splice(d, 1) : ".." === e ? (a.splice(d, 1), c++) : c && (a.splice(d, 1), c--);
          }
          if (b) for (; c; c--) a.unshift("..");
          return a;
        }, ia = (a) => {
          var b = "/" === a.charAt(0), c = "/" === a.slice(-1);
          (a = ab(a.split("/").filter((d) => !!d), !b).join("/")) || b || (a = ".");
          a && c && (a += "/");
          return (b ? "/" : "") + a;
        }, bb = (a) => {
          var b = /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/.exec(a).slice(1);
          a = b[0];
          b = b[1];
          if (!a && !b) return ".";
          b &&= b.slice(0, -1);
          return a + b;
        }, cb = (a) => a && a.match(/([^\/]+|\/)\/*$/)[1], db = () => {
          if (ca) {
            var a = require("node:crypto");
            return (b) => a.randomFillSync(b);
          }
          return (b) => crypto.getRandomValues(b);
        }, eb = (a) => {
          (eb = db())(a);
        }, fb = (...a) => {
          for (var b = "", c = false, d = a.length - 1; -1 <= d && !c; d--) {
            c = 0 <= d ? a[d] : "/";
            if ("string" != typeof c) throw new TypeError("Arguments to path.resolve must be strings");
            if (!c) return "";
            b = c + "/" + b;
            c = "/" === c.charAt(0);
          }
          b = ab(b.split("/").filter((e) => !!e), !c).join("/");
          return (c ? "/" : "") + b || ".";
        }, gb = (a) => {
          var b = $a(a, 0);
          return Za.decode(a.buffer ? a.subarray(0, b) : new Uint8Array(a.slice(0, b)));
        }, hb = [], ib = (a) => {
          for (var b = 0, c = 0; c < a.length; ++c) {
            var d = a.charCodeAt(c);
            127 >= d ? b++ : 2047 >= d ? b += 2 : 55296 <= d && 57343 >= d ? (b += 4, ++c) : b += 3;
          }
          return b;
        }, M = (a, b, c, d) => {
          if (!(0 < d)) return 0;
          var e = c;
          d = c + d - 1;
          for (var g = 0; g < a.length; ++g) {
            var h = a.codePointAt(g);
            if (127 >= h) {
              if (c >= d) break;
              b[c++] = h;
            } else if (2047 >= h) {
              if (c + 1 >= d) break;
              b[c++] = 192 | h >> 6;
              b[c++] = 128 | h & 63;
            } else if (65535 >= h) {
              if (c + 2 >= d) break;
              b[c++] = 224 | h >> 12;
              b[c++] = 128 | h >> 6 & 63;
              b[c++] = 128 | h & 63;
            } else {
              if (c + 3 >= d) break;
              b[c++] = 240 | h >> 18;
              b[c++] = 128 | h >> 12 & 63;
              b[c++] = 128 | h >> 6 & 63;
              b[c++] = 128 | h & 63;
              g++;
            }
          }
          b[c] = 0;
          return c - e;
        }, jb = [];
        function kb(a, b) {
          jb[a] = { input: [], output: [], eb: b };
          mb(a, nb);
        }
        var nb = { open(a) {
          var b = jb[a.node.rdev];
          if (!b) throw new N(43);
          a.tty = b;
          a.seekable = false;
        }, close(a) {
          a.tty.eb.fsync(a.tty);
        }, fsync(a) {
          a.tty.eb.fsync(a.tty);
        }, read(a, b, c, d) {
          if (!a.tty || !a.tty.eb.Bb) throw new N(60);
          for (var e = 0, g = 0; g < d; g++) {
            try {
              var h = a.tty.eb.Bb(a.tty);
            } catch (q) {
              throw new N(29);
            }
            if (void 0 === h && 0 === e) throw new N(6);
            if (null === h || void 0 === h) break;
            e++;
            b[c + g] = h;
          }
          e && (a.node.atime = Date.now());
          return e;
        }, write(a, b, c, d) {
          if (!a.tty || !a.tty.eb.ub) throw new N(60);
          try {
            for (var e = 0; e < d; e++) a.tty.eb.ub(a.tty, b[c + e]);
          } catch (g) {
            throw new N(29);
          }
          d && (a.node.mtime = a.node.ctime = Date.now());
          return e;
        } }, wb = { Bb() {
          a: {
            if (!hb.length) {
              var a = null;
              if (ca) {
                var b = Buffer.alloc(256), c = 0, d = process.stdin.fd;
                try {
                  c = fs9.readSync(d, b, 0, 256);
                } catch (e) {
                  if (e.toString().includes("EOF")) c = 0;
                  else throw e;
                }
                0 < c && (a = b.slice(0, c).toString("utf-8"));
              } else globalThis.window?.prompt && (a = window.prompt("Input: "), null !== a && (a += "\n"));
              if (!a) {
                a = null;
                break a;
              }
              b = Array(ib(a) + 1);
              a = M(a, b, 0, b.length);
              b.length = a;
              hb = b;
            }
            a = hb.shift();
          }
          return a;
        }, ub(a, b) {
          null === b || 10 === b ? (Da(gb(a.output)), a.output = []) : 0 != b && a.output.push(b);
        }, fsync(a) {
          0 < a.output?.length && (Da(gb(a.output)), a.output = []);
        }, hc() {
          return { bc: 25856, dc: 5, ac: 191, cc: 35387, $b: [3, 28, 127, 21, 4, 0, 1, 0, 17, 19, 26, 0, 18, 15, 23, 22, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] };
        }, ic() {
          return 0;
        }, jc() {
          return [24, 80];
        } }, xb = { ub(a, b) {
          null === b || 10 === b ? (B(gb(a.output)), a.output = []) : 0 != b && a.output.push(b);
        }, fsync(a) {
          0 < a.output?.length && (B(gb(a.output)), a.output = []);
        } }, O = { Wa: null, Xa() {
          return O.createNode(null, "/", 16895, 0);
        }, createNode(a, b, c, d) {
          if (24576 === (c & 61440) || 4096 === (c & 61440)) throw new N(63);
          O.Wa || (O.Wa = { dir: { node: { Ta: O.La.Ta, Ua: O.La.Ua, lookup: O.La.lookup, ib: O.La.ib, rename: O.La.rename, unlink: O.La.unlink, rmdir: O.La.rmdir, readdir: O.La.readdir, symlink: O.La.symlink }, stream: { Va: O.Ma.Va } }, file: { node: { Ta: O.La.Ta, Ua: O.La.Ua }, stream: { Va: O.Ma.Va, read: O.Ma.read, write: O.Ma.write, jb: O.Ma.jb, kb: O.Ma.kb } }, link: { node: { Ta: O.La.Ta, Ua: O.La.Ua, readlink: O.La.readlink }, stream: {} }, yb: { node: { Ta: O.La.Ta, Ua: O.La.Ua }, stream: yb } });
          c = zb(a, b, c, d);
          P(c.mode) ? (c.La = O.Wa.dir.node, c.Ma = O.Wa.dir.stream, c.Na = {}) : 32768 === (c.mode & 61440) ? (c.La = O.Wa.file.node, c.Ma = O.Wa.file.stream, c.Ra = 0, c.Na = null) : 40960 === (c.mode & 61440) ? (c.La = O.Wa.link.node, c.Ma = O.Wa.link.stream) : 8192 === (c.mode & 61440) && (c.La = O.Wa.yb.node, c.Ma = O.Wa.yb.stream);
          c.atime = c.mtime = c.ctime = Date.now();
          a && (a.Na[b] = c, a.atime = a.mtime = a.ctime = c.atime);
          return c;
        }, fc(a) {
          return a.Na ? a.Na.subarray ? a.Na.subarray(0, a.Ra) : new Uint8Array(a.Na) : new Uint8Array(0);
        }, La: {
          Ta(a) {
            var b = {};
            b.dev = 8192 === (a.mode & 61440) ? a.id : 1;
            b.ino = a.id;
            b.mode = a.mode;
            b.nlink = 1;
            b.uid = 0;
            b.gid = 0;
            b.rdev = a.rdev;
            P(a.mode) ? b.size = 4096 : 32768 === (a.mode & 61440) ? b.size = a.Ra : 40960 === (a.mode & 61440) ? b.size = a.link.length : b.size = 0;
            b.atime = new Date(a.atime);
            b.mtime = new Date(a.mtime);
            b.ctime = new Date(a.ctime);
            b.blksize = 4096;
            b.blocks = Math.ceil(b.size / b.blksize);
            return b;
          },
          Ua(a, b) {
            for (var c of ["mode", "atime", "mtime", "ctime"]) null != b[c] && (a[c] = b[c]);
            void 0 !== b.size && (b = b.size, a.Ra != b && (0 == b ? (a.Na = null, a.Ra = 0) : (c = a.Na, a.Na = new Uint8Array(b), c && a.Na.set(c.subarray(0, Math.min(b, a.Ra))), a.Ra = b)));
          },
          lookup() {
            O.nb || (O.nb = new N(44), O.nb.stack = "<generic error, no stack>");
            throw O.nb;
          },
          ib(a, b, c, d) {
            return O.createNode(a, b, c, d);
          },
          rename(a, b, c) {
            try {
              var d = Q(b, c);
            } catch (g) {
            }
            if (d) {
              if (P(a.mode)) for (var e in d.Na) throw new N(55);
              Ab(d);
            }
            delete a.parent.Na[a.name];
            b.Na[c] = a;
            a.name = c;
            b.ctime = b.mtime = a.parent.ctime = a.parent.mtime = Date.now();
          },
          unlink(a, b) {
            delete a.Na[b];
            a.ctime = a.mtime = Date.now();
          },
          rmdir(a, b) {
            var c = Q(a, b), d;
            for (d in c.Na) throw new N(55);
            delete a.Na[b];
            a.ctime = a.mtime = Date.now();
          },
          readdir(a) {
            return [".", "..", ...Object.keys(a.Na)];
          },
          symlink(a, b, c) {
            a = O.createNode(a, b, 41471, 0);
            a.link = c;
            return a;
          },
          readlink(a) {
            if (40960 !== (a.mode & 61440)) throw new N(28);
            return a.link;
          }
        }, Ma: { read(a, b, c, d, e) {
          var g = a.node.Na;
          if (e >= a.node.Ra) return 0;
          a = Math.min(a.node.Ra - e, d);
          if (8 < a && g.subarray) b.set(g.subarray(e, e + a), c);
          else for (d = 0; d < a; d++) b[c + d] = g[e + d];
          return a;
        }, write(a, b, c, d, e, g) {
          b.buffer === m.buffer && (g = false);
          if (!d) return 0;
          a = a.node;
          a.mtime = a.ctime = Date.now();
          if (b.subarray && (!a.Na || a.Na.subarray)) {
            if (g) return a.Na = b.subarray(c, c + d), a.Ra = d;
            if (0 === a.Ra && 0 === e) return a.Na = b.slice(c, c + d), a.Ra = d;
            if (e + d <= a.Ra) return a.Na.set(b.subarray(c, c + d), e), d;
          }
          g = e + d;
          var h = a.Na ? a.Na.length : 0;
          h >= g || (g = Math.max(g, h * (1048576 > h ? 2 : 1.125) >>> 0), 0 != h && (g = Math.max(g, 256)), h = a.Na, a.Na = new Uint8Array(g), 0 < a.Ra && a.Na.set(h.subarray(0, a.Ra), 0));
          if (a.Na.subarray && b.subarray) a.Na.set(b.subarray(c, c + d), e);
          else for (g = 0; g < d; g++) a.Na[e + g] = b[c + g];
          a.Ra = Math.max(a.Ra, e + d);
          return d;
        }, Va(a, b, c) {
          1 === c ? b += a.position : 2 === c && 32768 === (a.node.mode & 61440) && (b += a.node.Ra);
          if (0 > b) throw new N(28);
          return b;
        }, jb(a, b, c, d, e) {
          if (32768 !== (a.node.mode & 61440)) throw new N(43);
          a = a.node.Na;
          if (e & 2 || !a || a.buffer !== m.buffer) {
            e = true;
            d = 65536 * Math.ceil(b / 65536);
            var g = Bb(65536, d);
            g && C.fill(0, g, g + d);
            d = g;
            if (!d) throw new N(48);
            if (a) {
              if (0 < c || c + b < a.length) a.subarray ? a = a.subarray(c, c + b) : a = Array.prototype.slice.call(a, c, c + b);
              m.set(a, d);
            }
          } else e = false, d = a.byteOffset;
          return { Xb: d, Eb: e };
        }, kb(a, b, c, d) {
          O.Ma.write(a, b, 0, d, c, false);
          return 0;
        } } }, ja = (a, b) => {
          var c = 0;
          a && (c |= 365);
          b && (c |= 146);
          return c;
        }, Cb = null, Db = {}, Eb = [], Fb = 1, R = null, Gb = false, Hb = true, N = class {
          name = "ErrnoError";
          constructor(a) {
            this.Pa = a;
          }
        }, Ib = class {
          hb = {};
          node = null;
          get flags() {
            return this.hb.flags;
          }
          set flags(a) {
            this.hb.flags = a;
          }
          get position() {
            return this.hb.position;
          }
          set position(a) {
            this.hb.position = a;
          }
        }, Jb = class {
          La = {};
          Ma = {};
          bb = null;
          constructor(a, b, c, d) {
            a ||= this;
            this.parent = a;
            this.Xa = a.Xa;
            this.id = Fb++;
            this.name = b;
            this.mode = c;
            this.rdev = d;
            this.atime = this.mtime = this.ctime = Date.now();
          }
          get read() {
            return 365 === (this.mode & 365);
          }
          set read(a) {
            a ? this.mode |= 365 : this.mode &= -366;
          }
          get write() {
            return 146 === (this.mode & 146);
          }
          set write(a) {
            a ? this.mode |= 146 : this.mode &= -147;
          }
        };
        function S(a, b = {}) {
          if (!a) throw new N(44);
          b.pb ?? (b.pb = true);
          "/" === a.charAt(0) || (a = "//" + a);
          var c = 0;
          a: for (; 40 > c; c++) {
            a = a.split("/").filter((q) => !!q);
            for (var d = Cb, e = "/", g = 0; g < a.length; g++) {
              var h = g === a.length - 1;
              if (h && b.parent) break;
              if ("." !== a[g]) if (".." === a[g]) if (e = bb(e), d === d.parent) {
                a = e + "/" + a.slice(g + 1).join("/");
                c--;
                continue a;
              } else d = d.parent;
              else {
                e = ia(e + "/" + a[g]);
                try {
                  d = Q(d, a[g]);
                } catch (q) {
                  if (44 === q?.Pa && h && b.Wb) return { path: e };
                  throw q;
                }
                !d.bb || h && !b.pb || (d = d.bb.root);
                if (40960 === (d.mode & 61440) && (!h || b.ab)) {
                  if (!d.La.readlink) throw new N(52);
                  d = d.La.readlink(d);
                  "/" === d.charAt(0) || (d = bb(e) + "/" + d);
                  a = d + "/" + a.slice(g + 1).join("/");
                  continue a;
                }
              }
            }
            return { path: e, node: d };
          }
          throw new N(32);
        }
        function ha(a) {
          for (var b; ; ) {
            if (a === a.parent) return a = a.Xa.Db, b ? "/" !== a[a.length - 1] ? `${a}/${b}` : a + b : a;
            b = b ? `${a.name}/${b}` : a.name;
            a = a.parent;
          }
        }
        function Kb(a, b) {
          for (var c = 0, d = 0; d < b.length; d++) c = (c << 5) - c + b.charCodeAt(d) | 0;
          return (a + c >>> 0) % R.length;
        }
        function Ab(a) {
          var b = Kb(a.parent.id, a.name);
          if (R[b] === a) R[b] = a.cb;
          else for (b = R[b]; b; ) {
            if (b.cb === a) {
              b.cb = a.cb;
              break;
            }
            b = b.cb;
          }
        }
        function Q(a, b) {
          var c = P(a.mode) ? (c = Lb(a, "x")) ? c : a.La.lookup ? 0 : 2 : 54;
          if (c) throw new N(c);
          for (c = R[Kb(a.id, b)]; c; c = c.cb) {
            var d = c.name;
            if (c.parent.id === a.id && d === b) return c;
          }
          return a.La.lookup(a, b);
        }
        function zb(a, b, c, d) {
          a = new Jb(a, b, c, d);
          b = Kb(a.parent.id, a.name);
          a.cb = R[b];
          return R[b] = a;
        }
        function P(a) {
          return 16384 === (a & 61440);
        }
        function Lb(a, b) {
          return Hb ? 0 : b.includes("r") && !(a.mode & 292) || b.includes("w") && !(a.mode & 146) || b.includes("x") && !(a.mode & 73) ? 2 : 0;
        }
        function Mb(a, b) {
          if (!P(a.mode)) return 54;
          try {
            return Q(a, b), 20;
          } catch (c) {
          }
          return Lb(a, "wx");
        }
        function Nb(a, b, c) {
          try {
            var d = Q(a, b);
          } catch (e) {
            return e.Pa;
          }
          if (a = Lb(a, "wx")) return a;
          if (c) {
            if (!P(d.mode)) return 54;
            if (d === d.parent || "/" === ha(d)) return 10;
          } else if (P(d.mode)) return 31;
          return 0;
        }
        function Ob(a) {
          if (!a) throw new N(63);
          return a;
        }
        function T(a) {
          a = Eb[a];
          if (!a) throw new N(8);
          return a;
        }
        function Pb(a, b = -1) {
          a = Object.assign(new Ib(), a);
          if (-1 == b) a: {
            for (b = 0; 4096 >= b; b++) if (!Eb[b]) break a;
            throw new N(33);
          }
          a.fd = b;
          return Eb[b] = a;
        }
        function Qb(a, b = -1) {
          a = Pb(a, b);
          a.Ma?.ec?.(a);
          return a;
        }
        function Rb(a, b, c) {
          var d = a?.Ma.Ua;
          a = d ? a : b;
          d ??= b.La.Ua;
          Ob(d);
          d(a, c);
        }
        var yb = { open(a) {
          a.Ma = Db[a.node.rdev].Ma;
          a.Ma.open?.(a);
        }, Va() {
          throw new N(70);
        } };
        function mb(a, b) {
          Db[a] = { Ma: b };
        }
        function Sb(a, b) {
          var c = "/" === b;
          if (c && Cb) throw new N(10);
          if (!c && b) {
            var d = S(b, { pb: false });
            b = d.path;
            d = d.node;
            if (d.bb) throw new N(10);
            if (!P(d.mode)) throw new N(54);
          }
          b = { type: a, kc: {}, Db: b, Vb: [] };
          a = a.Xa(b);
          a.Xa = b;
          b.root = a;
          c ? Cb = a : d && (d.bb = b, d.Xa && d.Xa.Vb.push(b));
        }
        function Tb(a, b, c) {
          var d = S(a, { parent: true }).node;
          a = cb(a);
          if (!a) throw new N(28);
          if ("." === a || ".." === a) throw new N(20);
          var e = Mb(d, a);
          if (e) throw new N(e);
          if (!d.La.ib) throw new N(63);
          return d.La.ib(d, a, b, c);
        }
        function ka(a, b = 438) {
          return Tb(a, b & 4095 | 32768, 0);
        }
        function U(a, b = 511) {
          return Tb(a, b & 1023 | 16384, 0);
        }
        function Ub(a, b, c) {
          "undefined" == typeof c && (c = b, b = 438);
          Tb(a, b | 8192, c);
        }
        function Vb(a, b) {
          if (!fb(a)) throw new N(44);
          var c = S(b, { parent: true }).node;
          if (!c) throw new N(44);
          b = cb(b);
          var d = Mb(c, b);
          if (d) throw new N(d);
          if (!c.La.symlink) throw new N(63);
          c.La.symlink(c, b, a);
        }
        function Wb(a) {
          var b = S(a, { parent: true }).node;
          a = cb(a);
          var c = Q(b, a), d = Nb(b, a, true);
          if (d) throw new N(d);
          if (!b.La.rmdir) throw new N(63);
          if (c.bb) throw new N(10);
          b.La.rmdir(b, a);
          Ab(c);
        }
        function ua(a) {
          var b = S(a, { parent: true }).node;
          if (!b) throw new N(44);
          a = cb(a);
          var c = Q(b, a), d = Nb(b, a, false);
          if (d) throw new N(d);
          if (!b.La.unlink) throw new N(63);
          if (c.bb) throw new N(10);
          b.La.unlink(b, a);
          Ab(c);
        }
        function Xb(a, b) {
          a = S(a, { ab: !b }).node;
          return Ob(a.La.Ta)(a);
        }
        function Yb(a, b, c, d) {
          Rb(a, b, { mode: c & 4095 | b.mode & -4096, ctime: Date.now(), Lb: d });
        }
        function la(a, b) {
          a = "string" == typeof a ? S(a, { ab: true }).node : a;
          Yb(null, a, b);
        }
        function Zb(a, b, c) {
          if (P(b.mode)) throw new N(31);
          if (32768 !== (b.mode & 61440)) throw new N(28);
          var d = Lb(b, "w");
          if (d) throw new N(d);
          Rb(a, b, { size: c, timestamp: Date.now() });
        }
        function ma(a, b, c = 438) {
          if ("" === a) throw new N(44);
          if ("string" == typeof b) {
            var d = { r: 0, "r+": 2, w: 577, "w+": 578, a: 1089, "a+": 1090 }[b];
            if ("undefined" == typeof d) throw Error(`Unknown file open mode: ${b}`);
            b = d;
          }
          c = b & 64 ? c & 4095 | 32768 : 0;
          if ("object" == typeof a) d = a;
          else {
            var e = a.endsWith("/");
            var g = S(a, { ab: !(b & 131072), Wb: true });
            d = g.node;
            a = g.path;
          }
          g = false;
          if (b & 64) if (d) {
            if (b & 128) throw new N(20);
          } else {
            if (e) throw new N(31);
            d = Tb(a, c | 511, 0);
            g = true;
          }
          if (!d) throw new N(44);
          8192 === (d.mode & 61440) && (b &= -513);
          if (b & 65536 && !P(d.mode)) throw new N(54);
          if (!g && (d ? 40960 === (d.mode & 61440) ? e = 32 : (e = ["r", "w", "rw"][b & 3], b & 512 && (e += "w"), e = P(d.mode) && ("r" !== e || b & 576) ? 31 : Lb(d, e)) : e = 44, e)) throw new N(e);
          b & 512 && !g && (e = d, e = "string" == typeof e ? S(e, { ab: true }).node : e, Zb(null, e, 0));
          b = Pb({ node: d, path: ha(d), flags: b & -131713, seekable: true, position: 0, Ma: d.Ma, Yb: [], error: false });
          b.Ma.open && b.Ma.open(b);
          g && la(d, c & 511);
          return b;
        }
        function oa(a) {
          if (null === a.fd) throw new N(8);
          a.rb && (a.rb = null);
          try {
            a.Ma.close && a.Ma.close(a);
          } catch (b) {
            throw b;
          } finally {
            Eb[a.fd] = null;
          }
          a.fd = null;
        }
        function $b(a, b, c) {
          if (null === a.fd) throw new N(8);
          if (!a.seekable || !a.Ma.Va) throw new N(70);
          if (0 != c && 1 != c && 2 != c) throw new N(28);
          a.position = a.Ma.Va(a, b, c);
          a.Yb = [];
        }
        function ac(a, b, c, d, e) {
          if (0 > d || 0 > e) throw new N(28);
          if (null === a.fd) throw new N(8);
          if (1 === (a.flags & 2097155)) throw new N(8);
          if (P(a.node.mode)) throw new N(31);
          if (!a.Ma.read) throw new N(28);
          var g = "undefined" != typeof e;
          if (!g) e = a.position;
          else if (!a.seekable) throw new N(70);
          b = a.Ma.read(a, b, c, d, e);
          g || (a.position += b);
          return b;
        }
        function na(a, b, c, d, e) {
          if (0 > d || 0 > e) throw new N(28);
          if (null === a.fd) throw new N(8);
          if (0 === (a.flags & 2097155)) throw new N(8);
          if (P(a.node.mode)) throw new N(31);
          if (!a.Ma.write) throw new N(28);
          a.seekable && a.flags & 1024 && $b(a, 0, 2);
          var g = "undefined" != typeof e;
          if (!g) e = a.position;
          else if (!a.seekable) throw new N(70);
          b = a.Ma.write(a, b, c, d, e, void 0);
          g || (a.position += b);
          return b;
        }
        function ta(a) {
          var b = b || 0;
          var c = "binary";
          "utf8" !== c && "binary" !== c && Ma(`Invalid encoding type "${c}"`);
          b = ma(a, b);
          a = Xb(a).size;
          var d = new Uint8Array(a);
          ac(b, d, 0, a, 0);
          "utf8" === c && (d = gb(d));
          oa(b);
          return d;
        }
        function W(a, b, c) {
          a = ia("/dev/" + a);
          var d = ja(!!b, !!c);
          W.Cb ?? (W.Cb = 64);
          var e = W.Cb++ << 8 | 0;
          mb(e, { open(g) {
            g.seekable = false;
          }, close() {
            c?.buffer?.length && c(10);
          }, read(g, h, q, w) {
            for (var t = 0, x = 0; x < w; x++) {
              try {
                var D = b();
              } catch (pb) {
                throw new N(29);
              }
              if (void 0 === D && 0 === t) throw new N(6);
              if (null === D || void 0 === D) break;
              t++;
              h[q + x] = D;
            }
            t && (g.node.atime = Date.now());
            return t;
          }, write(g, h, q, w) {
            for (var t = 0; t < w; t++) try {
              c(h[q + t]);
            } catch (x) {
              throw new N(29);
            }
            w && (g.node.mtime = g.node.ctime = Date.now());
            return t;
          } });
          Ub(a, d, e);
        }
        var X = {};
        function Y(a, b, c) {
          if ("/" === b.charAt(0)) return b;
          a = -100 === a ? "/" : T(a).path;
          if (0 == b.length) {
            if (!c) throw new N(44);
            return a;
          }
          return a + "/" + b;
        }
        function kc(a, b) {
          F[a >> 2] = b.dev;
          F[a + 4 >> 2] = b.mode;
          F[a + 8 >> 2] = b.nlink;
          F[a + 12 >> 2] = b.uid;
          F[a + 16 >> 2] = b.gid;
          F[a + 20 >> 2] = b.rdev;
          G[a + 24 >> 3] = BigInt(b.size);
          E[a + 32 >> 2] = 4096;
          E[a + 36 >> 2] = b.blocks;
          var c = b.atime.getTime(), d = b.mtime.getTime(), e = b.ctime.getTime();
          G[a + 40 >> 3] = BigInt(Math.floor(c / 1e3));
          F[a + 48 >> 2] = c % 1e3 * 1e6;
          G[a + 56 >> 3] = BigInt(Math.floor(d / 1e3));
          F[a + 64 >> 2] = d % 1e3 * 1e6;
          G[a + 72 >> 3] = BigInt(Math.floor(e / 1e3));
          F[a + 80 >> 2] = e % 1e3 * 1e6;
          G[a + 88 >> 3] = BigInt(b.ino);
          return 0;
        }
        var Cc = void 0, Ec = () => {
          var a = E[+Cc >> 2];
          Cc += 4;
          return a;
        }, Fc = 0, Gc = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335], Hc = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334], Ic = {}, Jc = (a) => {
          Ga = a;
          Ya || 0 < Fc || (k.onExit?.(a), Fa = true);
          xa(a, new Sa(a));
        }, Kc = (a) => {
          if (!Fa) try {
            a();
          } catch (b) {
            b instanceof Sa || "unwind" == b || xa(1, b);
          } finally {
            if (!(Ya || 0 < Fc)) try {
              Ga = a = Ga, Jc(a);
            } catch (b) {
              b instanceof Sa || "unwind" == b || xa(1, b);
            }
          }
        }, Lc = {}, Nc = () => {
          if (!Mc) {
            var a = { USER: "web_user", LOGNAME: "web_user", PATH: "/", PWD: "/", HOME: "/home/web_user", LANG: (globalThis.navigator?.language ?? "C").replace("-", "_") + ".UTF-8", _: wa || "./this.program" }, b;
            for (b in Lc) void 0 === Lc[b] ? delete a[b] : a[b] = Lc[b];
            var c = [];
            for (b in a) c.push(`${b}=${a[b]}`);
            Mc = c;
          }
          return Mc;
        }, Mc, Oc = (a, b, c, d) => {
          var e = { string: (t) => {
            var x = 0;
            if (null !== t && void 0 !== t && 0 !== t) {
              x = ib(t) + 1;
              var D = y(x);
              M(t, C, D, x);
              x = D;
            }
            return x;
          }, array: (t) => {
            var x = y(t.length);
            m.set(t, x);
            return x;
          } };
          a = k["_" + a];
          var g = [], h = 0;
          if (d) for (var q = 0; q < d.length; q++) {
            var w = e[c[q]];
            w ? (0 === h && (h = pa()), g[q] = w(d[q])) : g[q] = d[q];
          }
          c = a(...g);
          return c = (function(t) {
            0 !== h && ra(h);
            return "string" === b ? z(t) : "boolean" === b ? !!t : t;
          })(c);
        }, fa = (a) => {
          var b = ib(a) + 1, c = da(b);
          c && M(a, C, c, b);
          return c;
        }, Pc, Qc = [], A = (a) => {
          Pc.delete(Z.get(a));
          Z.set(a, null);
          Qc.push(a);
        }, Rc = (a) => {
          const b = a.length;
          return [b % 128 | 128, b >> 7, ...a];
        }, Sc = { i: 127, p: 127, j: 126, f: 125, d: 124, e: 111 }, Tc = (a) => Rc(Array.from(a, (b) => Sc[b])), va = (a, b) => {
          if (!Pc) {
            Pc = /* @__PURE__ */ new WeakMap();
            var c = Z.length;
            if (Pc) for (var d = 0; d < 0 + c; d++) {
              var e = Z.get(d);
              e && Pc.set(e, d);
            }
          }
          if (c = Pc.get(a) || 0) return c;
          c = Qc.length ? Qc.pop() : Z.grow(1);
          try {
            Z.set(c, a);
          } catch (g) {
            if (!(g instanceof TypeError)) throw g;
            b = Uint8Array.of(0, 97, 115, 109, 1, 0, 0, 0, 1, ...Rc([1, 96, ...Tc(b.slice(1)), ...Tc("v" === b[0] ? "" : b[0])]), 2, 7, 1, 1, 101, 1, 102, 0, 0, 7, 5, 1, 1, 102, 0, 0);
            b = new WebAssembly.Module(b);
            b = new WebAssembly.Instance(b, { e: { f: a } }).exports.f;
            Z.set(c, b);
          }
          Pc.set(a, c);
          return c;
        };
        R = Array(4096);
        Sb(O, "/");
        U("/tmp");
        U("/home");
        U("/home/web_user");
        (function() {
          U("/dev");
          mb(259, { read: () => 0, write: (d, e, g, h) => h, Va: () => 0 });
          Ub("/dev/null", 259);
          kb(1280, wb);
          kb(1536, xb);
          Ub("/dev/tty", 1280);
          Ub("/dev/tty1", 1536);
          var a = new Uint8Array(1024), b = 0, c = () => {
            0 === b && (eb(a), b = a.byteLength);
            return a[--b];
          };
          W("random", c);
          W("urandom", c);
          U("/dev/shm");
          U("/dev/shm/tmp");
        })();
        (function() {
          U("/proc");
          var a = U("/proc/self");
          U("/proc/self/fd");
          Sb({ Xa() {
            var b = zb(a, "fd", 16895, 73);
            b.Ma = { Va: O.Ma.Va };
            b.La = { lookup(c, d) {
              c = +d;
              var e = T(c);
              c = { parent: null, Xa: { Db: "fake" }, La: { readlink: () => e.path }, id: c + 1 };
              return c.parent = c;
            }, readdir() {
              return Array.from(Eb.entries()).filter(([, c]) => c).map(([c]) => c.toString());
            } };
            return b;
          } }, "/proc/self/fd");
        })();
        k.noExitRuntime && (Ya = k.noExitRuntime);
        k.print && (Da = k.print);
        k.printErr && (B = k.printErr);
        k.wasmBinary && (Ea = k.wasmBinary);
        k.thisProgram && (wa = k.thisProgram);
        if (k.preInit) for ("function" == typeof k.preInit && (k.preInit = [k.preInit]); 0 < k.preInit.length; ) k.preInit.shift()();
        k.stackSave = () => pa();
        k.stackRestore = (a) => ra(a);
        k.stackAlloc = (a) => y(a);
        k.cwrap = (a, b, c, d) => {
          var e = !c || c.every((g) => "number" === g || "boolean" === g);
          return "string" !== b && e && !d ? k["_" + a] : (...g) => Oc(a, b, c, g);
        };
        k.addFunction = va;
        k.removeFunction = A;
        k.UTF8ToString = z;
        k.stringToNewUTF8 = fa;
        k.writeArrayToMemory = (a, b) => {
          m.set(a, b);
        };
        var da, ea, Bb, Uc, ra, y, pa, La, Z, Vc = {
          a: (a, b, c, d) => Ma(`Assertion failed: ${z(a)}, at: ` + [b ? z(b) : "unknown filename", c, d ? z(d) : "unknown function"]),
          i: function(a, b) {
            try {
              return a = z(a), la(a, b), 0;
            } catch (c) {
              if ("undefined" == typeof X || "ErrnoError" !== c.name) throw c;
              return -c.Pa;
            }
          },
          L: function(a, b, c) {
            try {
              b = z(b);
              b = Y(a, b);
              if (c & -8) return -28;
              var d = S(b, { ab: true }).node;
              if (!d) return -44;
              a = "";
              c & 4 && (a += "r");
              c & 2 && (a += "w");
              c & 1 && (a += "x");
              return a && Lb(d, a) ? -2 : 0;
            } catch (e) {
              if ("undefined" == typeof X || "ErrnoError" !== e.name) throw e;
              return -e.Pa;
            }
          },
          j: function(a, b) {
            try {
              var c = T(a);
              Yb(c, c.node, b, false);
              return 0;
            } catch (d) {
              if ("undefined" == typeof X || "ErrnoError" !== d.name) throw d;
              return -d.Pa;
            }
          },
          h: function(a) {
            try {
              var b = T(a);
              Rb(b, b.node, { timestamp: Date.now(), Lb: false });
              return 0;
            } catch (c) {
              if ("undefined" == typeof X || "ErrnoError" !== c.name) throw c;
              return -c.Pa;
            }
          },
          b: function(a, b, c) {
            Cc = c;
            try {
              var d = T(a);
              switch (b) {
                case 0:
                  var e = Ec();
                  if (0 > e) break;
                  for (; Eb[e]; ) e++;
                  return Qb(d, e).fd;
                case 1:
                case 2:
                  return 0;
                case 3:
                  return d.flags;
                case 4:
                  return e = Ec(), d.flags |= e, 0;
                case 12:
                  return e = Ec(), Ha[e + 0 >> 1] = 2, 0;
                case 13:
                case 14:
                  return 0;
              }
              return -28;
            } catch (g) {
              if ("undefined" == typeof X || "ErrnoError" !== g.name) throw g;
              return -g.Pa;
            }
          },
          g: function(a, b) {
            try {
              var c = T(a), d = c.node, e = c.Ma.Ta;
              a = e ? c : d;
              e ??= d.La.Ta;
              Ob(e);
              var g = e(a);
              return kc(b, g);
            } catch (h) {
              if ("undefined" == typeof X || "ErrnoError" !== h.name) throw h;
              return -h.Pa;
            }
          },
          H: function(a, b) {
            b = -9007199254740992 > b || 9007199254740992 < b ? NaN : Number(b);
            try {
              if (isNaN(b)) return -61;
              var c = T(a);
              if (0 > b || 0 === (c.flags & 2097155)) throw new N(28);
              Zb(c, c.node, b);
              return 0;
            } catch (d) {
              if ("undefined" == typeof X || "ErrnoError" !== d.name) throw d;
              return -d.Pa;
            }
          },
          G: function(a, b) {
            try {
              if (0 === b) return -28;
              var c = ib("/") + 1;
              if (b < c) return -68;
              M("/", C, a, b);
              return c;
            } catch (d) {
              if ("undefined" == typeof X || "ErrnoError" !== d.name) throw d;
              return -d.Pa;
            }
          },
          K: function(a, b) {
            try {
              return a = z(a), kc(b, Xb(a, true));
            } catch (c) {
              if ("undefined" == typeof X || "ErrnoError" !== c.name) throw c;
              return -c.Pa;
            }
          },
          C: function(a, b, c) {
            try {
              return b = z(b), b = Y(a, b), U(b, c), 0;
            } catch (d) {
              if ("undefined" == typeof X || "ErrnoError" !== d.name) throw d;
              return -d.Pa;
            }
          },
          J: function(a, b, c, d) {
            try {
              b = z(b);
              var e = d & 256;
              b = Y(a, b, d & 4096);
              return kc(c, e ? Xb(b, true) : Xb(b));
            } catch (g) {
              if ("undefined" == typeof X || "ErrnoError" !== g.name) throw g;
              return -g.Pa;
            }
          },
          x: function(a, b, c, d) {
            Cc = d;
            try {
              b = z(b);
              b = Y(a, b);
              var e = d ? Ec() : 0;
              return ma(b, c, e).fd;
            } catch (g) {
              if ("undefined" == typeof X || "ErrnoError" !== g.name) throw g;
              return -g.Pa;
            }
          },
          v: function(a, b, c, d) {
            try {
              b = z(b);
              b = Y(a, b);
              if (0 >= d) return -28;
              var e = S(b).node;
              if (!e) throw new N(44);
              if (!e.La.readlink) throw new N(28);
              var g = e.La.readlink(e);
              var h = Math.min(d, ib(g)), q = m[c + h];
              M(
                g,
                C,
                c,
                d + 1
              );
              m[c + h] = q;
              return h;
            } catch (w) {
              if ("undefined" == typeof X || "ErrnoError" !== w.name) throw w;
              return -w.Pa;
            }
          },
          u: function(a) {
            try {
              return a = z(a), Wb(a), 0;
            } catch (b) {
              if ("undefined" == typeof X || "ErrnoError" !== b.name) throw b;
              return -b.Pa;
            }
          },
          f: function(a, b) {
            try {
              return a = z(a), kc(b, Xb(a));
            } catch (c) {
              if ("undefined" == typeof X || "ErrnoError" !== c.name) throw c;
              return -c.Pa;
            }
          },
          r: function(a, b, c) {
            try {
              b = z(b);
              b = Y(a, b);
              if (c) if (512 === c) Wb(b);
              else return -28;
              else ua(b);
              return 0;
            } catch (d) {
              if ("undefined" == typeof X || "ErrnoError" !== d.name) throw d;
              return -d.Pa;
            }
          },
          q: function(a, b, c) {
            try {
              b = z(b);
              b = Y(a, b, true);
              var d = Date.now(), e, g;
              if (c) {
                var h = F[c >> 2] + 4294967296 * E[c + 4 >> 2], q = E[c + 8 >> 2];
                1073741823 == q ? e = d : 1073741822 == q ? e = null : e = 1e3 * h + q / 1e6;
                c += 16;
                h = F[c >> 2] + 4294967296 * E[c + 4 >> 2];
                q = E[c + 8 >> 2];
                1073741823 == q ? g = d : 1073741822 == q ? g = null : g = 1e3 * h + q / 1e6;
              } else g = e = d;
              if (null !== (g ?? e)) {
                a = e;
                var w = S(b, { ab: true }).node;
                Ob(w.La.Ua)(w, { atime: a, mtime: g });
              }
              return 0;
            } catch (t) {
              if ("undefined" == typeof X || "ErrnoError" !== t.name) throw t;
              return -t.Pa;
            }
          },
          m: () => Ma(""),
          l: () => {
            Ya = false;
            Fc = 0;
          },
          A: function(a, b) {
            a = -9007199254740992 > a || 9007199254740992 < a ? NaN : Number(a);
            a = new Date(1e3 * a);
            E[b >> 2] = a.getSeconds();
            E[b + 4 >> 2] = a.getMinutes();
            E[b + 8 >> 2] = a.getHours();
            E[b + 12 >> 2] = a.getDate();
            E[b + 16 >> 2] = a.getMonth();
            E[b + 20 >> 2] = a.getFullYear() - 1900;
            E[b + 24 >> 2] = a.getDay();
            var c = a.getFullYear();
            E[b + 28 >> 2] = (0 !== c % 4 || 0 === c % 100 && 0 !== c % 400 ? Hc : Gc)[a.getMonth()] + a.getDate() - 1 | 0;
            E[b + 36 >> 2] = -(60 * a.getTimezoneOffset());
            c = new Date(a.getFullYear(), 6, 1).getTimezoneOffset();
            var d = new Date(a.getFullYear(), 0, 1).getTimezoneOffset();
            E[b + 32 >> 2] = (c != d && a.getTimezoneOffset() == Math.min(d, c)) | 0;
          },
          y: function(a, b, c, d, e, g, h) {
            e = -9007199254740992 > e || 9007199254740992 < e ? NaN : Number(e);
            try {
              var q = T(d);
              if (0 !== (b & 2) && 0 === (c & 2) && 2 !== (q.flags & 2097155)) throw new N(2);
              if (1 === (q.flags & 2097155)) throw new N(2);
              if (!q.Ma.jb) throw new N(43);
              if (!a) throw new N(28);
              var w = q.Ma.jb(q, a, e, b, c);
              var t = w.Xb;
              E[g >> 2] = w.Eb;
              F[h >> 2] = t;
              return 0;
            } catch (x) {
              if ("undefined" == typeof X || "ErrnoError" !== x.name) throw x;
              return -x.Pa;
            }
          },
          z: function(a, b, c, d, e, g) {
            g = -9007199254740992 > g || 9007199254740992 < g ? NaN : Number(g);
            try {
              var h = T(e);
              if (c & 2) {
                c = g;
                if (32768 !== (h.node.mode & 61440)) throw new N(43);
                if (!(d & 2)) {
                  var q = C.slice(a, a + b);
                  h.Ma.kb && h.Ma.kb(h, q, c, b, d);
                }
              }
            } catch (w) {
              if ("undefined" == typeof X || "ErrnoError" !== w.name) throw w;
              return -w.Pa;
            }
          },
          n: (a, b) => {
            Ic[a] && (clearTimeout(Ic[a].id), delete Ic[a]);
            if (!b) return 0;
            var c = setTimeout(() => {
              delete Ic[a];
              Kc(() => Uc(a, performance.now()));
            }, b);
            Ic[a] = { id: c, lc: b };
            return 0;
          },
          B: (a, b, c, d) => {
            var e = (/* @__PURE__ */ new Date()).getFullYear(), g = new Date(e, 0, 1).getTimezoneOffset();
            e = new Date(e, 6, 1).getTimezoneOffset();
            F[a >> 2] = 60 * Math.max(g, e);
            E[b >> 2] = Number(g != e);
            b = (h) => {
              var q = Math.abs(h);
              return `UTC${0 <= h ? "-" : "+"}${String(Math.floor(q / 60)).padStart(2, "0")}${String(q % 60).padStart(2, "0")}`;
            };
            a = b(g);
            b = b(e);
            e < g ? (M(a, C, c, 17), M(b, C, d, 17)) : (M(a, C, d, 17), M(b, C, c, 17));
          },
          d: () => Date.now(),
          s: () => 2147483648,
          c: () => performance.now(),
          o: (a) => {
            var b = C.length;
            a >>>= 0;
            if (2147483648 < a) return false;
            for (var c = 1; 4 >= c; c *= 2) {
              var d = b * (1 + 0.2 / c);
              d = Math.min(d, a + 100663296);
              a: {
                d = (Math.min(2147483648, 65536 * Math.ceil(Math.max(
                  a,
                  d
                ) / 65536)) - La.buffer.byteLength + 65535) / 65536 | 0;
                try {
                  La.grow(d);
                  Ka();
                  var e = 1;
                  break a;
                } catch (g) {
                }
                e = void 0;
              }
              if (e) return true;
            }
            return false;
          },
          E: (a, b) => {
            var c = 0, d = 0, e;
            for (e of Nc()) {
              var g = b + c;
              F[a + d >> 2] = g;
              c += M(e, C, g, Infinity) + 1;
              d += 4;
            }
            return 0;
          },
          F: (a, b) => {
            var c = Nc();
            F[a >> 2] = c.length;
            a = 0;
            for (var d of c) a += ib(d) + 1;
            F[b >> 2] = a;
            return 0;
          },
          e: function(a) {
            try {
              var b = T(a);
              oa(b);
              return 0;
            } catch (c) {
              if ("undefined" == typeof X || "ErrnoError" !== c.name) throw c;
              return c.Pa;
            }
          },
          p: function(a, b) {
            try {
              var c = T(a);
              m[b] = c.tty ? 2 : P(c.mode) ? 3 : 40960 === (c.mode & 61440) ? 7 : 4;
              Ha[b + 2 >> 1] = 0;
              G[b + 8 >> 3] = BigInt(0);
              G[b + 16 >> 3] = BigInt(0);
              return 0;
            } catch (d) {
              if ("undefined" == typeof X || "ErrnoError" !== d.name) throw d;
              return d.Pa;
            }
          },
          w: function(a, b, c, d) {
            try {
              a: {
                var e = T(a);
                a = b;
                for (var g, h = b = 0; h < c; h++) {
                  var q = F[a >> 2], w = F[a + 4 >> 2];
                  a += 8;
                  var t = ac(e, m, q, w, g);
                  if (0 > t) {
                    var x = -1;
                    break a;
                  }
                  b += t;
                  if (t < w) break;
                  "undefined" != typeof g && (g += t);
                }
                x = b;
              }
              F[d >> 2] = x;
              return 0;
            } catch (D) {
              if ("undefined" == typeof X || "ErrnoError" !== D.name) throw D;
              return D.Pa;
            }
          },
          D: function(a, b, c, d) {
            b = -9007199254740992 > b || 9007199254740992 < b ? NaN : Number(b);
            try {
              if (isNaN(b)) return 61;
              var e = T(a);
              $b(e, b, c);
              G[d >> 3] = BigInt(e.position);
              e.rb && 0 === b && 0 === c && (e.rb = null);
              return 0;
            } catch (g) {
              if ("undefined" == typeof X || "ErrnoError" !== g.name) throw g;
              return g.Pa;
            }
          },
          I: function(a) {
            try {
              var b = T(a);
              return b.Ma?.fsync?.(b);
            } catch (c) {
              if ("undefined" == typeof X || "ErrnoError" !== c.name) throw c;
              return c.Pa;
            }
          },
          t: function(a, b, c, d) {
            try {
              a: {
                var e = T(a);
                a = b;
                for (var g, h = b = 0; h < c; h++) {
                  var q = F[a >> 2], w = F[a + 4 >> 2];
                  a += 8;
                  var t = na(e, m, q, w, g);
                  if (0 > t) {
                    var x = -1;
                    break a;
                  }
                  b += t;
                  if (t < w) break;
                  "undefined" != typeof g && (g += t);
                }
                x = b;
              }
              F[d >> 2] = x;
              return 0;
            } catch (D) {
              if ("undefined" == typeof X || "ErrnoError" !== D.name) throw D;
              return D.Pa;
            }
          },
          k: Jc
        };
        function Wc() {
          function a() {
            k.calledRun = true;
            if (!Fa) {
              if (!k.noFSInit && !Gb) {
                var b, c;
                Gb = true;
                b ??= k.stdin;
                c ??= k.stdout;
                d ??= k.stderr;
                b ? W("stdin", b) : Vb("/dev/tty", "/dev/stdin");
                c ? W("stdout", null, c) : Vb("/dev/tty", "/dev/stdout");
                d ? W("stderr", null, d) : Vb("/dev/tty1", "/dev/stderr");
                ma("/dev/stdin", 0);
                ma("/dev/stdout", 1);
                ma("/dev/stderr", 1);
              }
              Xc.N();
              Hb = false;
              k.onRuntimeInitialized?.();
              if (k.postRun) for ("function" == typeof k.postRun && (k.postRun = [k.postRun]); k.postRun.length; ) {
                var d = k.postRun.shift();
                Ua.push(d);
              }
              Ta(Ua);
            }
          }
          if (0 < J) Xa = Wc;
          else {
            if (k.preRun) for ("function" == typeof k.preRun && (k.preRun = [k.preRun]); k.preRun.length; ) Wa();
            Ta(Va);
            0 < J ? Xa = Wc : k.setStatus ? (k.setStatus("Running..."), setTimeout(() => {
              setTimeout(() => k.setStatus(""), 1);
              a();
            }, 1)) : a();
          }
        }
        var Xc;
        (async function() {
          function a(c) {
            c = Xc = c.exports;
            k._sqlite3_free = c.P;
            k._sqlite3_value_text = c.Q;
            k._sqlite3_prepare_v2 = c.R;
            k._sqlite3_step = c.S;
            k._sqlite3_reset = c.T;
            k._sqlite3_exec = c.U;
            k._sqlite3_finalize = c.V;
            k._sqlite3_column_name = c.W;
            k._sqlite3_column_text = c.X;
            k._sqlite3_column_type = c.Y;
            k._sqlite3_errmsg = c.Z;
            k._sqlite3_clear_bindings = c._;
            k._sqlite3_value_blob = c.$;
            k._sqlite3_value_bytes = c.aa;
            k._sqlite3_value_double = c.ba;
            k._sqlite3_value_int = c.ca;
            k._sqlite3_value_type = c.da;
            k._sqlite3_result_blob = c.ea;
            k._sqlite3_result_double = c.fa;
            k._sqlite3_result_error = c.ga;
            k._sqlite3_result_int = c.ha;
            k._sqlite3_result_int64 = c.ia;
            k._sqlite3_result_null = c.ja;
            k._sqlite3_result_text = c.ka;
            k._sqlite3_aggregate_context = c.la;
            k._sqlite3_column_count = c.ma;
            k._sqlite3_data_count = c.na;
            k._sqlite3_column_blob = c.oa;
            k._sqlite3_column_bytes = c.pa;
            k._sqlite3_column_double = c.qa;
            k._sqlite3_bind_blob = c.ra;
            k._sqlite3_bind_double = c.sa;
            k._sqlite3_bind_int = c.ta;
            k._sqlite3_bind_text = c.ua;
            k._sqlite3_bind_parameter_index = c.va;
            k._sqlite3_sql = c.wa;
            k._sqlite3_normalized_sql = c.xa;
            k._sqlite3_changes = c.ya;
            k._sqlite3_close_v2 = c.za;
            k._sqlite3_create_function_v2 = c.Aa;
            k._sqlite3_update_hook = c.Ba;
            k._sqlite3_open = c.Ca;
            da = k._malloc = c.Da;
            ea = k._free = c.Ea;
            k._RegisterExtensionFunctions = c.Fa;
            Bb = c.Ga;
            Uc = c.Ha;
            ra = c.Ia;
            y = c.Ja;
            pa = c.Ka;
            La = c.M;
            Z = c.O;
            Ka();
            J--;
            k.monitorRunDependencies?.(J);
            0 == J && Xa && (c = Xa, Xa = null, c());
            return Xc;
          }
          J++;
          k.monitorRunDependencies?.(J);
          var b = { a: Vc };
          if (k.instantiateWasm) return new Promise((c) => {
            k.instantiateWasm(b, (d, e) => {
              c(a(d, e));
            });
          });
          Na ??= k.locateFile ? k.locateFile("sql-wasm.wasm", za) : za + "sql-wasm.wasm";
          return a((await Ra(b)).instance);
        })();
        Wc();
        return Module;
      });
      return initSqlJsPromise;
    };
    if (typeof exports2 === "object" && typeof module2 === "object") {
      module2.exports = initSqlJs2;
      module2.exports.default = initSqlJs2;
    } else if (typeof define === "function" && define["amd"]) {
      define([], function() {
        return initSqlJs2;
      });
    } else if (typeof exports2 === "object") {
      exports2["Module"] = initSqlJs2;
    }
  }
});

// src/extension.js
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var vscode7 = __toESM(require("vscode"), 1);
var path10 = __toESM(require("path"), 1);
var fs8 = __toESM(require("fs"), 1);
var import_url = require("url");

// src/constants.js
var MAX_ITERATIONS = 20;
var PROVIDER_DEFAULTS = {
  qwen: { baseUrl: "https://chat.qwen.ai/api/v2", needsKey: true }
};
var STORAGE_KEYS = {
  CONVERSATIONS: "qwen-coderun_conversations",
  SELECTED_MODEL: "qwen-coderun_selected_model",
  SETTINGS: "qwen-coderun_settings",
  SIDEBAR_OPEN: "qwen-coderun_sidebar_open",
  PROVIDER_CONFIGS: "qwen-coderun_provider_configs"
};
var EVENT_TYPES = {
  THINKING: "thinking",
  THINKING_COMPLETE: "thinking_complete",
  CONTENT: "content",
  TOOL_CALL: "tool_call",
  TOOL_RESULT: "tool_result",
  ACTION: "action",
  REQUEST_PERMISSION: "requestPermission",
  AGENT_STATUS: "agent_status",
  AGENT_ITERATION: "agent_iteration",
  AGENT_DONE: "agent_done",
  AGENT_ERROR: "agent_error",
  SOURCES: "sources",
  STATUS: "status",
  STREAM_END: "stream_end",
  STREAM_ERROR: "stream_error",
  KEEPALIVE: "keepalive",
  // Terminal streaming events
  TERMINAL_START: "terminal_start",
  TERMINAL_OUTPUT: "terminal_output",
  TERMINAL_EXIT: "terminal_exit",
  TERMINAL_ERROR: "terminal_error",
  TERMINAL_LINE: "terminal_line"
};
var SYSTEM_PROMPT = `You are an autonomous AI coding agent integrated into a VS Code extension. You operate inside a user's workspace and have access to tools for reading, writing, editing, deleting files, listing directories, searching files, and running terminal commands.

## YOUR ROLE
You are the decision-maker. For every user request, you MUST decide:
1. Can I answer this directly from my knowledge? \u2192 Answer immediately, do NOT call tools.
2. Do I need to inspect or modify files/folders or run commands? \u2192 Use the appropriate tools.

## DECISION RULES

**ANSWER DIRECTLY (no tools) when the user asks:**
- Knowledge questions: "What is Python?", "Explain async/await", "How does React work?"
- Conceptual help: "What design pattern should I use?", "Compare REST vs GraphQL"
- Code explanations: "What does this code do?" (if code is in the message itself)
- General advice: "How should I structure my project?"

**USE TOOLS when the user asks to:**
- Read, create, edit, or delete files \u2192 use read_file, write_file, edit_file, delete_file
- Explore project structure \u2192 use list_directory, search_files
- Search file contents \u2192 use find_in_files (faster than reading every file)
- Run commands (build, test, install, git) \u2192 use run_terminal
- Any task that requires seeing or changing files in the workspace

## PROJECT INDEX
A persistent project index is available. The index tracks file metadata and content chunks. Use search_files for filename patterns and find_in_files for content search. The index is automatically updated when files change \u2014 no manual refresh needed. If a file was recently created, it may not be indexed yet; use search_files which falls back to filesystem scanning.

## HOW TO WORK (Think \u2192 Plan \u2192 Act \u2192 Verify)

1. **Think**: Understand what the user wants. Break complex tasks into steps.
2. **Plan**: Decide which tools to call and in what order.
3. **Act**: Call tools one at a time. Read results carefully.
4. **Verify**: After making changes, verify they are correct (read the file back, run tests, etc.)

## WORKSPACE RULES
- The workspace path is provided by the system. Always use RELATIVE paths (e.g., 'src/main.py' not '/home/user/project/src/main.py').
- NEVER access files outside the workspace.
- ALWAYS read a file before editing it, so you understand its current content.
- When creating files, parent directories are created automatically.

## TOOL CALLING RULES
- You can call multiple tools in parallel when they are independent (e.g. writing multiple files, searching multiple patterns). This is faster and highly encouraged.
- After receiving tool results, analyze them before deciding the next action.
- If a tool fails, read the error message, understand why, and try a different approach.
- You have a maximum of 20 tool iterations \u2014 use them wisely, do not waste calls.

## FILE EDITING RULES
- ALWAYS use read_file before edit_file \u2014 you need to know the exact content to replace.
- For small changes, use edit_file (find and replace exact strings).
- For large rewrites or new files, use write_file.
- Preserve existing code that the user did not ask to change.

## TERMINAL RULES
- Use run_terminal for: installing packages, running scripts, git operations, builds, tests.
- Read command output carefully \u2014 if it fails, analyze the error and fix it.
- Use appropriate timeouts for long-running commands (default is 30 seconds).

## INTERACTIVE TERMINAL SESSIONS
When a terminal command shows a menu, prompt, or interactive selection (e.g. "Select a framework:", "(y/N)", radio buttons, arrow-key navigation), the result will include:
  - Status: waiting_for_input -- the process is still running and waiting for keyboard input
  - Interactive: true -- the output contains interactive prompt characters
  - Waiting For Input: true -- the tool detected that no new output arrived for 3 seconds because the process is blocked on stdin
  - Terminal Output: ... -- shows what the terminal currently displays

**When you see these fields, follow these rules:**
  1. DO NOT start a new terminal command -- the existing session is still active.
  2. DO NOT assume the command failed -- it is waiting for your input.
  3. Analyze the terminal output to understand what the prompt is asking.
  4. Use terminal_input(text: "...") to send keyboard input to the SAME terminal session.
  5. Use run_terminal(command: "") (empty command) after sending input to check the terminal's response.
  6. Continue the interaction loop (terminal_input -> check output -> terminal_input) until the process exits.
  7. Only start a new terminal command after the current interactive process has finished.
  8. If you need to abort the interactive session, use stop_terminal() (sends Ctrl+C).

## MARKDOWN AND IMAGE PRESENTATION RULES
- Always output high-quality, rich markdown. Use bolding, italics, bulleted lists, numbered lists, blockquotes, code syntax highlighting, and clean tables for structural or comparative data.
- If you need to describe or show code, use fenced code blocks with the correct language tag.
- If the user provides an image or screenshot (passed in visual context), analyze it thoroughly (e.g., UI layout, visual bugs, logs in screenshots) and provide relevant guidance. Refer to elements in the image directly.

## RESPONSE RULES
- Be concise and clear.
- After completing a task, summarize what you did and the final result.
- Once you finish running tools and no further actions are needed, you MUST write a final text response confirming the completion of the requested task (e.g., "I have successfully deleted all files as requested..."). Do NOT output empty content or end the stream abruptly.
- If you encounter errors, explain what went wrong and what you tried.
- Format code in markdown code blocks with language tags.
`;

// src/promptBuilder.js
function buildMessages(userPrompt, options) {
  options = options || {};
  var history = options.history || [];
  var workspace6 = options.workspace || "";
  var toolResults = options.toolResults || [];
  var skills = options.skills || [];
  var memory = options.memory || [];
  var mcpContext = options.mcpContext || "";
  var knowledge = options.knowledge || {};
  var messages = [];
  var systemContent = SYSTEM_PROMPT;
  if (workspace6) {
    systemContent += "\n\n## CURRENT WORKSPACE\nThe active workspace directory is: " + workspace6;
    systemContent += "\nYou are running inside this folder. Use relative paths (e.g., 'src/main.py' or '.').";
  }
  var shellName = options.shellName || "";
  var platformName = options.platformName || "";
  if (shellName) {
    systemContent += "\nDetected Shell: " + shellName;
    if (shellName.toLowerCase().includes("powershell") || shellName.toLowerCase().includes("pwsh")) {
      systemContent += "\nPOWERSHELL RULES:\n- DO NOT use `&&` to chain commands (it is invalid in Windows PowerShell and will fail with a ParserError).\n- To chain commands, use `;` (semicolon) instead, e.g. `cd folder; npm run dev`.\n- Make sure commands are compatible with PowerShell syntax.";
    } else if (shellName.toLowerCase().includes("cmd")) {
      systemContent += "\nCMD RULES: Use `cd dir && command` for sequential commands.";
    } else {
      systemContent += "\nUse `cd dir && command` for sequential commands.";
    }
  }
  if (platformName) {
    systemContent += "\nPlatform: " + platformName;
  }
  systemContent += "\n\n## TERMINAL OUTPUT RULES:\n- The user sees the live terminal execution output directly in a dedicated console box.\n- DO NOT duplicate, repeat, or list the full command output in your text response. Summarize or explain the outcome briefly if needed, but do not print raw output blocks or listings (like folder contents or file outputs) that are already visible in the console.";
  systemContent += "\n\n## PLANNING AND PROGRESS TRACKING\nYou have access to planning tools (`create_plan` and `update_plan`) to plan your execution steps as a checklist of todos shown to the user.\n1. If a plan/todo list is required to solve the user prompt, you MUST call `create_plan` at the beginning of the execution (first tool call) to define the plan steps.\n2. As you make progress, you MUST call `update_plan` to mark steps as 'active' or 'completed' using the step `order` (1, 2, 3, etc.). Do not skip steps. Only mark a step completed when it is fully verified.\n3. You should work one step at a time: complete the current active step before starting the next one.";
  if (skills.length) {
    systemContent += "\n\n## SKILLS\n" + skills.join("\n");
  }
  if (memory.length) {
    systemContent += "\n\n## MEMORY\n" + memory.map(function(m) {
      return "- " + m;
    }).join("\n");
  }
  if (mcpContext) {
    systemContent += "\n\n## MCP CONTEXT\n" + mcpContext;
  }
  if (knowledge.projectMetadata) {
    systemContent += "\n\n## PROJECT METADATA\n";
    systemContent += "- Project: " + (knowledge.projectMetadata.name || "unknown") + "\n";
    systemContent += "- Files: " + (knowledge.projectMetadata.fileCount || 0) + "\n";
  }
  if (knowledge.projectMemory) {
    systemContent += "\n\n" + knowledge.projectMemory;
  }
  if (knowledge.dependencyGraph) {
    systemContent += "\n\n" + knowledge.dependencyGraph;
  }
  if (knowledge.timeline) {
    systemContent += "\n\n" + knowledge.timeline;
  }
  if (knowledge.fileContext) {
    systemContent += "\n\n## INDEXED FILE CONTEXT\nUse searchFiles(query) to find relevant files. The index contains " + (knowledge.fileCount || 0) + " files.";
  }
  if (knowledge.editorContext) {
    systemContent += "\n\n" + knowledge.editorContext;
  }
  if (knowledge.activePlans) {
    systemContent += "\n\n" + knowledge.activePlans;
  }
  if (knowledge.learningContext) {
    systemContent += "\n\n" + knowledge.learningContext;
  }
  if (knowledge.checkpointContext) {
    systemContent += "\n\n" + knowledge.checkpointContext;
  }
  if (knowledge.intentContext) {
    systemContent += "\n\n" + knowledge.intentContext;
  }
  if (knowledge.suggestedTools) {
    systemContent += "\n\n" + knowledge.suggestedTools;
  }
  if (knowledge.relevantFiles && knowledge.relevantFiles.length) {
    systemContent += "\n\n## RELEVANT FILES\n";
    for (var rf = 0; rf < knowledge.relevantFiles.length; rf++) {
      systemContent += "- " + knowledge.relevantFiles[rf] + "\n";
    }
    systemContent += "\nThese files may be relevant to the user's request. Read them if needed.";
  }
  messages.push({ role: "system", content: systemContent });
  for (var i = 0; i < history.length; i++) {
    var msg = history[i];
    if (msg.role === "system") continue;
    var historyMsg = {
      role: msg.role,
      content: msg.content || ""
    };
    if (msg.tool_calls) historyMsg.tool_calls = msg.tool_calls;
    if (msg.tool_call_id) historyMsg.tool_call_id = msg.tool_call_id;
    if (msg.images) historyMsg.images = msg.images;
    if (msg.image && !historyMsg.images) historyMsg.images = [msg.image];
    messages.push(historyMsg);
  }
  for (var j = 0; j < toolResults.length; j++) {
    var tr = toolResults[j];
    messages.push({
      role: "tool",
      tool_call_id: tr.tool_call_id,
      content: tr.formattedResult
    });
  }
  if (userPrompt) {
    var userMsg = { role: "user", content: userPrompt };
    var currentImages = options.images || [];
    if (currentImages && currentImages.length) {
      userMsg.images = currentImages;
    }
    messages.push(userMsg);
  }
  return messages;
}

// src/agentLoop.js
init_providerManager();

// src/toolDefinitions.js
var definitions = [];
var definitionMap = {};
function registerTool(name, description, parameters, required) {
  var def = {
    type: "function",
    function: {
      name,
      description,
      parameters: {
        type: "object",
        properties: parameters || {},
        required: required || []
      }
    }
  };
  definitions.push(def);
  definitionMap[name] = def;
}
function getDefinitions() {
  return definitions;
}
registerTool(
  "read_file",
  "Read the full contents of a file at the given relative path inside the workspace. Returns the file text. Use this BEFORE editing any file so you know what is in it. Also use to inspect code, configs, logs, etc.",
  { file_path: { type: "string", description: "Relative path to the file inside the workspace, e.g. 'src/main.py' or 'README.md'" } },
  ["file_path"]
);
registerTool(
  "read",
  "Read the full contents of a file at the given path inside the workspace. Alias for read_file.",
  { file_path: { type: "string", description: "Relative path to the file inside the workspace, e.g. 'src/main.py' or 'README.md'" } },
  ["file_path"]
);
registerTool(
  "write_file",
  "Create a new file or completely overwrite an existing file with the provided content. Parent directories are created automatically. Use this to create new files or when you need to rewrite a file entirely.",
  {
    file_path: { type: "string", description: "Relative path to the file inside the workspace, e.g. 'src/app.js'" },
    content: { type: "string", description: "The complete file content to write" }
  },
  ["file_path", "content"]
);
registerTool(
  "write",
  "Create a new file or completely overwrite an existing file with the provided content. Alias for write_file.",
  {
    file_path: { type: "string", description: "Relative path to the file inside the workspace, e.g. 'src/app.js'" },
    content: { type: "string", description: "The complete file content to write" }
  },
  ["file_path", "content"]
);
registerTool(
  "edit_file",
  "Replace the first occurrence of an exact string in a file with a new string. Use this for small, precise edits without rewriting the whole file. The old_string must match exactly (including whitespace and indentation).",
  {
    file_path: { type: "string", description: "Relative path to the file inside the workspace" },
    old_string: { type: "string", description: "The exact string to find (must match precisely including whitespace)" },
    new_string: { type: "string", description: "The string to replace old_string with" }
  },
  ["file_path", "old_string", "new_string"]
);
registerTool(
  "edit",
  "Replace the first occurrence of an exact string in a file with a new string. Alias for edit_file.",
  {
    file_path: { type: "string", description: "Relative path to the file inside the workspace" },
    old_string: { type: "string", description: "The exact string to find (must match precisely including whitespace)" },
    new_string: { type: "string", description: "The string to replace old_string with" }
  },
  ["file_path", "old_string", "new_string"]
);
registerTool(
  "delete_file",
  "Permanently delete a file from the workspace.",
  { file_path: { type: "string", description: "Relative path to the file to delete" } },
  ["file_path"]
);
registerTool(
  "create_folder",
  "Create a directory (and any parent directories) in the workspace.",
  { folder_path: { type: "string", description: "Relative path to the folder to create, e.g. 'src/components'" } },
  ["folder_path"]
);
registerTool(
  "delete_folder",
  "Delete a folder and ALL its contents recursively from the workspace. Use with caution.",
  { folder_path: { type: "string", description: "Relative path to the folder to delete" } },
  ["folder_path"]
);
registerTool(
  "list_directory",
  "List all files and folders in a directory. Returns each entry's name and whether it is a file or directory. Use this to explore and understand the project structure before making changes.",
  { folder_path: { type: "string", description: "Relative path to the folder to list. Use '.' for the workspace root." } },
  []
);
registerTool(
  "search_files",
  "Recursively search for files matching a glob pattern (e.g., '*.py', '*.html', 'test_*') within a folder.",
  {
    pattern: { type: "string", description: "Glob pattern to match filenames, e.g. '*.py', '*.js', 'Dockerfile'" },
    folder_path: { type: "string", description: "Relative path to search in. Defaults to workspace root." }
  },
  ["pattern"]
);
registerTool(
  "get_file_info",
  "Get metadata about a file or folder: size in bytes, last modified time, creation time, and whether it is a file or directory.",
  { file_path: { type: "string", description: "Relative path to the file or folder" } },
  ["file_path"]
);
registerTool(
  "run_terminal",
  "Execute a shell command in the workspace directory and return its stdout, stderr, and exit code. Use for: running builds, installing packages, running tests, git commands, listing processes, checking versions, etc. The command runs with the workspace as the current directory. If the command is empty, checks the current terminal session output (use after terminal_input to see updated output).",
  {
    command: { type: "string", description: "The shell command to execute, e.g. 'npm install', 'python main.py', 'git status'. Pass empty string to check current terminal session output." },
    timeout: { type: "integer", description: "Max seconds to wait. Default 30. Increase for long builds." },
    background: { type: "boolean", description: "If true, run the command in the background without waiting for it to finish (useful for dev servers, watch processes, etc.). Default false." }
  },
  []
);
registerTool(
  "bash",
  "Execute a shell command in the terminal. Alias for run_terminal.",
  {
    command: { type: "string", description: "The shell command to execute, e.g. 'ls', 'npm run dev', 'git status'" }
  },
  ["command"]
);
registerTool(
  "execute_command",
  "Execute a shell command in the terminal. Alias for run_terminal.",
  {
    command: { type: "string", description: "The shell command to execute, e.g. 'ls', 'npm run dev', 'git status'" }
  },
  ["command"]
);
registerTool(
  "get_current_datetime",
  "Get the current date and time. Useful when the user asks about the current time or you need timestamps.",
  {},
  []
);
registerTool(
  "find_in_files",
  "Search the contents of all project files for a text query. Returns matching file paths with context snippets. Use this when you need to find where something is used, defined, or referenced in code. Fast alternative to reading every file manually.",
  {
    query: { type: "string", description: "The text or keyword to search for in file contents, e.g. 'useEffect', 'function calculate', 'TODO'" }
  },
  ["query"]
);
registerTool(
  "terminal_input",
  "Send text input (like keyboard inputs, pressing Enter, responding to prompts) to the active terminal running a command.",
  {
    text: { type: "string", description: "The text/keys to send to the terminal." }
  },
  ["text"]
);
registerTool(
  "stop_terminal",
  "Send a Ctrl+C signal (interrupt) to the active terminal to stop the currently running command or server.",
  {},
  []
);
registerTool(
  "list_symbols",
  "Extract and list all code symbols (classes, functions, methods, structs, interfaces) defined in a file. Returns symbols with their line numbers. Use this to quickly understand the structure/outline of a large file before editing.",
  {
    file_path: { type: "string", description: "Relative path to the file inside the workspace, e.g. 'src/app.js'" }
  },
  ["file_path"]
);
registerTool(
  "patch_file",
  "Apply multiple search-and-replace blocks to a single file at once. Parent directories must exist. Useful for making non-contiguous changes without rewriting the entire file. If any block find pattern fails to match, the tool fails.",
  {
    file_path: { type: "string", description: "Relative path to the file in the workspace." },
    patches: {
      type: "array",
      description: "List of patch search-and-replace blocks to apply sequentially.",
      items: {
        type: "object",
        properties: {
          find: { type: "string", description: "The exact search block to replace in the file (supports exact and fuzzy whitespace matching)." },
          replace: { type: "string", description: "The replacement content for the search block." }
        },
        required: ["find", "replace"]
      }
    }
  },
  ["file_path", "patches"]
);
registerTool(
  "web_request",
  "Perform an HTTP request to verify a running development server or fetch data from an API endpoint.",
  {
    url: { type: "string", description: "The URL of the request, e.g. 'http://localhost:3000/health'" },
    method: { type: "string", description: "HTTP method, e.g. 'GET', 'POST', 'PUT', 'DELETE'. Defaults to 'GET'." },
    headers: { type: "object", description: "HTTP headers object." },
    body: { type: "string", description: "Optional request body." }
  },
  ["url"]
);
registerTool(
  "update_plan",
  "Update the plan steps (todos checklist) shown to the user. Use this tool to mark steps as 'completed', 'active', or 'pending', or to add/update tasks in the plan as you make progress.",
  {
    steps: {
      type: "array",
      description: "Array of plan step updates to apply.",
      items: {
        type: "object",
        properties: {
          order: { type: "integer", description: "The step number to update (1-indexed)." },
          status: { type: "string", description: "The new status for the step: 'pending', 'active', or 'completed'." },
          description: { type: "string", description: "Optional new description for the step." }
        },
        required: ["order", "status"]
      }
    }
  },
  ["steps"]
);
registerTool(
  "create_plan",
  "Create a structured plan (checklist of todos) for resolving the user request. Call this tool at the start of execution if you need to create a plan.",
  {
    steps: {
      type: "array",
      description: "Array of plan steps to create.",
      items: {
        type: "object",
        properties: {
          order: { type: "integer", description: "The step number (1-indexed)." },
          description: { type: "string", description: "Description of the task step." }
        },
        required: ["order", "description"]
      }
    }
  },
  ["steps"]
);

// src/toolRegistry.js
var registry = {};
function register(name, fn) {
  registry[name] = fn;
}
function get(name) {
  return registry[name] || null;
}
function execute(name, args, workspace6) {
  var lookupName = name;
  var mappedArgs = args || {};
  var lowerName = (name || "").toLowerCase();
  if (lowerName === "execute_command" || lowerName === "bash") {
    lookupName = "run_terminal";
    mappedArgs = {
      command: args.command || args.text || args.code || args.commandLine || args.cmd || "",
      timeout: args.timeout || 30,
      background: args.background || false
    };
  } else if (lowerName === "read") {
    lookupName = "read_file";
  } else if (lowerName === "write") {
    lookupName = "write_file";
  } else if (lowerName === "edit") {
    lookupName = "edit_file";
  }
  var fn = get(lookupName);
  if (!fn) {
    return (async function* () {
      yield {
        type: "tool_result",
        tool: name,
        success: false,
        message: "Tool " + name + " is not implemented."
      };
    })();
  }
  return fn(mappedArgs, workspace6);
}

// src/toolExecutor.js
function formatToolResult(toolName, result) {
  var res = result || {};
  var parts = ["Tool: " + toolName];
  parts.push("Success: " + (res.success !== false));
  if (res.status !== void 0 && res.status !== "completed" && res.status !== "failed") {
    parts.push("Status: " + res.status);
  }
  if (res.waiting_for_input === true || res.interactive === true) {
    parts.push("Interactive: " + (res.interactive === true));
    parts.push("Waiting For Input: " + (res.waiting_for_input === true));
    if (res.prompt_detected === true) parts.push("Prompt Detected: true");
  }
  if (res.content !== void 0) parts.push("Content:" + res.content);
  if (res.stdout !== void 0 && res.stdout) parts.push("Stdout:\n" + res.stdout);
  if (res.output !== void 0) parts.push("Output:" + res.output);
  if (res.message !== void 0) parts.push("Message: " + res.message);
  if (res.entries !== void 0) parts.push("Entries: " + JSON.stringify(res.entries));
  if (res.matches !== void 0) parts.push("Matches: " + JSON.stringify(res.matches));
  if (res.info !== void 0) parts.push("Info: " + JSON.stringify(res.info));
  if (res.datetime !== void 0) parts.push("Datetime: " + res.datetime);
  return parts.join("\n");
}

// src/permissions.js
var pendingPermissions = {};
var persistentDecisions = {};
var extensionContext = null;
var STORAGE_KEY = "qwen-coderun_permission_decisions";
function setExtensionContext(context) {
  extensionContext = context;
  loadPersistent();
}
function loadPersistent() {
  if (!extensionContext) return;
  try {
    var raw = extensionContext.globalState.get(STORAGE_KEY, "{}");
    persistentDecisions = JSON.parse(raw || "{}") || {};
  } catch (_) {
    persistentDecisions = {};
  }
}
function savePersistent() {
  if (!extensionContext) return;
  try {
    extensionContext.globalState.update(STORAGE_KEY, JSON.stringify(persistentDecisions));
  } catch (e) {
    console.error("[PERMISSIONS] Failed to save decisions:", e);
  }
}
function setAlwaysDecision(toolName, decision) {
  if (!toolName || decision !== "allow" && decision !== "deny") return;
  persistentDecisions[toolName] = decision;
  savePersistent();
}
function clearAlwaysDecision(toolName) {
  if (!toolName) {
    persistentDecisions = {};
  } else if (persistentDecisions[toolName]) {
    delete persistentDecisions[toolName];
  }
  savePersistent();
}
function getAlwaysDecision(toolName) {
  return persistentDecisions[toolName] || null;
}
function listAlwaysDecisions() {
  var out = {};
  for (var k in persistentDecisions) out[k] = persistentDecisions[k];
  return out;
}
function requestPermission(toolName, args, id, sendEvent) {
  var persistent = getAlwaysDecision(toolName);
  if (persistent === "allow") return Promise.resolve(true);
  if (persistent === "deny") return Promise.resolve(false);
  return new Promise(function(resolve3) {
    pendingPermissions[id] = resolve3;
  });
}
function resolvePermission(id, approved, options) {
  options = options || {};
  var resolver = pendingPermissions[id];
  if (!resolver) return false;
  resolver(!!approved);
  delete pendingPermissions[id];
  if (options.always && options.tool) {
    setAlwaysDecision(options.tool, approved ? "allow" : "deny");
  }
  return true;
}
function cancelAllPermissions() {
  for (var id in pendingPermissions) {
    pendingPermissions[id](false);
  }
  pendingPermissions = {};
}

// src/projectKnowledge.js
var vscode = __toESM(require("vscode"), 1);
var path = __toESM(require("path"), 1);
var fs = __toESM(require("fs/promises"), 1);
var import_fs = require("fs");
var crypto2 = __toESM(require("crypto"), 1);
var import_sql = __toESM(require_sql_wasm(), 1);
var _SQL = null;
var _registryDb = null;
var _registryPath = null;
var _projectDb = null;
var _projectDbPath = null;
var _globalStorage = null;
var _workspace = null;
var _workspaceHash = null;
var _projectName = null;
var _projectFolder = null;
var _projectDir = null;
var _ready = false;
var _indexing = false;
var _fileWatcher = null;
var _disposables = [];
var _REGISTRY_VERSION = 1;
var _INDEX_DB_VERSION = 1;
async function initialize(context) {
  if (_ready) return;
  var folders = vscode.workspace.workspaceFolders;
  if (!folders || !folders.length) {
    console.log("[PK] No workspace folder open \u2014 skipping");
    return;
  }
  _workspace = folders[0].uri.fsPath;
  _projectName = path.basename(_workspace);
  _globalStorage = context.globalStorageUri.fsPath;
  try {
    await fs.mkdir(_globalStorage, { recursive: true });
  } catch (_) {
  }
  _workspaceHash = crypto2.createHash("sha256").update(_workspace).digest("hex").substring(0, 8).toUpperCase();
  _projectFolder = _projectName + "_" + _workspaceHash;
  _projectDir = path.join(_globalStorage, "projects", _projectFolder);
  _projectDbPath = path.join(_projectDir, "index.db");
  _SQL = await (0, import_sql.default)();
  console.log("[PK] sql.js initialized");
  _registryPath = path.join(_globalStorage, "registry.db");
  await openRegistry();
  await registerWorkspace();
  await openProjectDb();
  setupWatcher();
  indexWorkspace();
  _ready = true;
  console.log("[PK] Ready \u2014 project:", _projectFolder, "at", _projectDbPath);
}
function getStats() {
  if (!_projectDb || !_ready) return { ready: false, tables: {} };
  try {
    var tableStmt = _projectDb.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    var tables = {};
    for (var i = 0; i < tableStmt.length; i++) {
      var tName = tableStmt[i].values[0][0];
      var countStmt = _projectDb.exec('SELECT COUNT(*) FROM "' + tName + '"');
      tables[tName] = countStmt.length ? countStmt[0].values[0][0] : 0;
    }
    return { ready: true, tables, workspace: _workspace };
  } catch (e) {
    return { ready: false, error: e.message };
  }
}
function getFile(relPath) {
  if (!_projectDb || !_ready || !relPath) return null;
  try {
    var stmt = _projectDb.prepare("SELECT * FROM files WHERE path = ?");
    stmt.bind([relPath]);
    if (stmt.step()) {
      var row = stmt.getAsObject();
      stmt.free();
      return row;
    }
    stmt.free();
    return null;
  } catch (e) {
    return null;
  }
}
function getProjectMetadata() {
  if (!_workspace) return null;
  var stats = getStats();
  return {
    name: _projectName,
    path: _workspace,
    fileCount: stats.tables && stats.tables.files ? stats.tables.files : 0,
    ready: _ready
  };
}
function addTask(task) {
  if (!_projectDb || !_ready) return;
  try {
    var stmt = _projectDb.prepare(`
      INSERT OR REPLACE INTO tasks (id, description, status, created_at, completed_at, result, session_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.bind([
      task.id || "",
      task.description || "",
      task.status || "draft",
      task.created_at || Date.now(),
      task.completed_at || null,
      task.result || "",
      task.session_id || ""
    ]);
    stmt.step();
    stmt.free();
    saveProjectDb();
  } catch (_) {
  }
}
function getPlansBySession(sessionId) {
  if (!_projectDb || !_ready || !sessionId) return [];
  try {
    var stmt = _projectDb.prepare("SELECT * FROM tasks WHERE session_id = ? ORDER BY created_at DESC");
    stmt.bind([sessionId]);
    var results = [];
    try {
      while (stmt.step()) {
        var row = stmt.getAsObject();
        results.push(normalizeTask(row));
      }
    } finally {
      stmt.free();
    }
    return results;
  } catch (_) {
    return [];
  }
}
function getPlansByStatus(status) {
  if (!_projectDb || !_ready || !status) return [];
  try {
    var stmt = _projectDb.prepare("SELECT * FROM tasks WHERE status = ? ORDER BY created_at DESC");
    stmt.bind([status]);
    var results = [];
    try {
      while (stmt.step()) {
        var row = stmt.getAsObject();
        results.push(normalizeTask(row));
      }
    } finally {
      stmt.free();
    }
    return results;
  } catch (_) {
    return [];
  }
}
function normalizeTask(row) {
  var result = {};
  try {
    if (row.result && typeof row.result === "string") {
      result = JSON.parse(row.result);
    }
  } catch (_) {
  }
  return {
    id: row.id || "",
    description: row.description || "",
    status: row.status || "pending",
    created_at: row.created_at || 0,
    completed_at: row.completed_at || null,
    session_id: row.session_id || "",
    steps: result.steps || [],
    required_files: result.files || []
  };
}
function addCheckpoint(cp) {
  if (!_projectDb || !_ready || !cp || !cp.id) return;
  try {
    var stmt = _projectDb.prepare(`
      INSERT OR REPLACE INTO checkpoints (id, file_path, content, created_at, session_id, label)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.bind([cp.id, cp.file_path || "", cp.content || "", cp.created_at || Date.now(), cp.session_id || "", cp.label || ""]);
    stmt.step();
    stmt.free();
    saveProjectDb();
  } catch (_) {
  }
}
function getCheckpoints(filePath, sessionId) {
  if (!_projectDb || !_ready || !filePath) return [];
  try {
    var sql = "SELECT * FROM checkpoints WHERE file_path = ?";
    var params = [filePath];
    if (sessionId) {
      sql += " AND session_id = ?";
      params.push(sessionId);
    }
    sql += " ORDER BY created_at DESC";
    var stmt = _projectDb.prepare(sql);
    stmt.bind(params);
    var results = [];
    try {
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
    } finally {
      stmt.free();
    }
    return results;
  } catch (_) {
    return [];
  }
}
function getRecentCheckpoints(sessionId, limit) {
  if (!_projectDb || !_ready) return [];
  limit = limit || 10;
  try {
    var sql = "SELECT * FROM checkpoints";
    var params = [];
    if (sessionId) {
      sql += " WHERE session_id = ?";
      params.push(sessionId);
    }
    sql += " ORDER BY created_at DESC LIMIT ?";
    params.push(limit);
    var stmt = _projectDb.prepare(sql);
    stmt.bind(params);
    var results = [];
    try {
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
    } finally {
      stmt.free();
    }
    return results;
  } catch (_) {
    return [];
  }
}
function deleteCheckpoint(id) {
  if (!_projectDb || !_ready || !id) return;
  try {
    _projectDb.run("DELETE FROM checkpoints WHERE id = ?", [id]);
    saveProjectDb();
  } catch (_) {
  }
}
function getCheckpointStats() {
  if (!_projectDb || !_ready) return { total: 0 };
  try {
    var stmt = _projectDb.exec("SELECT COUNT(*) as cnt FROM checkpoints");
    var total = stmt.length && stmt[0].values.length ? Number(stmt[0].values[0][0]) : 0;
    return { total };
  } catch (_) {
    return { total: 0 };
  }
}
function trimOldestCheckpoints(count) {
  if (!_projectDb || !_ready || !count) return;
  try {
    _projectDb.run("DELETE FROM checkpoints WHERE id IN (SELECT id FROM checkpoints ORDER BY created_at ASC LIMIT ?)", [count]);
    saveProjectDb();
  } catch (_) {
  }
}
function setSetting(key, value) {
  if (!_projectDb || !_ready) return;
  try {
    var stmt = _projectDb.prepare("INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)");
    stmt.bind([key, typeof value === "string" ? value : JSON.stringify(value)]);
    stmt.step();
    stmt.free();
  } catch (_) {
  }
}
function getSetting(key) {
  if (!_projectDb || !_ready) return null;
  try {
    var stmt = _projectDb.prepare("SELECT value FROM metadata WHERE key = ?");
    stmt.bind([key]);
    if (stmt.step()) {
      var v = stmt.getAsObject().value;
      stmt.free();
      try {
        return JSON.parse(v);
      } catch (_) {
        return v;
      }
    }
    stmt.free();
    return null;
  } catch (_) {
    return null;
  }
}
function getIndexStatus() {
  if (!_ready || !_projectDb) return { ready: false, indexed: false };
  try {
    var stmt = _registryDb.run("SELECT index_status FROM registry WHERE workspace_path = ?", [_workspace]);
    var status = "pending";
    if (stmt.length && stmt[0].values.length) {
      status = stmt[0].values[0][0];
    }
    return { ready: _ready, indexed: status === "ready" };
  } catch (_) {
    return { ready: _ready, indexed: false };
  }
}
function searchByGlob(likePattern, subDir) {
  if (!_projectDb || !_ready || !likePattern) return [];
  try {
    var sql = "SELECT path FROM files WHERE path LIKE ?";
    var params = [likePattern];
    if (subDir) {
      sql += " AND (path LIKE ? OR path LIKE ?)";
      params.push(subDir + "/%", subDir + "\\%");
    }
    sql += " LIMIT 200";
    var stmt = _projectDb.prepare(sql);
    stmt.bind(params);
    var results = [];
    try {
      while (stmt.step()) {
        results.push(stmt.getAsObject().path);
      }
    } finally {
      stmt.free();
    }
    return results;
  } catch (e) {
    console.error("[PK] searchByGlob error:", e.message);
    return [];
  }
}
function searchChunks(query) {
  if (!_projectDb || !_ready || !query) return [];
  try {
    var like = "%" + query + "%";
    var sql = `
      SELECT DISTINCT f.path, c.content
      FROM chunks c
      JOIN files f ON f.id = c.file_id
      WHERE c.content LIKE ?
      LIMIT 30
    `;
    var stmt = _projectDb.prepare(sql);
    stmt.bind([like]);
    var results = [];
    try {
      while (stmt.step()) {
        var row = stmt.getAsObject();
        var content = row.content || "";
        var idx = content.toLowerCase().indexOf(query.toLowerCase());
        var snippet = "";
        if (idx !== -1) {
          var start = Math.max(0, idx - 40);
          var end = Math.min(content.length, idx + query.length + 40);
          snippet = "..." + content.substring(start, end).replace(/\n/g, " ") + "...";
        }
        results.push({
          path: row.path,
          matches: 1,
          snippet
        });
      }
    } finally {
      stmt.free();
    }
    return results;
  } catch (e) {
    console.error("[PK] searchChunks error:", e.message);
    return [];
  }
}
async function touchFile(relPath) {
  if (!_projectDb || !_ready) return;
  await indexSingleFile(relPath);
  saveProjectDb();
}
function dispose() {
  saveProjectDb();
  saveRegistry();
  for (var i = 0; i < _disposables.length; i++) {
    _disposables[i].dispose();
  }
  _disposables = [];
  if (_fileWatcher) {
    _fileWatcher.dispose();
    _fileWatcher = null;
  }
  if (_projectDb) {
    _projectDb.close();
    _projectDb = null;
  }
  if (_registryDb) {
    _registryDb.close();
    _registryDb = null;
  }
  _ready = false;
  console.log("[PK] Disposed");
}
async function openRegistry() {
  try {
    if ((0, import_fs.existsSync)(_registryPath)) {
      var buf = await fs.readFile(_registryPath);
      _registryDb = new _SQL.Database(buf);
    } else {
      _registryDb = new _SQL.Database();
    }
  } catch (e) {
    console.error("[PK] Registry error:", e.message);
    _registryDb = new _SQL.Database();
  }
  _registryDb.run("PRAGMA journal_mode=WAL");
  _registryDb.run("PRAGMA synchronous=NORMAL");
  _registryDb.run(`
    CREATE TABLE IF NOT EXISTS registry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_path TEXT NOT NULL UNIQUE,
      workspace_name TEXT NOT NULL DEFAULT '',
      workspace_hash TEXT NOT NULL DEFAULT '',
      project_folder TEXT NOT NULL DEFAULT '',
      db_version INTEGER NOT NULL DEFAULT 1,
      first_indexed INTEGER NOT NULL DEFAULT 0,
      last_indexed INTEGER NOT NULL DEFAULT 0,
      last_opened INTEGER NOT NULL DEFAULT 0,
      index_status TEXT NOT NULL DEFAULT 'pending'
    )
  `);
  _registryDb.run(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    )
  `);
  var verStmt = _registryDb.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)");
  verStmt.bind(["version", String(_REGISTRY_VERSION)]);
  verStmt.step();
  verStmt.free();
  saveRegistry();
  console.log("[PK] Registry opened:", _registryPath);
}
async function saveRegistry() {
  if (!_registryDb || !_registryPath) return;
  try {
    var data = _registryDb.export();
    await fs.writeFile(_registryPath, Buffer.from(data)).catch(function(e) {
      console.error("[PK] Failed to save registry:", e.message);
    });
  } catch (e) {
    console.error("[PK] Failed to export registry:", e.message);
  }
}
async function registerWorkspace() {
  if (!_registryDb || !_workspace || !_workspaceHash) return;
  var now = Date.now();
  var stmt = _registryDb.prepare(`
    INSERT OR REPLACE INTO registry
      (workspace_path, workspace_name, workspace_hash, project_folder, db_version, last_opened)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.bind([_workspace, _projectName, _workspaceHash, _projectFolder, _INDEX_DB_VERSION, now]);
  stmt.step();
  stmt.free();
  saveRegistry();
  var check = _registryDb.run("SELECT first_indexed FROM registry WHERE workspace_path = ?", [_workspace]);
  if (check.length && check[0].values.length && !Number(check[0].values[0][0])) {
    _registryDb.run("UPDATE registry SET first_indexed = ? WHERE workspace_path = ?", [now, _workspace]);
    saveRegistry();
  }
}
async function openProjectDb() {
  try {
    await fs.mkdir(_projectDir, { recursive: true });
  } catch (_) {
  }
  try {
    if ((0, import_fs.existsSync)(_projectDbPath)) {
      var buf = await fs.readFile(_projectDbPath);
      _projectDb = new _SQL.Database(buf);
      console.log("[PK] Loaded existing project database");
    } else {
      _projectDb = new _SQL.Database();
      console.log("[PK] Created new project database");
    }
  } catch (e) {
    console.error("[PK] Project DB error:", e.message);
    _projectDb = new _SQL.Database();
  }
  _projectDb.run("PRAGMA journal_mode=WAL");
  _projectDb.run("PRAGMA synchronous=NORMAL");
  _projectDb.run(`
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL UNIQUE,
      language TEXT NOT NULL DEFAULT 'text',
      size INTEGER NOT NULL DEFAULT 0,
      hash TEXT NOT NULL DEFAULT '',
      last_modified TEXT NOT NULL DEFAULT '',
      last_indexed INTEGER NOT NULL DEFAULT 0
    )
  `);
  _projectDb.run(`
    CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id INTEGER NOT NULL,
      chunk_index INTEGER NOT NULL DEFAULT 0,
      content TEXT NOT NULL DEFAULT '',
      embedding BLOB DEFAULT NULL,
      FOREIGN KEY (file_id) REFERENCES files(id)
    )
  `);
  _projectDb.run(`
    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    )
  `);
  _projectDb.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL DEFAULT 0,
      completed_at INTEGER DEFAULT NULL,
      result TEXT DEFAULT NULL,
      session_id TEXT NOT NULL DEFAULT ''
    )
  `);
  _projectDb.run(`
    CREATE TABLE IF NOT EXISTS checkpoints (
      id TEXT PRIMARY KEY,
      file_path TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL DEFAULT 0,
      session_id TEXT NOT NULL DEFAULT '',
      label TEXT NOT NULL DEFAULT ''
    )
  `);
  _projectDb.run("INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)", ["db_version", String(_INDEX_DB_VERSION)]);
  saveProjectDb();
  console.log("[PK] Project database ready");
}
async function saveProjectDb() {
  if (!_projectDb || !_projectDbPath) return;
  try {
    var data = _projectDb.export();
    await fs.writeFile(_projectDbPath, Buffer.from(data)).catch(function(e) {
      console.error("[PK] Failed to save project DB:", e.message);
    });
  } catch (e) {
    console.error("[PK] Failed to export project DB:", e.message);
  }
}
async function indexWorkspace() {
  if (_indexing || !_workspace) return;
  _indexing = true;
  if (_registryDb) {
    _registryDb.run("UPDATE registry SET index_status = ? WHERE workspace_path = ?", ["indexing", _workspace]);
    saveRegistry();
  }
  console.log("[PK] Starting incremental indexing...");
  var startTime = Date.now();
  var indexedCount = 0;
  var unchangedCount = 0;
  try {
    var result = await walkAndIndex(_workspace, _workspace);
    indexedCount = result.indexed;
    unchangedCount = result.unchanged;
    if (_registryDb) {
      var now = Date.now();
      _registryDb.run("UPDATE registry SET last_indexed = ?, index_status = ?, last_opened = ? WHERE workspace_path = ?", [now, "ready", now, _workspace]);
      saveRegistry();
    }
    saveProjectDb();
    var elapsed = Date.now() - startTime;
    console.log("[PK] Done \u2014", indexedCount, "indexed,", unchangedCount, "unchanged in", elapsed, "ms");
  } catch (e) {
    console.error("[PK] Indexing error:", e.message);
    if (_registryDb) {
      _registryDb.run("UPDATE registry SET index_status = ? WHERE workspace_path = ?", ["error", _workspace]);
      saveRegistry();
    }
  }
  _indexing = false;
}
async function walkAndIndex(rootDir, dirPath) {
  var indexed = 0;
  var unchanged = 0;
  try {
    var entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "venv" || entry.name === "__pycache__") {
        continue;
      }
      var fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        var sub = await walkAndIndex(rootDir, fullPath);
        indexed += sub.indexed;
        unchanged += sub.unchanged;
        continue;
      }
      if (isBinaryExtension(entry.name)) continue;
      var relPath = path.relative(rootDir, fullPath);
      if (await indexSingleFile(relPath)) {
        indexed++;
      } else {
        unchanged++;
      }
    }
  } catch (_) {
  }
  return { indexed, unchanged };
}
async function indexSingleFile(relPath) {
  if (!_workspace || !_projectDb) return false;
  var fullPath = path.join(_workspace, relPath);
  try {
    var stat4 = await fs.stat(fullPath);
    if (!stat4.isFile()) return false;
    var size = stat4.size;
    var modified = stat4.mtime.toISOString();
    var fd = await fs.open(fullPath, "r");
    try {
      var readLen = Math.min(size, 32768);
      var buffer = Buffer.alloc(readLen);
      await fd.read(buffer, 0, readLen, 0);
    } finally {
      await fd.close();
    }
    var content = buffer.toString("utf-8");
    var hash = simpleHash(content);
    var ext = path.extname(relPath).toLowerCase();
    var language = langFromExt(ext);
    var existing = getFile(relPath);
    if (existing && existing.hash === hash && existing.last_modified === modified) {
      return false;
    }
    var upsertFile = _projectDb.prepare(`
      INSERT OR REPLACE INTO files (path, language, size, hash, last_modified, last_indexed)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    upsertFile.bind([relPath, language, size, hash, modified, Date.now()]);
    upsertFile.step();
    upsertFile.free();
    var idStmt = _projectDb.prepare("SELECT id FROM files WHERE path = ?");
    idStmt.bind([relPath]);
    var fileId = 0;
    if (idStmt.step()) fileId = Number(idStmt.getAsObject().id);
    idStmt.free();
    _projectDb.run("DELETE FROM chunks WHERE file_id = ?", [fileId]);
    if (content.length > 0) {
      var insertChunk = _projectDb.prepare("INSERT INTO chunks (file_id, chunk_index, content) VALUES (?, ?, ?)");
      for (var ci = 0; ci < content.length; ci += 1e3) {
        var chunkText = content.substring(ci, ci + 1e3);
        insertChunk.bind([fileId, Math.floor(ci / 1e3), chunkText]);
        insertChunk.step();
        insertChunk.free();
        insertChunk = _projectDb.prepare("INSERT INTO chunks (file_id, chunk_index, content) VALUES (?, ?, ?)");
      }
      insertChunk.free();
    }
    return true;
  } catch (_) {
    return false;
  }
}
function setupWatcher() {
  if (!_workspace) return;
  try {
    _fileWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(_workspace, "**/*")
    );
    _disposables.push(
      _fileWatcher.onDidChange(function(uri) {
        if (!_projectDb || !_ready) return;
        var relPath = path.relative(_workspace, uri.fsPath);
        if (!relPath || relPath.startsWith("..") || isBinaryExtension(relPath)) return;
        indexSingleFile(relPath).then(function() {
          saveProjectDb();
        }).catch(function() {
        });
      })
    );
    _disposables.push(
      _fileWatcher.onDidCreate(function(uri) {
        if (!_projectDb || !_ready) return;
        var relPath = path.relative(_workspace, uri.fsPath);
        if (!relPath || relPath.startsWith("..") || isBinaryExtension(relPath)) return;
        indexSingleFile(relPath).then(function() {
          saveProjectDb();
        }).catch(function() {
        });
      })
    );
    _disposables.push(
      _fileWatcher.onDidDelete(function(uri) {
        if (!_projectDb || !_ready) return;
        var relPath = path.relative(_workspace, uri.fsPath);
        if (!relPath || relPath.startsWith("..")) return;
        try {
          _projectDb.run("DELETE FROM files WHERE path = ?", [relPath]);
          saveProjectDb();
        } catch (_) {
        }
      })
    );
    console.log("[PK] File watcher established");
  } catch (e) {
    console.error("[PK] Failed to set up file watcher:", e.message);
  }
}
var BINARY_EXTS = {
  ".png": 1,
  ".jpg": 1,
  ".jpeg": 1,
  ".gif": 1,
  ".ico": 1,
  ".svg": 1,
  ".webp": 1,
  ".bmp": 1,
  ".mp3": 1,
  ".mp4": 1,
  ".wav": 1,
  ".ogg": 1,
  ".zip": 1,
  ".tar": 1,
  ".gz": 1,
  ".rar": 1,
  ".7z": 1,
  ".pdf": 1,
  ".doc": 1,
  ".docx": 1,
  ".xls": 1,
  ".xlsx": 1,
  ".ppt": 1,
  ".pptx": 1,
  ".exe": 1,
  ".dll": 1,
  ".so": 1,
  ".dylib": 1,
  ".wasm": 1,
  ".o": 1,
  ".a": 1,
  ".lib": 1,
  ".class": 1,
  ".pyc": 1,
  ".pyd": 1,
  ".ttf": 1,
  ".otf": 1,
  ".woff": 1,
  ".woff2": 1,
  ".eot": 1,
  ".map": 1
};
function isBinaryExtension(filename) {
  if (filename.endsWith(".min.js") || filename.endsWith(".min.css")) return true;
  return !!BINARY_EXTS[path.extname(filename).toLowerCase()];
}
function langFromExt(ext) {
  var map = {
    ".js": "javascript",
    ".ts": "typescript",
    ".jsx": "javascript",
    ".tsx": "typescript",
    ".py": "python",
    ".rb": "ruby",
    ".java": "java",
    ".go": "go",
    ".rs": "rust",
    ".c": "c",
    ".cpp": "cpp",
    ".h": "c-header",
    ".hpp": "cpp-header",
    ".cs": "csharp",
    ".swift": "swift",
    ".kt": "kotlin",
    ".scala": "scala",
    ".php": "php",
    ".html": "html",
    ".css": "css",
    ".scss": "scss",
    ".less": "less",
    ".json": "json",
    ".xml": "xml",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".md": "markdown",
    ".sql": "sql",
    ".sh": "bash",
    ".bash": "bash",
    ".zsh": "bash",
    ".ps1": "powershell",
    ".dockerfile": "dockerfile",
    ".tf": "terraform",
    ".ini": "ini",
    ".cfg": "ini",
    ".conf": "ini",
    ".env": "dotenv",
    ".gitignore": "ignore",
    ".eslintrc": "json"
  };
  return map[ext] || "text";
}
function simpleHash(text) {
  var hash = 0;
  if (!text || !text.length) return String(hash);
  var len = Math.min(text.length, 1e4);
  for (var i = 0; i < len; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return String(Math.abs(hash));
}

// src/contextManager.js
var vscode2 = __toESM(require("vscode"), 1);

// src/searchManager.js
var fs2 = __toESM(require("fs/promises"), 1);
var import_fs2 = require("fs");
var path2 = __toESM(require("path"), 1);
async function searchFiles(pattern, rootDir, subDir) {
  if (!pattern || !rootDir) return [];
  var likePattern = pattern.replace(/\*\*/g, "*").replace(/\?/g, "_");
  var status = getIndexStatus();
  if (status.ready && status.indexed) {
    try {
      var sqlLike = patternToLike(likePattern);
      var results = searchByGlob(sqlLike, subDir || "");
      if (results && results.length) {
        return results;
      }
    } catch (_) {
    }
  }
  return await fallbackWalk(pattern, rootDir, subDir);
}
async function searchContent(query, rootDir) {
  if (!query || !rootDir) return [];
  var status = getIndexStatus();
  if (status.ready && status.indexed) {
    try {
      var results = searchChunks(query);
      if (results && results.length) {
        return results;
      }
    } catch (_) {
    }
  }
  return await fallbackGrep(query, rootDir);
}
function patternToLike(pattern) {
  var like = pattern;
  like = like.replace(/\*/g, "%");
  like = like.replace(/\?/g, "_");
  like = like.replace(/\./g, ".");
  like = like.replace(/^[.\\/]+/, "");
  if (!like.startsWith("%")) like = "%" + like;
  if (like.includes(".") && !like.endsWith("%")) like = like + "%";
  else if (!like.endsWith("%")) like = like + "%";
  return like;
}
async function fallbackWalk(pattern, rootDir, subDir) {
  var searchDir = subDir ? path2.join(rootDir, subDir) : rootDir;
  var matches = [];
  function globToRegex(pat) {
    var escaped = pat.replace(/[-[\]{}()+?.,\^$|#\s]/g, "\\$&");
    var wildcards = escaped.replace(/\*/g, ".*").replace(/\?/g, ".");
    return new RegExp("^" + wildcards + "$", "i");
  }
  var regex = globToRegex(pattern);
  async function walk(dir) {
    try {
      var list = await fs2.readdir(dir, { withFileTypes: true });
      for (var i = 0; i < list.length; i++) {
        var item = list[i];
        var fullPath = path2.resolve(dir, item.name);
        if (item.isDirectory()) {
          if (item.name === "node_modules" || item.name === ".git" || item.name === ".venv" || item.name === "__pycache__") continue;
          if (item.name.startsWith(".")) continue;
          await walk(fullPath);
        } else {
          if (regex.test(item.name)) {
            matches.push(path2.relative(searchDir, fullPath));
          }
        }
      }
    } catch (_) {
    }
  }
  if ((0, import_fs2.existsSync)(searchDir)) await walk(searchDir);
  if (matches.length) {
    for (var m = 0; m < matches.length; m++) {
      var relPath = subDir ? path2.join(subDir, matches[m]) : matches[m];
      touchFile(relPath).catch(function() {
      });
    }
  }
  return matches;
}
var GREP_BINARY_EXTS = {
  ".png": 1,
  ".jpg": 1,
  ".jpeg": 1,
  ".gif": 1,
  ".ico": 1,
  ".svg": 1,
  ".webp": 1,
  ".bmp": 1,
  ".mp3": 1,
  ".mp4": 1,
  ".wav": 1,
  ".ogg": 1,
  ".zip": 1,
  ".tar": 1,
  ".gz": 1,
  ".rar": 1,
  ".7z": 1,
  ".pdf": 1,
  ".doc": 1,
  ".docx": 1,
  ".xls": 1,
  ".xlsx": 1,
  ".exe": 1,
  ".dll": 1,
  ".so": 1,
  ".dylib": 1,
  ".wasm": 1,
  ".o": 1,
  ".a": 1,
  ".lib": 1,
  ".class": 1,
  ".pyc": 1,
  ".pyd": 1,
  ".ttf": 1,
  ".otf": 1,
  ".woff": 1,
  ".woff2": 1,
  ".eot": 1
};
async function fallbackGrep(query, rootDir) {
  var results = [];
  var lowerQuery = query.toLowerCase();
  async function walk(dir) {
    try {
      var entries = await fs2.readdir(dir, { withFileTypes: true });
      for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        var fullPath = path2.resolve(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".venv" || entry.name.startsWith(".")) continue;
          await walk(fullPath);
        } else {
          var ext = path2.extname(entry.name).toLowerCase();
          if (GREP_BINARY_EXTS[ext]) continue;
          try {
            var content = await fs2.readFile(fullPath, "utf-8");
            var lowerContent = content.toLowerCase();
            var idx = lowerContent.indexOf(lowerQuery);
            if (idx !== -1) {
              var start = Math.max(0, idx - 40);
              var end = Math.min(content.length, idx + query.length + 40);
              var snippet = content.substring(start, end).replace(/\n/g, " ");
              var relPath = path2.relative(rootDir, fullPath);
              results.push({
                path: relPath,
                matches: (lowerContent.match(new RegExp(lowerQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length,
                snippet: "..." + snippet + "..."
              });
            }
          } catch (_) {
          }
        }
      }
    } catch (_) {
    }
  }
  await walk(rootDir);
  results.sort(function(a, b) {
    return b.matches - a.matches;
  });
  return results.slice(0, 20);
}

// src/planningManager.js
function getSessionPlans(sessionId) {
  var plans = getPlansBySession(sessionId);
  return plans || [];
}
function getActivePlansContext() {
  var plans = getPlansByStatus("draft");
  var active = getPlansByStatus("active");
  var allPlans = (plans || []).concat(active || []);
  if (!allPlans.length) return "";
  var lines = ["## EXISTING PLANS"];
  for (var i = 0; i < allPlans.length; i++) {
    var p = allPlans[i];
    lines.push("");
    lines.push("---");
    lines.push("Plan: " + p.id);
    lines.push("Goal: " + p.goal);
    lines.push("Status: " + p.status);
    lines.push("Steps (" + (p.steps ? p.steps.length : 0) + "):");
    if (p.steps) {
      for (var s = 0; s < p.steps.length; s++) {
        var step = p.steps[s];
        lines.push("  " + step.order + ". " + step.action + ": " + step.description);
      }
    }
    if (p.risks && p.risks.length) {
      lines.push("Risks: " + p.risks.join(", "));
    }
  }
  return lines.join("\n");
}
async function storePlan(plan) {
  try {
    var stepsJson = JSON.stringify(plan.steps || []);
    var filesJson = JSON.stringify(plan.required_files || []);
    var risksJson = JSON.stringify(plan.risks || []);
    setSetting("plan_" + plan.id + "_goal", plan.goal);
    setSetting("plan_" + plan.id + "_session", plan.session_id);
    setSetting("plan_" + plan.id + "_steps", stepsJson);
    setSetting("plan_" + plan.id + "_files", filesJson);
    setSetting("plan_" + plan.id + "_risks", risksJson);
    setSetting("plan_" + plan.id + "_estimated", String(plan.estimated_calls));
    setSetting("plan_" + plan.id + "_status", plan.status);
    setSetting("plan_" + plan.id + "_created", String(plan.created_at));
    addTask({
      id: plan.id,
      description: plan.goal,
      status: plan.status,
      created_at: plan.created_at,
      session_id: plan.session_id,
      result: JSON.stringify({ steps: plan.steps, files: plan.required_files })
    });
  } catch (_) {
  }
}

// src/learningManager.js
var path3 = __toESM(require("path"), 1);
var fs3 = __toESM(require("fs/promises"), 1);
var import_fs3 = require("fs");
async function initialize2(workspace6) {
  if (!workspace6) return;
  console.log("[LEARN] Initializing learning engine for", workspace6);
  if (!getSetting("learn_framework_detected")) {
    await detectFramework(workspace6);
  }
  if (!getSetting("learn_conventions_detected")) {
    await detectConventions(workspace6);
  }
  if (!getSetting("learn_important_files_detected")) {
    await identifyImportantFiles(workspace6);
  }
  console.log("[LEARN] Learning initialized");
}
function getLearningContext() {
  var parts = [];
  var framework = getSetting("learn_framework");
  if (framework) {
    parts.push("## PROJECT LEARNING");
    parts.push("Framework: " + framework);
  }
  var buildSystem = getSetting("learn_build_system");
  if (buildSystem) parts.push("Build System: " + buildSystem);
  var conventions = getSetting("learn_conventions");
  if (conventions) {
    try {
      var convList = JSON.parse(conventions);
      if (convList && convList.length) {
        parts.push("Conventions: " + convList.join(", "));
      }
    } catch (_) {
    }
  }
  var importantFiles = getSetting("learn_important_files");
  if (importantFiles) {
    try {
      var fileList = JSON.parse(importantFiles);
      if (fileList && fileList.length) {
        parts.push("Key Files: " + fileList.join(", "));
      }
    } catch (_) {
    }
  }
  var commands4 = getSetting("learn_frequent_commands");
  if (commands4) {
    try {
      var cmdList = JSON.parse(commands4);
      if (cmdList && cmdList.length) {
        parts.push("Frequent Commands: " + cmdList.slice(0, 5).join(" | "));
      }
    } catch (_) {
    }
  }
  var architecture = getSetting("learn_architecture");
  if (architecture) {
    parts.push("Architecture: " + architecture);
  }
  return parts.length > 1 ? parts.join("\n") : "";
}
function recordToolUsage(toolName, command) {
  var key = "learn_usage_" + toolName;
  var count = Number(getSetting(key) || 0);
  setSetting(key, String(count + 1));
  if (command && command.length > 5) {
    var cmdKey = "learn_cmd_" + simpleHash2(command);
    var cmdCount = Number(getSetting(cmdKey) || 0);
    setSetting(cmdKey, String(cmdCount + 1));
  }
}
async function detectFramework(workspace6) {
  var framework = "unknown";
  var buildSystem = "unknown";
  var pkgPath = path3.join(workspace6, "package.json");
  if ((0, import_fs3.existsSync)(pkgPath)) {
    buildSystem = "npm";
    try {
      var pkgRaw = await fs3.readFile(pkgPath, "utf-8");
      var pkg = JSON.parse(pkgRaw);
      var deps = Object.assign({}, pkg.dependencies || {}, pkg.devDependencies || {});
      if (deps.next) framework = "Next.js";
      else if (deps.react) framework = "React";
      else if (deps.vue) framework = "Vue";
      else if (deps.angular || deps["@angular/core"]) framework = "Angular";
      else if (deps.express) framework = "Express";
      else if (deps["@nestjs/core"]) framework = "NestJS";
      else if (deps.svelte) framework = "Svelte";
      else if (deps.electron) framework = "Electron";
      else if (pkg.scripts && (pkg.scripts.build || pkg.scripts.start)) framework = "Node.js";
      else framework = "JavaScript/Node.js";
      if (deps.typescript) buildSystem = "npm + TypeScript";
      if (deps.vite || pkg.devDependencies?.vite) buildSystem = "Vite";
      if (deps.webpack || pkg.devDependencies?.webpack) buildSystem += " + Webpack";
      if (deps.esbuild || pkg.devDependencies?.esbuild) buildSystem += " + ESBuild";
    } catch (_) {
    }
  }
  if ((0, import_fs3.existsSync)(path3.join(workspace6, "pom.xml"))) {
    framework = (0, import_fs3.existsSync)(path3.join(workspace6, "src/main/java")) ? "Java/Spring" : "Java/Maven";
    buildSystem = "Maven";
  }
  if ((0, import_fs3.existsSync)(path3.join(workspace6, "build.gradle")) || (0, import_fs3.existsSync)(path3.join(workspace6, "build.gradle.kts"))) {
    framework = (0, import_fs3.existsSync)(path3.join(workspace6, "settings.gradle")) ? "Java/Gradle" : "Kotlin/Gradle";
    buildSystem = "Gradle";
  }
  if ((0, import_fs3.existsSync)(path3.join(workspace6, "requirements.txt")) || (0, import_fs3.existsSync)(path3.join(workspace6, "pyproject.toml"))) {
    try {
      var entries = await fs3.readdir(workspace6, { withFileTypes: true });
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].name.endsWith(".py")) {
          var pyContent = await fs3.readFile(path3.join(workspace6, entries[i].name), "utf-8");
          if (pyContent.includes("from django") || pyContent.includes("import django")) {
            framework = "Django";
            break;
          }
          if (pyContent.includes("from flask") || pyContent.includes("import flask")) {
            framework = "Flask";
            break;
          }
          if (pyContent.includes("from fastapi") || pyContent.includes("import fastapi")) {
            framework = "FastAPI";
            break;
          }
        }
      }
    } catch (_) {
    }
    if (framework === "unknown") framework = "Python";
    buildSystem = "pip";
  }
  if ((0, import_fs3.existsSync)(path3.join(workspace6, "Cargo.toml"))) {
    framework = "Rust";
    buildSystem = "Cargo";
  }
  if ((0, import_fs3.existsSync)(path3.join(workspace6, "go.mod"))) {
    framework = "Go";
    buildSystem = "Go Modules";
  }
  if ((0, import_fs3.existsSync)(path3.join(workspace6, "*.sln")) || (0, import_fs3.existsSync)(path3.join(workspace6, "*.csproj"))) {
    framework = "C#/.NET";
    buildSystem = "dotnet";
  }
  setSetting("learn_framework", framework);
  setSetting("learn_build_system", buildSystem);
  setSetting("learn_framework_detected", "true");
  console.log("[LEARN] Detected framework:", framework, "| build:", buildSystem);
}
async function detectConventions(workspace6) {
  var conventions = [];
  var architecture = "";
  var hasTsConfig = (0, import_fs3.existsSync)(path3.join(workspace6, "tsconfig.json"));
  if (hasTsConfig) conventions.push("TypeScript");
  if ((0, import_fs3.existsSync)(path3.join(workspace6, ".eslintrc")) || (0, import_fs3.existsSync)(path3.join(workspace6, ".eslintrc.json")) || (0, import_fs3.existsSync)(path3.join(workspace6, ".eslintrc.js"))) {
    conventions.push("ESLint");
  }
  if ((0, import_fs3.existsSync)(path3.join(workspace6, ".prettierrc")) || (0, import_fs3.existsSync)(path3.join(workspace6, ".prettierrc.json")) || (0, import_fs3.existsSync)(path3.join(workspace6, ".prettierrc.js"))) {
    conventions.push("Prettier");
  }
  var hasTestsDir = (0, import_fs3.existsSync)(path3.join(workspace6, "__tests__")) || (0, import_fs3.existsSync)(path3.join(workspace6, "test")) || (0, import_fs3.existsSync)(path3.join(workspace6, "tests"));
  if (hasTestsDir) conventions.push("Has test suite");
  if ((0, import_fs3.existsSync)(path3.join(workspace6, "src/pages"))) architecture = "Pages router";
  else if ((0, import_fs3.existsSync)(path3.join(workspace6, "src/app"))) architecture = "App router";
  else if ((0, import_fs3.existsSync)(path3.join(workspace6, "src/components")) && (0, import_fs3.existsSync)(path3.join(workspace6, "src/views"))) architecture = "Component/View";
  else if ((0, import_fs3.existsSync)(path3.join(workspace6, "src/controllers")) || (0, import_fs3.existsSync)(path3.join(workspace6, "src/controllers"))) architecture = "MVC";
  else if ((0, import_fs3.existsSync)(path3.join(workspace6, "src/services")) || (0, import_fs3.existsSync)(path3.join(workspace6, "src/services"))) architecture = "Service-oriented";
  if (conventions.length) {
    setSetting("learn_conventions", JSON.stringify(conventions));
  }
  if (architecture) {
    setSetting("learn_architecture", architecture);
  }
  setSetting("learn_conventions_detected", "true");
  console.log("[LEARN] Conventions:", conventions, "| Architecture:", architecture);
}
async function identifyImportantFiles(workspace6) {
  var importantFiles = [];
  var configCandidates = [
    "package.json",
    "tsconfig.json",
    ".env",
    ".env.example",
    "docker-compose.yml",
    "docker-compose.yaml",
    "Dockerfile",
    "webpack.config.js",
    "vite.config.js",
    "vite.config.ts",
    "next.config.js",
    "next.config.ts",
    "tailwind.config.js",
    ".eslintrc.js",
    ".eslintrc.json",
    ".prettierrc",
    "jest.config.js",
    "pom.xml",
    "build.gradle",
    "build.gradle.kts",
    "settings.gradle",
    "Cargo.toml",
    "go.mod",
    "requirements.txt",
    "pyproject.toml",
    "Makefile",
    "CMakeLists.txt",
    "Gemfile",
    "Podfile"
  ];
  for (var i = 0; i < configCandidates.length; i++) {
    if ((0, import_fs3.existsSync)(path3.join(workspace6, configCandidates[i]))) {
      importantFiles.push(configCandidates[i]);
    }
  }
  var entryCandidates = [
    "src/index.js",
    "src/index.ts",
    "src/main.js",
    "src/main.ts",
    "src/app.js",
    "src/app.ts",
    "index.js",
    "index.ts",
    "app.js",
    "main.py",
    "app.py",
    "cli.py",
    "Main.java",
    "main.go",
    "src/main/java/**/Application.java",
    "Program.cs"
  ];
  for (var j = 0; j < entryCandidates.length; j++) {
    var entryPath = path3.join(workspace6, entryCandidates[j]);
    if (entryCandidates[j].includes("*")) continue;
    if ((0, import_fs3.existsSync)(entryPath)) {
      importantFiles.push(entryCandidates[j]);
    }
  }
  if (importantFiles.length) {
    setSetting("learn_important_files", JSON.stringify(importantFiles));
  }
  setSetting("learn_important_files_detected", "true");
  console.log("[LEARN] Identified", importantFiles.length, "important files");
}
function simpleHash2(text) {
  var hash = 0;
  if (!text) return String(hash);
  for (var i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return "h" + String(Math.abs(hash));
}

// src/timelineManager.js
var TIMELINE_KEY = "timeline_data";
var MAX_ENTRIES = 50;
function addEvent(type, summary) {
  if (!type || !summary) return;
  var entries = loadEntries();
  entries.push({
    type,
    summary: String(summary).substring(0, 120),
    ts: Date.now()
  });
  if (entries.length > MAX_ENTRIES) {
    entries = entries.slice(entries.length - MAX_ENTRIES);
  }
  saveEntries(entries);
}
function addToolEvent(toolName, args, success, message) {
  var target = args.file_path || args.command || args.pattern || "";
  var summary = toolName + ": " + String(target).substring(0, 80);
  if (success !== false) {
    addEvent("tool:result", summary);
  } else {
    addEvent("tool:error", summary + " \u2014 " + String(message || "failed").substring(0, 60));
  }
  if (toolName === "write_file" || toolName === "edit_file") {
    addEvent("file:" + (toolName === "write_file" ? "write" : "edit"), args.file_path || "");
  } else if (toolName === "delete_file") {
    addEvent("file:delete", args.file_path || "");
  } else if (toolName === "read_file") {
    addEvent("file:read", args.file_path || "");
  } else if (toolName === "run_terminal") {
    addEvent("terminal:run", "$ " + String(args.command || "").substring(0, 80));
  } else if (toolName === "list_directory") {
    addEvent("tool:result", "Listed: " + (args.folder_path || "."));
  } else if (toolName === "search_files") {
    addEvent("tool:result", "Searched: " + (args.pattern || "*"));
  }
}
function getRecentContext(limit) {
  limit = limit || 8;
  var entries = getRecent(limit);
  if (!entries.length) return "";
  var lines = ["## RECENT TIMELINE"];
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    var time = new Date(e.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    var icon = getEventIcon(e.type);
    lines.push("  [" + time + "] " + icon + " " + e.summary);
  }
  return lines.join("\n");
}
function getRecent(limit) {
  limit = limit || 10;
  var entries = loadEntries();
  var result = [];
  for (var i = entries.length - 1; i >= 0 && result.length < limit; i--) {
    result.push(entries[i]);
  }
  return result;
}
function loadEntries() {
  var raw = getSetting(TIMELINE_KEY);
  if (!raw) return [];
  try {
    var parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch (_) {
    return [];
  }
}
function saveEntries(entries) {
  setSetting(TIMELINE_KEY, JSON.stringify(entries));
}
function getEventIcon(type) {
  if (!type) return "\u2022";
  if (type.startsWith("tool:result")) return "\u2713";
  if (type.startsWith("tool:error")) return "\u2717";
  if (type.startsWith("file:write")) return "+";
  if (type.startsWith("file:edit")) return "\u223C";
  if (type.startsWith("file:delete")) return "\u2212";
  if (type.startsWith("file:read")) return "\u2192";
  if (type.startsWith("terminal:run")) return "$";
  if (type.startsWith("session:start")) return "\u25B6";
  if (type === "error") return "\u203C";
  return "\u2022";
}

// src/checkpointManager.js
var fs4 = __toESM(require("fs/promises"), 1);
var import_fs4 = require("fs");
var path4 = __toESM(require("path"), 1);
var MAX_CHECKPOINTS = 100;
async function createCheckpoint(filePath, workspace6, sessionId, label) {
  if (!filePath || !workspace6) return null;
  var fullPath = path4.join(workspace6, filePath);
  var content = "";
  if ((0, import_fs4.existsSync)(fullPath)) {
    try {
      content = await fs4.readFile(fullPath, "utf-8");
    } catch (_) {
      content = "";
    }
  }
  var id = "cp_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
  addCheckpoint({
    id,
    file_path: filePath,
    content,
    created_at: Date.now(),
    session_id: sessionId || "session_unknown",
    label: label || "Edit: " + filePath
  });
  trimCheckpoints();
  return id;
}
async function undoFile(filePath, workspace6, sessionId) {
  if (!filePath || !workspace6) {
    return { success: false, message: "No file path or workspace specified" };
  }
  var checkpoints = getCheckpoints(filePath, sessionId);
  if (!checkpoints || !checkpoints.length) {
    return { success: false, message: "No checkpoints found for: " + filePath };
  }
  var cp = checkpoints[0];
  var fullPath = path4.join(workspace6, filePath);
  try {
    if (cp.content) {
      await fs4.mkdir(path4.dirname(fullPath), { recursive: true });
      await fs4.writeFile(fullPath, cp.content, "utf-8");
    } else {
      if ((0, import_fs4.existsSync)(fullPath)) {
        await fs4.unlink(fullPath);
      }
    }
    deleteCheckpoint(cp.id);
    return {
      success: true,
      message: "Undid: " + (cp.label || "edit to " + filePath),
      restoredContent: cp.content
    };
  } catch (e) {
    return { success: false, message: "Failed to undo: " + e.message };
  }
}
async function undoLast(workspace6, sessionId) {
  var all = getRecentCheckpoints(sessionId, 1);
  if (!all || !all.length) {
    return { success: false, message: "No checkpoints to undo" };
  }
  return await undoFile(all[0].file_path, workspace6, sessionId);
}
function getCheckpointContext(limit) {
  limit = limit || 3;
  var all = getRecentCheckpoints(null, limit);
  if (!all || !all.length) return "";
  var lines = ["## RECENT CHECKPOINTS"];
  for (var i = 0; i < all.length; i++) {
    var cp = all[i];
    var time = new Date(cp.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    lines.push("  [" + time + "] " + (cp.label || cp.file_path));
  }
  return lines.join("\n");
}
function trimCheckpoints() {
  try {
    var stats = getCheckpointStats();
    if (stats && stats.total > MAX_CHECKPOINTS) {
      var excess = stats.total - MAX_CHECKPOINTS;
      trimOldestCheckpoints(excess);
    }
  } catch (_) {
  }
}

// src/contextManager.js
async function gatherContext(userPrompt, workspace6) {
  var intent = analyzeIntent(userPrompt);
  var editor = getEditorContext();
  var project = getProjectMetadata2();
  var relevantFiles = [];
  var suggestedTools = [];
  if (intent.needsFiles && project.indexed) {
    relevantFiles = await searchRelevantFiles(userPrompt, workspace6);
  }
  suggestedTools = suggestTools(intent, project.indexed);
  var knowledge = buildKnowledge(project, editor, relevantFiles, intent);
  return {
    intent,
    editor,
    project,
    relevantFiles,
    suggestedTools,
    knowledge
  };
}
function analyzeIntent(prompt) {
  var lower = String(prompt || "").toLowerCase();
  if (lower.includes("create") || lower.includes("generate") || lower.includes("add") || lower.includes("implement") || lower.includes("write") || lower.includes("new file") || lower.includes("component") || lower.includes("function that")) {
    return {
      type: "code_generation",
      description: "User wants to generate or create new code",
      needsFiles: true,
      needsContent: false
    };
  }
  if (lower.includes("refactor") || lower.includes("rename") || lower.includes("change") || lower.includes("update") || lower.includes("fix") || lower.includes("modify") || lower.includes("improve") || lower.includes("migrate") || lower.includes("convert")) {
    return {
      type: "refactoring",
      description: "User wants to modify existing code",
      needsFiles: true,
      needsContent: true
    };
  }
  if (lower.includes("debug") || lower.includes("error") || lower.includes("bug") || lower.includes("issue") || lower.includes("not working") || lower.includes("failing") || lower.includes("broken") || lower.includes("wrong") || lower.includes("incorrect")) {
    return {
      type: "debugging",
      description: "User wants to diagnose an issue",
      needsFiles: true,
      needsContent: true
    };
  }
  if (lower.includes("what") || lower.includes("how") || lower.includes("explain") || lower.includes("where") || lower.includes("find") || lower.includes("search") || lower.includes("show me") || lower.includes("list") || lower.includes("tell me about") || lower.includes("understand") || lower.includes("structure")) {
    return {
      type: "exploration",
      description: "User wants to understand the codebase",
      needsFiles: true,
      needsContent: true
    };
  }
  if (lower.includes("test") || lower.includes("coverage") || lower.includes("lint") || lower.includes("validate") || lower.includes("verify") || lower.includes("check")) {
    return {
      type: "testing",
      description: "User wants to run or write tests",
      needsFiles: true,
      needsContent: false
    };
  }
  if (lower.includes("build") || lower.includes("compile") || lower.includes("install") || lower.includes("run") || lower.includes("deploy") || lower.includes("npm") || lower.includes("gradle") || lower.includes("maven") || lower.includes("docker")) {
    return {
      type: "build",
      description: "User wants to build, install, or run commands",
      needsFiles: false,
      needsContent: false
    };
  }
  if (lower.includes("compare") || lower.includes("difference") || lower.includes("vs ") || lower.includes("versus") || lower.includes("best practice") || lower.includes("recommend") || lower.includes("should i use")) {
    return {
      type: "general",
      description: "General knowledge or comparison question",
      needsFiles: false,
      needsContent: false
    };
  }
  return {
    type: "general",
    description: "General user request",
    needsFiles: false,
    needsContent: false
  };
}
function getEditorContext() {
  var result = {
    activeFile: "",
    cursorLine: 0,
    cursorColumn: 0,
    selectedText: "",
    openEditors: []
  };
  try {
    var editor = vscode2.window.activeTextEditor;
    if (editor) {
      result.activeFile = editor.document.uri.fsPath || "";
      var selection = editor.selection;
      if (selection) {
        result.cursorLine = selection.active.line + 1;
        result.cursorColumn = selection.active.character + 1;
        if (!selection.isEmpty) {
          result.selectedText = editor.document.getText(selection);
        }
      }
    }
    var tabs = vscode2.window.tabGroups ? vscode2.window.tabGroups.all : [];
    var seen = {};
    for (var g = 0; g < tabs.length; g++) {
      var tabGroup = tabs[g];
      for (var t = 0; t < tabGroup.tabs.length; t++) {
        var tab = tabGroup.tabs[t];
        var input = tab.input;
        if (input && input.uri && input.uri.fsPath) {
          var fp = input.uri.fsPath;
          if (!seen[fp]) {
            seen[fp] = true;
            result.openEditors.push(fp);
          }
        }
      }
    }
  } catch (_) {
  }
  return result;
}
function getProjectMetadata2() {
  var meta = getProjectMetadata();
  var status = getIndexStatus ? getIndexStatus() : { ready: false, indexed: false };
  var stats = getStats();
  return {
    name: meta ? meta.name : "unknown",
    path: meta ? meta.path : "",
    fileCount: stats.tables && stats.tables.files ? Number(stats.tables.files) : 0,
    ready: status.ready,
    indexed: status.indexed
  };
}
async function searchRelevantFiles(prompt, workspace6) {
  var relevant = [];
  var keywords = extractKeywords(prompt);
  if (!keywords.length) return [];
  var seen = {};
  var maxResults = 10;
  for (var k = 0; k < keywords.length && relevant.length < maxResults; k++) {
    try {
      var results = searchByGlob("%" + keywords[k] + "%", "");
      if (results && results.length) {
        for (var r = 0; r < results.length; r++) {
          if (!seen[results[r]]) {
            seen[results[r]] = true;
            relevant.push(results[r]);
            if (relevant.length >= maxResults) break;
          }
        }
      }
    } catch (_) {
    }
    if (relevant.length < 3) {
      try {
        var contentResults = searchChunks(keywords[k]);
        if (contentResults && contentResults.length) {
          for (var cr = 0; cr < contentResults.length; cr++) {
            if (!seen[contentResults[cr].path]) {
              seen[contentResults[cr].path] = true;
              relevant.push(contentResults[cr].path);
              if (relevant.length >= maxResults) break;
            }
          }
        }
      } catch (_) {
      }
    }
  }
  return relevant.slice(0, maxResults);
}
function extractKeywords(text) {
  var words = String(text || "").toLowerCase().split(/[^a-zA-Z0-9_]+/).filter(Boolean);
  var STOP_WORDS = {
    "the": 1,
    "a": 1,
    "an": 1,
    "is": 1,
    "are": 1,
    "was": 1,
    "were": 1,
    "be": 1,
    "been": 1,
    "being": 1,
    "have": 1,
    "has": 1,
    "had": 1,
    "do": 1,
    "does": 1,
    "did": 1,
    "will": 1,
    "would": 1,
    "could": 1,
    "should": 1,
    "may": 1,
    "might": 1,
    "can": 1,
    "shall": 1,
    "to": 1,
    "of": 1,
    "in": 1,
    "for": 1,
    "on": 1,
    "with": 1,
    "at": 1,
    "by": 1,
    "from": 1,
    "as": 1,
    "into": 1,
    "through": 1,
    "during": 1,
    "before": 1,
    "after": 1,
    "above": 1,
    "below": 1,
    "up": 1,
    "down": 1,
    "out": 1,
    "off": 1,
    "over": 1,
    "under": 1,
    "again": 1,
    "further": 1,
    "then": 1,
    "once": 1,
    "here": 1,
    "there": 1,
    "when": 1,
    "where": 1,
    "why": 1,
    "how": 1,
    "all": "1",
    "each": 1,
    "every": 1,
    "both": 1,
    "few": 1,
    "more": 1,
    "most": 1,
    "other": 1,
    "some": 1,
    "such": 1,
    "no": 1,
    "nor": 1,
    "not": 1,
    "only": 1,
    "own": 1,
    "same": 1,
    "so": 1,
    "than": 1,
    "too": 1,
    "very": 1,
    "just": 1,
    "also": 1,
    "because": 1,
    "but": 1,
    "and": 1,
    "or": 1,
    "if": 1,
    "while": 1,
    "that": 1,
    "this": 1,
    "these": 1,
    "those": 1,
    "it": 1,
    "its": 1,
    "my": 1,
    "your": 1,
    "our": 1,
    "their": 1,
    "me": 1,
    "you": 1,
    "we": 1,
    "they": 1,
    "he": 1,
    "she": 1,
    "him": 1,
    "her": 1,
    "them": 1,
    "about": 1,
    "which": 1,
    "who": 1,
    "what": 1,
    "please": 1,
    "help": 1,
    "need": 1,
    "want": 1,
    "like": 1,
    "make": 1,
    "get": 1,
    "use": 1,
    "using": 1,
    "used": 1,
    "see": 1,
    "look": 1,
    "tell": 1,
    "let": 1,
    "know": 1,
    "think": 1,
    "try": 1,
    "going": 1,
    "go": 1,
    "come": 1,
    "take": 1,
    "give": 1,
    "find": 1,
    "new": 1,
    "any": 1,
    "something": 1,
    "thing": 1,
    "file": 1,
    "code": 1,
    "function": 1,
    "class": 1,
    "method": 1,
    "variable": 1,
    "project": 1,
    "workspace": 1,
    "folder": 1,
    "directory": 1
  };
  var result = [];
  for (var i = 0; i < words.length; i++) {
    var w = words[i];
    if (w.length < 3) continue;
    if (w.length > 30) continue;
    if (STOP_WORDS[w]) continue;
    if (/^\d+$/.test(w)) continue;
    result.push(w);
  }
  var unique = [];
  var seen = {};
  for (var j = 0; j < result.length && unique.length < 5; j++) {
    if (!seen[result[j]]) {
      seen[result[j]] = true;
      unique.push(result[j]);
    }
  }
  return unique;
}
function suggestTools(intent, isIndexed) {
  var tools = [];
  if (intent.needsFiles && isIndexed) {
    tools.push("search_files (use the project index)");
    tools.push("find_in_files (search file contents)");
  }
  if (intent.needsFiles && !isIndexed) {
    tools.push("search_files (filesystem fallback \u2014 index not yet ready)");
    tools.push("list_directory (explore project structure)");
  }
  if (intent.type === "build") {
    tools.push("run_terminal");
  }
  if (intent.type === "testing") {
    tools.push("run_terminal");
    tools.push("find_in_files (find test files)");
  }
  return tools;
}
function buildKnowledge(project, editor, relevantFiles, intent) {
  var knowledge = {};
  knowledge.projectMetadata = {
    name: project.name,
    path: project.path || "",
    fileCount: project.fileCount,
    ready: project.ready
  };
  knowledge.fileCount = project.fileCount;
  knowledge.fileContext = project.indexed;
  if (relevantFiles && relevantFiles.length) {
    knowledge.relevantFiles = relevantFiles;
  }
  if (editor.activeFile) {
    var editorLines = ["## OPEN EDITOR"];
    editorLines.push("- Active file: " + editor.activeFile);
    editorLines.push("- Cursor: line " + editor.cursorLine + ", column " + editor.cursorColumn);
    if (editor.selectedText) {
      var selPreview = editor.selectedText.substring(0, 200);
      editorLines.push('- Selected text: "' + selPreview + '"');
    }
    if (editor.openEditors && editor.openEditors.length > 1) {
      editorLines.push("- Open tabs:");
      for (var e = 0; e < editor.openEditors.length; e++) {
        editorLines.push("  - " + editor.openEditors[e]);
      }
    }
    knowledge.editorContext = editorLines.join("\n");
  }
  var intentLines = ["## INTENT ANALYSIS"];
  intentLines.push("- Type: " + intent.type);
  intentLines.push("- Description: " + intent.description);
  if (intent.needsFiles) {
    intentLines.push("- The user likely needs to work with specific files");
  }
  if (intent.needsContent) {
    intentLines.push("- The user likely needs to understand or modify code contents");
  }
  knowledge.intentContext = intentLines.join("\n");
  var suggestedToolsList = suggestTools(intent, project.indexed);
  if (suggestedToolsList.length) {
    var toolLines = ["## SUGGESTED TOOLS"];
    for (var t = 0; t < suggestedToolsList.length; t++) {
      toolLines.push("- " + suggestedToolsList[t]);
    }
    knowledge.suggestedTools = toolLines.join("\n");
  }
  try {
    var planContext = getActivePlansContext();
    if (planContext) {
      knowledge.activePlans = planContext;
    }
  } catch (_) {
  }
  try {
    var learningContext = getLearningContext();
    if (learningContext) {
      knowledge.learningContext = learningContext;
    }
  } catch (_) {
  }
  try {
    var meta = getProjectMetadata();
    if (meta && meta.path) {
      initialize2(meta.path);
    }
  } catch (_) {
  }
  try {
    var timelineCtx = getRecentContext(6);
    if (timelineCtx) {
      knowledge.timeline = timelineCtx;
    }
  } catch (_) {
    knowledge.timeline = "";
  }
  try {
    var cpCtx = getCheckpointContext(3);
    if (cpCtx) {
      knowledge.checkpointContext = cpCtx;
    }
  } catch (_) {
  }
  knowledge.projectMemory = "";
  knowledge.dependencyGraph = "";
  return knowledge;
}

// src/verificationManager.js
var fs5 = __toESM(require("fs/promises"), 1);
var import_fs5 = require("fs");
var path5 = __toESM(require("path"), 1);
async function verifyStep(stepResult, stepArgs, workspace6) {
  if (!stepResult) {
    return { verified: false, checks: [], issues: ["No step result to verify"] };
  }
  var checks = [];
  switch (stepArgs.action) {
    case "terminal":
    case "build":
    case "verify":
    case "test":
    case "install":
    case "run":
      checks = checks.concat(await verifyTerminalStep(stepResult, stepArgs));
      break;
    case "write":
      checks = checks.concat(await verifyWriteStep(stepResult, stepArgs, workspace6));
      break;
    case "edit":
      checks = checks.concat(await verifyEditStep(stepResult, stepArgs, workspace6));
      break;
    case "read":
      checks = checks.concat(verifyReadStep(stepResult));
      break;
    case "search":
      checks = checks.concat(verifySearchStep(stepResult));
      break;
    case "delete":
      checks = checks.concat(verifyDeleteStep(stepResult, stepArgs, workspace6));
      break;
    default:
      if (stepResult.error) {
        checks.push({ type: "no_errors", passed: false, detail: "Step returned error: " + stepResult.error });
      } else {
        checks.push({ type: "no_errors", passed: true, detail: "No errors" });
      }
      checks.push({ type: "status", passed: stepResult.status === "completed", detail: "Step status: " + stepResult.status });
      break;
  }
  var issues = checks.filter(function(c) {
    return !c.passed;
  }).map(function(c) {
    return c.type + ": " + c.detail;
  });
  var passedCount = checks.filter(function(c) {
    return c.passed;
  }).length;
  return {
    verified: issues.length === 0,
    checks,
    issues,
    summary: passedCount + "/" + checks.length + " checks passed"
  };
}
async function verifyTerminalStep(result, step) {
  var checks = [];
  if (result.error) {
    checks.push({ type: "exit_code", passed: false, detail: "Tool error: " + result.error });
  } else {
    checks.push({ type: "exit_code", passed: true, detail: "No tool error" });
  }
  var output = (result.output || "").toLowerCase();
  if (output) {
    var errorPatterns = ["error:", "failed", "failure", "cannot", "not found", "enoent", "command not found", "exit code"];
    var foundErrors = [];
    for (var i = 0; i < errorPatterns.length; i++) {
      if (output.includes(errorPatterns[i])) {
        foundErrors.push(errorPatterns[i]);
      }
    }
    if (foundErrors.length > 0) {
      checks.push({ type: "no_error_output", passed: false, detail: "Found error patterns in output: " + foundErrors.join(", ") });
    } else {
      checks.push({ type: "no_error_output", passed: true, detail: "No error patterns detected in output" });
    }
    checks.push({ type: "output_produced", passed: output.length > 10, detail: "Output length: " + output.length + " chars" });
  } else {
    checks.push({ type: "output_produced", passed: false, detail: "No output captured" });
  }
  return checks;
}
async function verifyWriteStep(result, step, workspace6) {
  var checks = [];
  var target = step.target || "";
  var filePath = target ? path5.join(workspace6, target) : "";
  if (filePath) {
    var exists = (0, import_fs5.existsSync)(filePath);
    checks.push({ type: "file_exists", passed: exists, detail: exists ? "File created: " + target : "File not found: " + target });
    if (exists) {
      try {
        var stat4 = await fs5.stat(filePath);
        checks.push({ type: "file_size", passed: stat4.size > 0, detail: "File size: " + stat4.size + " bytes" });
      } catch (_) {
        checks.push({ type: "file_size", passed: false, detail: "Could not stat file" });
      }
    }
  } else {
    checks.push({ type: "file_exists", passed: false, detail: "No target file path specified" });
  }
  return checks;
}
async function verifyEditStep(result, step, workspace6) {
  var checks = [];
  var target = step.target || "";
  var filePath = target ? path5.join(workspace6, target) : "";
  if (filePath) {
    var exists = (0, import_fs5.existsSync)(filePath);
    checks.push({ type: "file_exists", passed: exists, detail: exists ? "File exists: " + target : "File not found: " + target });
    if (exists) {
      try {
        var stat4 = await fs5.stat(filePath);
        checks.push({ type: "file_modified", passed: true, detail: "Last modified: " + stat4.mtime.toISOString() });
      } catch (_) {
        checks.push({ type: "file_modified", passed: false, detail: "Could not stat file" });
      }
    }
  } else {
    checks.push({ type: "file_exists", passed: false, detail: "No target file path specified" });
  }
  return checks;
}
function verifyReadStep(result) {
  var checks = [];
  var output = result.output || "";
  if (output.includes("File not found") || output.includes("Error:")) {
    checks.push({ type: "read_success", passed: false, detail: "Read returned error" });
  } else if (output.length > 0) {
    checks.push({ type: "read_success", passed: true, detail: "Content length: " + output.length + " chars" });
  } else {
    checks.push({ type: "read_success", passed: false, detail: "No content returned" });
  }
  return checks;
}
function verifySearchStep(result) {
  var checks = [];
  var output = result.output || "";
  if (output.includes("Matches: [")) {
    var matchCount = (output.match(/"/g) || []).length / 2;
    checks.push({ type: "search_results", passed: matchCount > 0, detail: "Found approximately " + Math.floor(matchCount) + " results" });
  } else if (output.includes("0 results") || output.includes("No matches")) {
    checks.push({ type: "search_results", passed: false, detail: "No matches found" });
  } else {
    checks.push({ type: "search_results", passed: output.length > 20, detail: "Output length: " + output.length + " chars" });
  }
  return checks;
}
function verifyDeleteStep(result, step, workspace6) {
  var checks = [];
  var target = step.target || "";
  var filePath = target ? path5.join(workspace6, target) : "";
  if (filePath) {
    var exists = (0, import_fs5.existsSync)(filePath);
    checks.push({ type: "file_deleted", passed: !exists, detail: exists ? "File still exists: " + target : "File successfully removed" });
  } else {
    checks.push({ type: "file_deleted", passed: false, detail: "No target file path specified" });
  }
  return checks;
}

// src/terminalManager.js
var vscode3 = __toESM(require("vscode"), 1);
var path6 = __toESM(require("path"), 1);
var import_child_process = require("child_process");
var activeTerminal = null;
var terminalListeners = [];
var pendingExecutions = {};
var executionCounter = 0;
var sendEventCallback = null;
var _lastSessionOutput = "";
var _lastSessionActive = false;
var _lastCheckedPosition = 0;
var activeExecId = null;
var _pendingInteractiveReader = null;
var _pendingInteractiveExecution = null;
function detectShellName(terminal) {
  try {
    var vscodeShell = vscode3.env.shell || "";
    if (vscodeShell) {
      var shellName = path6.basename(vscodeShell).toLowerCase();
      if (shellName.includes("powershell")) return "powershell";
      if (shellName.includes("pwsh")) return "powershell";
      if (shellName.includes("cmd")) return "cmd";
      if (shellName.includes("bash")) return "bash";
      if (shellName.includes("zsh")) return "zsh";
      if (shellName.includes("fish")) return "fish";
      if (shellName.includes("wsl")) return "wsl";
    }
  } catch (_) {
  }
  if (!terminal) return guessShellFromEnv();
  try {
    var creationOptions = terminal.creationOptions;
    if (creationOptions) {
      var shellPath = creationOptions.shellPath || "";
      if (shellPath) {
        var shellName = path6.basename(shellPath).toLowerCase();
        if (shellName.includes("powershell")) return "powershell";
        if (shellName.includes("pwsh")) return "powershell";
        if (shellName.includes("cmd")) return "cmd";
        if (shellName.includes("bash")) return "bash";
        if (shellName.includes("zsh")) return "zsh";
        if (shellName.includes("fish")) return "fish";
        if (shellName.includes("wsl")) return "wsl";
        return shellName.replace(/\.exe$/, "");
      }
    }
  } catch (_) {
  }
  return guessShellFromEnv();
}
function guessShellFromEnv() {
  var platform = process.platform;
  if (platform === "win32") {
    try {
      if (process.env.PSModulePath) return "powershell";
    } catch (_) {
    }
    if (process.env.SHELL) {
      var sh = path6.basename(process.env.SHELL).toLowerCase();
      if (sh.includes("bash")) return "bash (Git Bash)";
      if (sh.includes("zsh")) return "zsh";
    }
    try {
      var comspec = process.env.COMSPEC || "";
      if (comspec.toLowerCase().includes("cmd")) return "cmd";
    } catch (_) {
    }
    return "powershell";
  }
  if (platform === "darwin") {
    return process.env.SHELL ? path6.basename(process.env.SHELL) : "zsh";
  }
  if (process.env.WSL_DISTRO_NAME) return "wsl";
  return process.env.SHELL ? path6.basename(process.env.SHELL) : "bash";
}
function getPlatform() {
  var p = process.platform;
  if (p === "win32") return "windows";
  if (p === "darwin") return "macos";
  return "linux";
}
function stripAnsi(text) {
  if (!text) return "";
  var cleaned = text.replace(/\x1B\]\d+(?:;[^\x1B]*)*(?:\x1B\\)/g, "").replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "").replace(/\x1B\][^\x1B]*[\x07\x1B]/g, "").replace(/\x07/g, "").replace(/\x1B[\x5D\x5B][^\x1B]*[\x07\x5C]/g, "").replace(/\x1B[\[\]()][0-9;]*[~A-Za-z]/g, "").replace(/\x1B[\[\]()]/g, "").replace(/\x1B[^\[\]()\s]/g, "").replace(/\]633;/g, "").replace(/\]133;/g, "").replace(/\]633;d;([^\x07\x1B]+)/g, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return cleaned;
}
function setSendEventCallback(callback) {
  sendEventCallback = callback;
}
function getShellName() {
  var term = getTerminal();
  return detectShellName(term);
}
function getPlatformName() {
  return getPlatform();
}
function getTerminal() {
  if (activeTerminal && !activeTerminal.exitStatus) {
    return activeTerminal;
  }
  var existing = vscode3.window.terminals.find(function(t) {
    return t.name === "Qwen CodeRun Agent";
  });
  if (existing && !existing.exitStatus) {
    activeTerminal = existing;
    return activeTerminal;
  }
  var workspaceFolder = vscode3.workspace.workspaceFolders?.[0]?.uri?.fsPath;
  activeTerminal = vscode3.window.createTerminal({
    name: "Qwen CodeRun Agent",
    cwd: workspaceFolder,
    location: vscode3.TerminalLocation.Panel
  });
  return activeTerminal;
}
async function waitForShellIntegration(ms) {
  ms = ms || 5e3;
  if (!activeTerminal) return false;
  if (activeTerminal.shellIntegration) return true;
  return new Promise(function(resolve3) {
    var disposable = vscode3.window.onDidChangeTerminalShellIntegration(function(event) {
      if (event.terminal === activeTerminal && event.shellIntegration) {
        disposable.dispose();
        resolve3(true);
      }
    });
    setTimeout(function() {
      disposable.dispose();
      resolve3(!!activeTerminal.shellIntegration);
    }, ms);
  });
}
function registerTerminalListeners(context) {
  if (!vscode3.window.onDidChangeTerminalShellIntegration) {
    console.log("[TERMINAL] Shell integration change events are not available in this VS Code version.");
    return;
  }
  var changeSub = vscode3.window.onDidChangeTerminalShellIntegration(function(event) {
    var terminal = event.terminal;
    var shellIntegration = event.shellIntegration;
    console.log("[TERMINAL] Shell integration changed for:", terminal.name);
    if (terminal === activeTerminal && shellIntegration) {
      console.log("[TERMINAL] Shell integration ready for Qwen CodeRun terminal");
    }
  });
  terminalListeners.push(changeSub);
  context.subscriptions.push(changeSub);
  var closeSub = vscode3.window.onDidCloseTerminal(function(terminal) {
    if (terminal === activeTerminal) {
      activeTerminal = null;
      for (var id in pendingExecutions) {
        if (sendEventCallback) {
          sendEventCallback({
            type: "terminal_error",
            terminalId: id,
            message: "Terminal was closed before command completed."
          });
        }
        delete pendingExecutions[id];
      }
    }
  });
  terminalListeners.push(closeSub);
  context.subscriptions.push(closeSub);
}
async function continueReadingInBackground(execId, reader, execution, shellName, platformName, cwd, command, startedAt, orphanedNextPromise) {
  console.log("[TERMINAL] Starting background reader for interactive session:", execId);
  _pendingInteractiveReader = reader;
  _pendingInteractiveExecution = execution;
  function processChunk(result) {
    if (!result || result.done) return true;
    var chunk = result.value;
    if (chunk) {
      var cleanChunk = stripAnsi(String(chunk));
      if (cleanChunk) {
        _lastSessionOutput += cleanChunk;
        console.log("[TERMINAL] Background reader: new output for", execId, "length:", cleanChunk.length);
        if (sendEventCallback) {
          sendEventCallback({
            type: "terminal_output",
            terminalId: execId,
            chunk: cleanChunk
          });
        }
      }
    }
    return false;
  }
  try {
    if (orphanedNextPromise) {
      console.log("[TERMINAL] Background reader: awaiting orphaned nextPromise for", execId);
      var firstResult = await Promise.race([
        orphanedNextPromise,
        new Promise(function(resolve3) {
          setTimeout(function() {
            resolve3({ done: false, value: void 0, _bgTimeout: true });
          }, 6e4);
        })
      ]);
      if (firstResult._bgTimeout) {
        if (!_lastSessionActive) {
          console.log("[TERMINAL] Background reader: session cancelled during orphan wait, stopping");
          _pendingInteractiveReader = null;
          _pendingInteractiveExecution = null;
          return;
        }
      } else {
        var streamEnded = processChunk(firstResult);
        if (streamEnded) {
          console.log("[TERMINAL] Background reader: stream ended on orphaned promise for", execId);
          _lastSessionActive = false;
          activeExecId = null;
          _pendingInteractiveReader = null;
          _pendingInteractiveExecution = null;
          var exitCode = null;
          try {
            exitCode = await Promise.race([
              execution.exitCode,
              new Promise(function(resolve3) {
                setTimeout(function() {
                  resolve3(null);
                }, 5e3);
              })
            ]);
          } catch (_) {
          }
          var durationMs = Date.now() - startedAt;
          console.log("[TERMINAL] Background reader: process exited for", execId, "exitCode:", exitCode);
          if (sendEventCallback) {
            sendEventCallback({
              type: "terminal_exit",
              terminalId: execId,
              exitCode,
              duration: durationMs,
              shell: shellName,
              platform: platformName,
              cwd,
              command
            });
          }
          return;
        }
      }
    }
    while (true) {
      if (!_lastSessionActive) {
        console.log("[TERMINAL] Background reader: session no longer active, stopping loop for", execId);
        break;
      }
      var raceResult = await Promise.race([
        reader.next(),
        new Promise(function(resolve3) {
          setTimeout(function() {
            resolve3({ done: false, value: void 0, _bgTimeout: true });
          }, 6e4);
        })
      ]);
      if (raceResult._bgTimeout) {
        if (!_lastSessionActive) {
          console.log("[TERMINAL] Background reader: session no longer active, stopping");
          break;
        }
        continue;
      }
      var streamEnded = processChunk(raceResult);
      if (streamEnded) break;
    }
    console.log("[TERMINAL] Background reader: stream ended for", execId, "\u2014 awaiting exitCode");
    var exitCode = null;
    try {
      exitCode = await Promise.race([
        execution.exitCode,
        new Promise(function(resolve3) {
          setTimeout(function() {
            resolve3(null);
          }, 5e3);
        })
      ]);
    } catch (_) {
    }
    _lastSessionActive = false;
    activeExecId = null;
    _pendingInteractiveReader = null;
    _pendingInteractiveExecution = null;
    var durationMs = Date.now() - startedAt;
    console.log("[TERMINAL] Background reader: process exited for", execId, "exitCode:", exitCode);
    if (sendEventCallback) {
      sendEventCallback({
        type: "terminal_exit",
        terminalId: execId,
        exitCode,
        duration: durationMs,
        shell: shellName,
        platform: platformName,
        cwd,
        command
      });
    }
  } catch (err) {
    console.error("[TERMINAL] Background reader error for", execId, ":", err.message);
    _lastSessionActive = false;
    activeExecId = null;
    _pendingInteractiveReader = null;
    _pendingInteractiveExecution = null;
  }
}
function detectPrompt(text) {
  if (!text) return { interactive: false, promptDetected: false };
  var lines = text.split("\n");
  var interactive = false;
  var promptDetected = false;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (/[○●◉◎⦿⊙⊚]/.test(line)) {
      interactive = true;
      promptDetected = true;
    }
    if (/[↑↓←→]/.test(line)) {
      interactive = true;
      promptDetected = true;
    }
    if (/[:：]\s*$/.test(line) && line.length < 120) {
      interactive = true;
      promptDetected = true;
    }
    if (/\([yYnN]\/[yYnN]\)|\[[yYnN]\/[yYnN]\]/.test(line)) {
      interactive = true;
      promptDetected = true;
    }
    if (/\[ ?\d+ ?\]|\( ?\d+ ?\)/.test(line) && lines.length - i < 30) {
      interactive = true;
    }
    if (/^(Select|Choose|Pick)\b/i.test(line)) {
      interactive = true;
      promptDetected = true;
    }
    if (/\?\s*$/.test(line) && line.length < 150) {
      interactive = true;
      promptDetected = true;
    }
  }
  return { interactive, promptDetected };
}
async function executeCommand(command, timeout, background) {
  timeout = timeout || 30;
  var terminal = getTerminal();
  terminal.show(true);
  var shellName = detectShellName(terminal);
  var platformName = getPlatform();
  var cwd = vscode3.workspace.workspaceFolders?.[0]?.uri?.fsPath || "";
  var startedAt = Date.now();
  if (background) {
    console.log("[TERMINAL] Running command in background:", command);
    terminal.sendText(command, true);
    var execId = "term_bg_" + ++executionCounter;
    if (sendEventCallback) {
      sendEventCallback({
        type: "terminal_start",
        terminalId: execId,
        command,
        shell: shellName,
        platform: platformName,
        cwd,
        background: true
      });
      setTimeout(function() {
        if (sendEventCallback) {
          sendEventCallback({
            type: "terminal_exit",
            terminalId: execId,
            exitCode: null,
            duration: Date.now() - startedAt,
            shell: shellName,
            platform: platformName,
            cwd,
            background: true,
            message: "Process started in the background."
          });
        }
      }, 1e3);
    }
    return {
      shell: shellName,
      platform: platformName,
      command,
      stdout: "",
      stderr: "",
      exitCode: null,
      durationMs: Date.now() - startedAt,
      success: true,
      workingDirectory: cwd,
      method: "background",
      message: "Command started in the background."
    };
  }
  var shellIntegration = terminal.shellIntegration;
  if (!shellIntegration) {
    await waitForShellIntegration(3e3);
    shellIntegration = terminal.shellIntegration;
  }
  if (shellIntegration) {
    console.log("[TERMINAL] Executing via shell integration:", command);
    var stdout = "";
    var stderr = "";
    try {
      var execId = "term_direct_" + ++executionCounter;
      activeExecId = execId;
      var execution = shellIntegration.executeCommand(command);
      var timeoutAt = startedAt + timeout * 1e3;
      if (sendEventCallback) {
        sendEventCallback({
          type: "terminal_start",
          terminalId: execId,
          command,
          shell: shellName,
          platform: platformName,
          cwd
        });
      }
      if (!execution || typeof execution.read !== "function") {
        throw new Error("Shell integration did not return a readable execution stream.");
      }
      var iterable = execution.read();
      if (!iterable || typeof iterable[Symbol.asyncIterator] !== "function") {
        throw new Error("Shell integration read() did not return an async iterable.");
      }
      console.log("[TERMINAL] Entering for-await loop for", execId);
      var reader = iterable[Symbol.asyncIterator]();
      var chunkCount = 0;
      var idleDetected = false;
      try {
        var IDLE_TIMEOUT_MS = 3e3;
        while (true) {
          var nextPromise = reader.next();
          var timeoutId = null;
          var raceResult = await Promise.race([
            nextPromise.then(function(r) {
              if (timeoutId) clearTimeout(timeoutId);
              timeoutId = null;
              return r;
            }),
            new Promise(function(resolve3) {
              timeoutId = setTimeout(function() {
                resolve3({ done: true, value: void 0, _idleTimeout: true });
              }, IDLE_TIMEOUT_MS);
            })
          ]);
          if (raceResult._idleTimeout) {
            idleDetected = true;
            break;
          }
          if (raceResult.done) break;
          var chunk = raceResult.value;
          chunkCount++;
          console.log("[TERMINAL] Chunk #" + chunkCount + " for", execId, "length:", String(chunk || "").length);
          var text = String(chunk || "");
          var cleanChunk = stripAnsi(text);
          stdout += cleanChunk;
          if (sendEventCallback && cleanChunk) {
            sendEventCallback({
              type: "terminal_output",
              terminalId: execId,
              chunk: cleanChunk
            });
          }
          if (Date.now() > timeoutAt) {
            throw new Error("Command timed out after " + timeout + " seconds.");
          }
        }
        _lastSessionOutput = stdout;
        _lastSessionActive = idleDetected === true;
      } catch (streamErr) {
        console.log("[TERMINAL] for-await loop threw for", execId, ":", streamErr.message, "chunks received:", chunkCount);
        throw streamErr;
      }
      if (idleDetected) {
        console.log("[TERMINAL] Idle timeout for", execId, "- process waiting for input");
        var durationMs2 = Date.now() - startedAt;
        var promptCheck = detectPrompt(stdout);
        continueReadingInBackground(execId, reader, execution, shellName, platformName, cwd, command, startedAt, nextPromise);
        if (sendEventCallback) {
          sendEventCallback({
            type: "terminal_exit",
            terminalId: execId,
            exitCode: null,
            duration: durationMs2,
            shell: shellName,
            platform: platformName,
            cwd,
            command,
            waitingForInput: true,
            interactive: promptCheck.interactive,
            promptDetected: promptCheck.promptDetected
          });
        }
        console.log("[TERMINAL] Returning partial result for", execId, "(waiting for input)");
        return {
          shell: shellName,
          platform: platformName,
          command,
          stdout,
          stderr,
          exitCode: null,
          durationMs: durationMs2,
          success: true,
          workingDirectory: cwd,
          method: "shell_integration",
          waitingForInput: true,
          interactive: promptCheck.interactive,
          promptDetected: promptCheck.promptDetected,
          status: "waiting_for_input"
        };
      }
      console.log("[TERMINAL] for-await loop COMPLETED for", execId, "chunks:", chunkCount);
      console.log("[TERMINAL] Awaiting exitCode for", execId);
      var exitCode = await execution.exitCode;
      console.log("[TERMINAL] exitCode received for", execId, ":", exitCode);
      var durationMs = Date.now() - startedAt;
      console.log("[TERMINAL] Sending terminal_exit for", execId, "exitCode:", exitCode, "duration:", durationMs);
      if (sendEventCallback) {
        sendEventCallback({
          type: "terminal_exit",
          terminalId: execId,
          exitCode,
          duration: durationMs,
          shell: shellName,
          platform: platformName,
          cwd,
          command
        });
      }
      console.log("[TERMINAL] Returning result for", execId);
      var promptCheck = detectPrompt(stdout);
      activeExecId = null;
      return {
        shell: shellName,
        platform: platformName,
        command,
        stdout,
        stderr,
        exitCode,
        durationMs,
        success: exitCode != null ? exitCode === 0 : true,
        workingDirectory: cwd,
        method: "shell_integration",
        interactive: promptCheck.interactive,
        promptDetected: promptCheck.promptDetected,
        status: exitCode != null ? exitCode === 0 ? "completed" : "failed" : "completed"
      };
    } catch (err) {
      console.error("[TERMINAL] Shell integration executeCommand failed:", err);
      activeExecId = null;
      _lastSessionOutput = stdout;
      _lastSessionActive = false;
      if (sendEventCallback) {
        sendEventCallback({
          type: "terminal_error",
          terminalId: "term_error_" + executionCounter,
          message: err.message,
          shell: shellName,
          platform: platformName
        });
      }
    }
  }
  console.log("[TERMINAL] Shell integration unavailable \u2014 using child_process fallback:", command);
  terminal.sendText(command, true);
  var execId = "term_fallback_" + ++executionCounter;
  activeExecId = execId;
  if (sendEventCallback) {
    sendEventCallback({
      type: "terminal_start",
      terminalId: execId,
      command,
      shell: shellName,
      platform: platformName,
      cwd,
      fallback: true
    });
  }
  var shellExe = "";
  var shellArg = "";
  var lowerShell = shellName.toLowerCase();
  if (lowerShell.includes("powershell") || lowerShell.includes("pwsh")) {
    shellExe = process.env.PWSH_EXE || "powershell.exe";
    shellArg = "-NoProfile -NonInteractive -Command";
  } else if (lowerShell.includes("cmd")) {
    shellExe = process.env.COMSPEC || "cmd.exe";
    shellArg = "/c";
  } else if (lowerShell.includes("wsl")) {
    shellExe = "wsl.exe";
    shellArg = "--";
  } else {
    shellExe = process.env.SHELL || "bash";
    shellArg = "-c";
  }
  try {
    var stdout = "";
    var stderr = "";
    var cpExitCode = null;
    var fullArgs = shellArg.split(" ").concat([command]);
    var cpResult = await new Promise(function(resolve3, reject) {
      var child = (0, import_child_process.execFile)(shellExe, fullArgs, {
        cwd: cwd || void 0,
        timeout: (timeout || 30) * 1e3,
        maxBuffer: 1024 * 1024,
        // 1MB
        windowsHide: true
      }, function(error, cpStdout, cpStderr) {
        if (error) {
          resolve3({
            stdout: cpStdout || "",
            stderr: cpStderr || "",
            exitCode: error.code != null ? error.code : error.killed ? -1 : 1
          });
        } else {
          resolve3({
            stdout: cpStdout || "",
            stderr: cpStderr || "",
            exitCode: 0
          });
        }
      });
    });
    stdout = cpResult.stdout;
    stderr = cpResult.stderr;
    cpExitCode = cpResult.exitCode;
    var durationMs = Date.now() - startedAt;
    stdout = stripAnsi(stdout);
    stderr = stripAnsi(stderr);
    if (sendEventCallback && stdout) {
      sendEventCallback({
        type: "terminal_output",
        terminalId: execId,
        chunk: stdout
      });
    }
    if (sendEventCallback && stderr) {
      sendEventCallback({
        type: "terminal_output",
        terminalId: execId,
        chunk: stderr
      });
    }
    if (sendEventCallback) {
      sendEventCallback({
        type: "terminal_exit",
        terminalId: execId,
        exitCode: cpExitCode,
        duration: durationMs,
        shell: shellName,
        platform: platformName,
        cwd,
        command,
        fallback: true
      });
    }
    var promptCheck = detectPrompt(stdout);
    activeExecId = null;
    return {
      shell: shellName,
      platform: platformName,
      command,
      stdout,
      stderr,
      exitCode: cpExitCode,
      durationMs,
      success: cpExitCode === 0,
      workingDirectory: cwd,
      method: "sendText",
      interactive: promptCheck.interactive,
      promptDetected: promptCheck.promptDetected,
      status: cpExitCode != null ? cpExitCode === 0 ? "completed" : "failed" : "completed"
    };
  } catch (cpErr) {
    console.error("[TERMINAL] child_process fallback also failed:", cpErr.message);
    activeExecId = null;
    var fallbackDuration = Date.now() - startedAt;
    if (sendEventCallback) {
      sendEventCallback({
        type: "terminal_error",
        terminalId: execId,
        message: cpErr.message,
        shell: shellName,
        platform: platformName
      });
    }
    return {
      shell: shellName,
      platform: platformName,
      command,
      stdout: "",
      stderr: cpErr.message,
      exitCode: -1,
      durationMs: fallbackDuration,
      success: false,
      workingDirectory: cwd,
      method: "sendText",
      error: cpErr.message
    };
  }
}
function executeCommandLegacy(command) {
  if (!command) return;
  var terminal = getTerminal();
  terminal.show(true);
  terminal.sendText(command, true);
}
function dispose2() {
  terminalListeners.forEach(function(sub) {
    try {
      sub.dispose();
    } catch (_) {
    }
  });
  terminalListeners = [];
  if (activeTerminal) {
    try {
      activeTerminal.dispose();
    } catch (_) {
    }
    activeTerminal = null;
  }
  pendingExecutions = {};
  sendEventCallback = null;
}
function onTerminalClosed(terminal) {
  if (terminal === activeTerminal) {
    activeTerminal = null;
  }
}
function resetTerminal() {
  if (activeTerminal) {
    try {
      activeTerminal.dispose();
    } catch (_) {
    }
    activeTerminal = null;
  }
  _lastSessionOutput = "";
  _lastSessionActive = false;
  _lastCheckedPosition = 0;
}
function sendTerminalInput(text) {
  var terminal = getTerminal();
  terminal.show(true);
  terminal.sendText(text, true);
  return { success: true, message: "Input sent to terminal: " + text };
}
async function checkTerminalOutput() {
  if (_pendingInteractiveReader && _lastSessionActive) {
    await new Promise(function(resolve3) {
      setTimeout(resolve3, 1500);
    });
  }
  var fullOutput = _lastSessionOutput || "";
  var stderr = "";
  var shellName = activeTerminal ? detectShellName(activeTerminal) : "unknown";
  var platformName = getPlatform();
  var startedAt = Date.now();
  var newOutput = fullOutput.substring(_lastCheckedPosition);
  _lastCheckedPosition = fullOutput.length;
  var isWaiting = _lastSessionActive;
  var exitCode = null;
  var promptCheck = detectPrompt(newOutput);
  return {
    shell: shellName,
    platform: platformName,
    stdout: newOutput,
    stderr,
    exitCode,
    durationMs: Date.now() - startedAt,
    success: true,
    status: isWaiting ? "waiting_for_input" : "active",
    waitingForInput: isWaiting,
    interactive: promptCheck.interactive,
    promptDetected: promptCheck.promptDetected
  };
}
async function stopTerminal() {
  var terminal = getTerminal();
  terminal.show(true);
  console.log("[TERMINAL] Sending Ctrl+C interrupt");
  await vscode3.commands.executeCommand("workbench.action.terminal.sendSequence", { text: "" });
  if (sendEventCallback) {
    sendEventCallback({
      type: "terminal_output",
      terminalId: activeExecId || "term_stop_" + Date.now(),
      chunk: "^C\n"
    });
  }
  _lastSessionActive = false;
  activeExecId = null;
  _pendingInteractiveReader = null;
  _pendingInteractiveExecution = null;
  return { success: true, message: "Sent Ctrl+C to stop running process." };
}

// src/agentLoop.js
var DEBUG = false;
function dbg() {
  if (DEBUG) console.log.apply(console, arguments);
}
var _pendingDiffs = {};
function resolveDiff(id, accepted) {
  if (_pendingDiffs[id]) {
    _pendingDiffs[id]({ accepted: !!accepted });
    delete _pendingDiffs[id];
  }
}
var MAX_RETRIES = 3;
async function runAgentLoop(userPrompt, config, options) {
  options = options || {};
  var workspace6 = options.workspace || "";
  var history = options.history || [];
  var sendEvent = options.sendEvent || function() {
  };
  var askPermission = options.askPermission || requestPermission;
  var signal = options.signal || null;
  var maxIterations = config.maxIterations || MAX_ITERATIONS;
  var provider = createProvider(config);
  var contextResult = null;
  try {
    contextResult = await gatherContext(userPrompt, workspace6);
  } catch (_) {
  }
  var knowledge = contextResult ? contextResult.knowledge : {};
  if (!knowledge.projectMetadata) {
    try {
      if (getStats().ready) {
        knowledge.projectMetadata = getProjectMetadata();
        var stats2 = getStats();
        knowledge.fileCount = stats2.tables && stats2.tables.files ? stats2.tables.files : 0;
        knowledge.fileContext = true;
      }
    } catch (_) {
    }
    if (!knowledge.projectMemory) knowledge.projectMemory = "";
    if (!knowledge.dependencyGraph) knowledge.dependencyGraph = "";
    if (!knowledge.timeline) knowledge.timeline = "";
  }
  try {
    var sessionLabel = String(userPrompt || "").substring(0, 60);
    addEvent("session:start", sessionLabel);
  } catch (_) {
  }
  var currentPlan = null;
  try {
    var sessionId = history.length > 0 ? String(history[0].session_id || "session_" + Date.now()) : "session_" + Date.now();
    var sessionPlans = getSessionPlans(sessionId);
    if (sessionPlans && sessionPlans.length) {
      currentPlan = sessionPlans[sessionPlans.length - 1];
      if (currentPlan && !knowledge.activePlans) {
        try {
          knowledge.activePlans = getActivePlansContext();
        } catch (_) {
        }
      }
    }
  } catch (_) {
  }
  var messages = buildMessages(userPrompt, {
    workspace: workspace6,
    history,
    knowledge,
    images: options.images || [],
    shellName: getShellName(),
    platformName: getPlatformName()
  });
  var initialLength = messages.length;
  var sendHistoryUpdate = function() {
    try {
      var newMsgs = messages.slice(initialLength);
      sendEvent({
        type: "chat_history_update",
        messages: newMsgs,
        plan: currentPlan
      });
    } catch (_) {
    }
  };
  var iteration = 0;
  var fullThinking = "";
  var fullContent = "";
  try {
    while (iteration < maxIterations) {
      if (signal && signal.stopped) {
        console.log("[AGENT LOOP] Stop requested at iteration " + iteration);
        sendEvent({
          type: EVENT_TYPES.AGENT_DONE,
          reason: "stopped",
          content: fullContent,
          thinking: fullThinking
        });
        return { content: fullContent, thinking: fullThinking, done: false, stopped: true };
      }
      iteration++;
      console.log("[AGENT LOOP] Iteration " + iteration + "/" + maxIterations);
      sendEvent({ type: EVENT_TYPES.AGENT_STATUS, status: "thinking", iteration });
      var streamBuffer = "";
      var inThinkTag = false;
      var iterationThinking = "";
      var iterationContent = "";
      var toolCalls = [];
      try {
        var stream = provider.chat(config, messages, getDefinitions());
        for await (var chunk of stream) {
          console.log("[AGENT LOOP] Iteration " + iteration + "/" + maxIterations);
          dbg("[AGENT LOOP] AGENT RECEIVED =", JSON.stringify(chunk).substring(0, 500));
          if (chunk.thinking) {
            iterationThinking += chunk.thinking;
            fullThinking += chunk.thinking;
            sendEvent({ message: { role: "assistant", thinking: chunk.thinking } });
          }
          if (chunk.content) {
            var parsed = processThinkTags(chunk.content, inThinkTag, streamBuffer);
            inThinkTag = parsed.inThinkTag;
            streamBuffer = parsed.buffer;
            if (parsed.thinking) {
              iterationThinking += parsed.thinking;
              fullThinking += parsed.thinking;
              sendEvent({ message: { role: "assistant", thinking: parsed.thinking } });
            }
            if (parsed.content) {
              iterationContent += parsed.content;
              fullContent += parsed.content;
              dbg("[AGENT LOOP] sendEvent content:", parsed.content.substring(0, 100));
              sendEvent({ message: { role: "assistant", content: parsed.content } });
            }
          }
          if (chunk.tool_calls && chunk.tool_calls.length) {
            for (var tc of chunk.tool_calls) {
              var tcIndex = typeof tc.index === "number" ? tc.index : toolCalls.length;
              if (!toolCalls[tcIndex]) {
                toolCalls[tcIndex] = {
                  index: tcIndex,
                  id: tc.id,
                  type: tc.type || "function",
                  function: {
                    name: tc.function && tc.function.name || tc.name || "",
                    arguments: ""
                  }
                };
              }
              var slot = toolCalls[tcIndex];
              if (tc.id) slot.id = tc.id;
              if (tc.type) slot.type = tc.type;
              if (tc.function) {
                if (tc.function.name) slot.function.name = tc.function.name;
                if (typeof tc.function.arguments === "string") {
                  slot.function.arguments += tc.function.arguments;
                } else if (tc.function.arguments != null) {
                  try {
                    slot.function.arguments += JSON.stringify(tc.function.arguments);
                  } catch (_) {
                    slot.function.arguments += String(tc.function.arguments);
                  }
                }
              } else if (tc.name) {
                slot.function.name = slot.function.name || tc.name;
                if (typeof tc.arguments === "string") {
                  slot.function.arguments += tc.arguments;
                } else if (tc.arguments != null) {
                  try {
                    slot.function.arguments += JSON.stringify(tc.arguments);
                  } catch (_) {
                    slot.function.arguments += String(tc.arguments);
                  }
                }
              }
            }
            var streamingView = toolCalls.map(function(t) {
              return {
                index: t.index,
                id: t.id,
                type: t.type,
                function: { name: t.function.name, arguments: t.function.arguments }
              };
            });
            sendEvent({ message: { role: "assistant", tool_calls: streamingView } });
          }
        }
      } catch (err) {
        sendEvent({ type: EVENT_TYPES.AGENT_ERROR, message: err.message });
        throw err;
      }
      if (streamBuffer.length > 0) {
        if (inThinkTag) {
          fullThinking += streamBuffer;
          sendEvent({ message: { role: "assistant", thinking: streamBuffer } });
        } else {
          fullContent += streamBuffer;
          sendEvent({ message: { role: "assistant", content: streamBuffer } });
        }
      }
      var completedToolCalls = toolCalls.filter(function(t) {
        return !!t;
      }).map(function(t) {
        var rawArgs = t.function && t.function.arguments;
        var parsedArgs = {};
        if (typeof rawArgs === "string") {
          var trimmed = rawArgs.trim();
          if (trimmed.length > 0) {
            try {
              parsedArgs = JSON.parse(trimmed);
              if (parsedArgs == null || typeof parsedArgs !== "object") {
                parsedArgs = {};
              }
            } catch (e) {
              console.error("[AGENT LOOP] Failed to parse tool args for", t.function && t.function.name, ":", e.message, "raw:", trimmed);
              parsedArgs = {};
            }
          }
        } else if (rawArgs && typeof rawArgs === "object") {
          parsedArgs = rawArgs;
        }
        return {
          id: t.id,
          type: t.type,
          function: {
            name: t.function && t.function.name,
            arguments: parsedArgs
          }
        };
      });
      if (completedToolCalls.length === 0) {
        var assistantMsg = { role: "assistant", content: iterationContent || "" };
        messages.push(assistantMsg);
        sendEvent({ type: EVENT_TYPES.AGENT_DONE, reason: "direct_answer", content: fullContent, thinking: fullThinking });
        return { content: fullContent, thinking: fullThinking, done: true };
      }
      sendEvent({ type: EVENT_TYPES.AGENT_STATUS, status: "executing_tools", count: completedToolCalls.length });
      var toolPromises = completedToolCalls.map(async function(tc2, index) {
        var toolName = tc2.function?.name;
        var args = tc2.function?.arguments || {};
        var tcId = tc2.id || "call_" + iteration + "_" + index;
        var approved = await askPermission(toolName, args, tcId, sendEvent);
        if (!approved) {
          sendEvent({ type: EVENT_TYPES.TOOL_RESULT, tool: toolName, success: false, message: "Permission denied by user.", toolCallId: tcId });
          return {
            tool_name: toolName,
            tool_call_id: tcId,
            formattedResult: "Permission denied.",
            checkpoints: []
          };
        }
        console.log("[AGENT LOOP] Running tool: " + toolName);
        var lastResult = null;
        var checkpointsCreated = [];
        try {
          if (toolName === "write_file" || toolName === "edit_file" || toolName === "delete_file") {
            var cpFile = args.file_path || "";
            if (cpFile) {
              var cpLabel = (toolName === "delete_file" ? "Deleted" : toolName === "write_file" ? "Created" : "Edited") + ": " + cpFile;
              var sessionId2 = "session_" + Date.now();
              var cpId = await createCheckpoint(cpFile, workspace6, sessionId2, cpLabel);
              if (cpId) {
                checkpointsCreated.push({ id: cpId, filePath: cpFile, label: cpLabel });
              }
            }
          }
        } catch (_) {
        }
        var _createdDiffIds = [];
        try {
          dbg("[AGENT LOOP] Calling toolRegistry.execute for", toolName);
          var generator = execute(toolName, args, workspace6);
          dbg("[AGENT LOOP] toolRegistry.execute returned generator");
          var eventCount = 0;
          for await (var event of generator) {
            eventCount++;
            dbg("[AGENT LOOP] Generator event #" + eventCount + " for", toolName, "type:", event.type, "success:", event.success);
            event.toolCallId = tcId;
            if (event.type === "request_diff" && event.id && event.deferred) {
              _pendingDiffs[event.id] = event.deferred.resolve;
              _createdDiffIds.push(event.id);
            }
            sendEvent(event);
            if (event.type === "tool_result") {
              lastResult = event;
            }
          }
        } catch (err) {
          console.log("[AGENT LOOP] Generator threw for", toolName, ":", err.message);
          sendEvent({ type: EVENT_TYPES.TOOL_RESULT, tool: toolName, success: false, message: err.message, toolCallId: tcId });
          lastResult = { success: false, message: err.message };
        } finally {
          dbg("[AGENT LOOP] Generator finally block for", toolName, "eventCount:", eventCount, "lastResult:", lastResult ? lastResult.success !== false ? "success" : "fail" : "null");
          for (var di = 0; di < _createdDiffIds.length; di++) {
            var diffId = _createdDiffIds[di];
            if (_pendingDiffs[diffId]) {
              _pendingDiffs[diffId]({ accepted: false });
              delete _pendingDiffs[diffId];
            }
          }
        }
        try {
          recordToolUsage(toolName, args.command || args.file_path || args.pattern || "");
        } catch (_) {
        }
        try {
          var tlSuccess = lastResult ? lastResult.success : void 0;
          var tlMsg = lastResult ? lastResult.message || lastResult.error || "" : "";
          addToolEvent(toolName, args, tlSuccess, tlMsg);
        } catch (_) {
        }
        if (lastResult && lastResult.success !== false) {
          if (toolName === "create_plan" && lastResult.steps) {
            try {
              if (currentPlan) {
                lastResult.steps.forEach(function(s) {
                  var step = currentPlan.steps.find(function(existing) {
                    return existing.order === s.order;
                  });
                  if (!step) {
                    currentPlan.steps.push({
                      order: s.order,
                      action: s.action || "custom",
                      target: s.target || "",
                      description: s.description || "",
                      expected_output: s.expected_output || "",
                      status: s.status || "pending"
                    });
                  }
                });
                sendEvent({
                  type: "plan_updated",
                  plan: currentPlan
                });
              } else {
                var sessionId2 = history.length > 0 ? String(history[0].session_id || "session_" + Date.now()) : "session_" + Date.now();
                currentPlan = {
                  id: "plan_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
                  session_id: sessionId2,
                  goal: userPrompt,
                  steps: lastResult.steps.map(function(s) {
                    return {
                      order: s.order,
                      action: s.action || "custom",
                      target: s.target || "",
                      description: s.description || "",
                      expected_output: s.expected_output || "",
                      status: s.status || "pending"
                    };
                  }),
                  status: "draft",
                  created_at: Date.now()
                };
                sendEvent({
                  type: "plan_created",
                  plan: currentPlan
                });
              }
              try {
                storePlan(currentPlan);
              } catch (_) {
              }
            } catch (_) {
            }
          } else if (toolName === "update_plan" && lastResult.steps) {
            if (!currentPlan) {
              var sessionId2 = history.length > 0 ? String(history[0].session_id || "session_" + Date.now()) : "session_" + Date.now();
              currentPlan = {
                id: "plan_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
                session_id: sessionId2,
                goal: userPrompt,
                steps: [],
                status: "draft",
                created_at: Date.now()
              };
            }
            if (currentPlan && currentPlan.steps) {
              lastResult.steps.forEach(function(upd) {
                var step = currentPlan.steps.find(function(s) {
                  return s.order === upd.order;
                });
                if (step) {
                  if (upd.status) step.status = upd.status;
                  if (upd.description) step.description = upd.description;
                } else {
                  currentPlan.steps.push({
                    order: upd.order,
                    action: upd.action || "custom",
                    target: upd.target || "",
                    description: upd.description || "",
                    expected_output: upd.expected_output || "",
                    status: upd.status || "pending"
                  });
                }
              });
              sendEvent({
                type: "plan_updated",
                plan: currentPlan
              });
              try {
                storePlan(currentPlan);
              } catch (_) {
              }
            }
          }
          try {
            var stepArgs = { action: toolName, target: args.file_path || args.command || args.pattern || "", description: "" };
            var stepResult = {
              order: iteration,
              action: toolName,
              status: "completed",
              duration: 0,
              output: lastResult.message || lastResult.content || "",
              error: null
            };
            var verification = await verifyStep(stepResult, stepArgs, workspace6);
            if (!verification.verified) {
              var retryKey = iteration + "_" + toolName;
              var retryCount = Number(getSetting("retry_" + retryKey) || 0);
              retryCount++;
              setSetting("retry_" + retryKey, String(retryCount));
              setSetting("retry_count_total", String(Number(getSetting("retry_count_total") || 0) + 1));
              if (retryCount <= MAX_RETRIES) {
                console.log("[AGENT LOOP] Verification failed for", toolName, "- retry", retryCount, "/", MAX_RETRIES);
                sendEvent({
                  type: EVENT_TYPES.AGENT_STATUS,
                  status: "verification_failed",
                  tool: toolName,
                  retry: retryCount,
                  maxRetries: MAX_RETRIES,
                  message: "Verification: " + verification.summary + " \u2014 retrying (" + retryCount + "/" + MAX_RETRIES + ")"
                });
              } else {
                console.log("[AGENT LOOP] Verification failed for", toolName, "- max retries reached");
                sendEvent({
                  type: EVENT_TYPES.AGENT_STATUS,
                  status: "verification_failed",
                  tool: toolName,
                  message: "Verification: " + verification.summary + " \u2014 max retries reached"
                });
              }
            }
          } catch (_) {
          }
        }
        return {
          tool_name: toolName,
          tool_call_id: tcId,
          formattedResult: formatToolResult(toolName, lastResult),
          checkpoints: checkpointsCreated,
          result: lastResult
        };
      });
      dbg("[AGENT LOOP] Promise.all(toolPromises) RESOLVED. Count:", toolPromises.length);
      var results = await Promise.all(toolPromises);
      dbg("[AGENT LOOP] All tool promises completed. Results:", results.length);
      var toolResults = [];
      var allCheckpoints = [];
      for (var ri = 0; ri < results.length; ri++) {
        toolResults.push({
          tool_name: results[ri].tool_name,
          tool_call_id: results[ri].tool_call_id,
          formattedResult: results[ri].formattedResult,
          result: results[ri].result
        });
        if (results[ri].checkpoints && results[ri].checkpoints.length) {
          allCheckpoints = allCheckpoints.concat(results[ri].checkpoints);
        }
      }
      if (allCheckpoints.length) {
        sendEvent({
          type: "checkpoints_created",
          checkpoints: allCheckpoints
        });
      }
      sendEvent({ type: EVENT_TYPES.AGENT_ITERATION, iteration, phase: "tools_executed" });
      var isOllama = config.provider === "ollama";
      var assistantToolCalls = completedToolCalls.map(function(t) {
        var args = t.function && t.function.arguments || {};
        return {
          id: t.id,
          type: t.type || "function",
          function: {
            name: t.function && t.function.name,
            arguments: isOllama ? args : JSON.stringify(args)
          }
        };
      });
      var assistantMsg = { role: "assistant", content: iterationContent || "" };
      if (assistantToolCalls.length) assistantMsg.tool_calls = assistantToolCalls;
      messages.push(assistantMsg);
      dbg("[AGENT LOOP] Messages updated. Total messages:", messages.length, "Tool results count:", toolResults.length);
      var isOllama2 = config.provider === "ollama";
      for (var j = 0; j < toolResults.length; j++) {
        var toolMsg = {
          role: "tool",
          tool_call_id: toolResults[j].tool_call_id,
          content: toolResults[j].formattedResult,
          tool_name: toolResults[j].tool_name,
          result: toolResults[j].result
        };
        if (isOllama2 && toolResults[j].tool_name) {
          toolMsg.tool_name = toolResults[j].tool_name;
        }
        messages.push(toolMsg);
      }
      dbg("[AGENT LOOP] End of iteration", iteration, "- next iteration starting...");
    }
  } finally {
    console.log("[AGENT LOOP] While loop exited. finally block.");
    sendHistoryUpdate();
  }
  sendEvent({
    type: EVENT_TYPES.AGENT_DONE,
    reason: "max_iterations",
    content: fullContent + "\n\nMaximum agent iterations reached (" + maxIterations + "). The task may not be complete. Do you want me to continue?",
    thinking: fullThinking
  });
  return { content: fullContent, thinking: fullThinking, done: false, maxReached: true };
}
function processThinkTags(text, inThinkTag, buffer) {
  var contentPart = "";
  var thinkingPart = "";
  buffer += text;
  while (true) {
    if (!inThinkTag) {
      var startIdx = buffer.indexOf("\uE000");
      if (startIdx !== -1) {
        contentPart += buffer.substring(0, startIdx);
        inThinkTag = true;
        buffer = buffer.substring(startIdx + 1);
      } else {
        var partialLen = 0;
        for (var i = 1; i <= buffer.length; i++) {
          if ("\uE000".startsWith(buffer.slice(-i))) {
            partialLen = i;
            break;
          }
        }
        contentPart += buffer.substring(0, buffer.length - partialLen);
        buffer = buffer.substring(buffer.length - partialLen);
        break;
      }
    } else {
      var endIdx = buffer.indexOf("\uE001");
      if (endIdx !== -1) {
        thinkingPart += buffer.substring(0, endIdx);
        inThinkTag = false;
        buffer = buffer.substring(endIdx + 1);
      } else {
        var partialLen = 0;
        for (var i = 1; i <= buffer.length; i++) {
          if ("\uE001".startsWith(buffer.slice(-i))) {
            partialLen = i;
            break;
          }
        }
        thinkingPart += buffer.substring(0, buffer.length - partialLen);
        buffer = buffer.substring(buffer.length - partialLen);
        break;
      }
    }
  }
  return { content: contentPart, thinking: thinkingPart, inThinkTag, buffer };
}

// src/agent.js
async function runAgent(message, model, workspace6, history, config, sendEvent, askPermission, options) {
  console.log("[AGENT] Starting runner. Model: " + model + ", Workspace: " + workspace6);
  var providerConfig = Object.assign({}, config, { model });
  options = options || {};
  var signal = options.signal || null;
  return await runAgentLoop(message, providerConfig, {
    workspace: workspace6,
    history,
    sendEvent,
    askPermission,
    signal,
    images: options.image ? [options.image] : options.images || []
  });
}

// src/tools.js
var fs6 = __toESM(require("fs/promises"), 1);
var import_fs6 = require("fs");
var path8 = __toESM(require("path"), 1);

// src/symbolParser.js
var path7 = __toESM(require("path"), 1);
function parseSymbols(content, filePath) {
  var ext = path7.extname(filePath || "").toLowerCase();
  var lines = content.split("\n");
  var symbols = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var lineNum = i + 1;
    var match = null;
    if (ext === ".js" || ext === ".jsx" || ext === ".ts" || ext === ".tsx" || ext === ".mjs" || ext === ".cjs") {
      match = line.match(/^\s*(export\s+)?(default\s+)?class\s+([a-zA-Z0-9_$]+)/);
      if (match) {
        symbols.push({ name: match[3], type: "class", line: lineNum });
        continue;
      }
      match = line.match(/^\s*(export\s+)?(default\s+)?(async\s+)?function\s*(\*)?\s+([a-zA-Z0-9_$]+)/);
      if (match) {
        symbols.push({ name: match[5], type: "function", line: lineNum });
        continue;
      }
      match = line.match(/^\s*(const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(async\s*)?\([^)]*\)\s*=>/);
      if (match) {
        symbols.push({ name: match[2], type: "function", line: lineNum });
        continue;
      }
      match = line.match(/^\s*(async\s*)?(\*)?\s*([a-zA-Z0-9_$]+)\s*\([^)]*\)\s*\{/);
      if (match) {
        var name = match[3];
        if (name !== "if" && name !== "for" && name !== "while" && name !== "switch" && name !== "catch" && name !== "function") {
          symbols.push({ name, type: "method", line: lineNum });
        }
        continue;
      }
      if (ext.startsWith(".t")) {
        match = line.match(/^\s*(export\s+)?(interface|type)\s+([a-zA-Z0-9_$]+)/);
        if (match) {
          symbols.push({ name: match[3], type: match[2], line: lineNum });
        }
      }
    } else if (ext === ".py") {
      match = line.match(/^class\s+([a-zA-Z0-9_$]+)/);
      if (match) {
        symbols.push({ name: match[1], type: "class", line: lineNum });
        continue;
      }
      match = line.match(/^\s*def\s+([a-zA-Z0-9_$]+)/);
      if (match) {
        var isMethod = /^\s+/.test(line);
        symbols.push({ name: match[1], type: isMethod ? "method" : "function", line: lineNum });
      }
    } else if (ext === ".go") {
      match = line.match(/^func\s+(\([^)]+\)\s+)?([a-zA-Z0-9_$]+)\s*\(/);
      if (match) {
        var hasReceiver = !!match[1];
        symbols.push({ name: match[2], type: hasReceiver ? "method" : "function", line: lineNum });
        continue;
      }
      match = line.match(/^type\s+([a-zA-Z0-9_$]+)\s+(struct|interface)/);
      if (match) {
        symbols.push({ name: match[1], type: match[2], line: lineNum });
      }
    } else if (ext === ".rs") {
      match = line.match(/^\s*(pub\s+)?(async\s+)?fn\s+([a-zA-Z0-9_$]+)/);
      if (match) {
        symbols.push({ name: match[3], type: "function", line: lineNum });
        continue;
      }
      match = line.match(/^\s*(pub\s+)?(struct|trait|enum|union)\s+([a-zA-Z0-9_$]+)/);
      if (match) {
        symbols.push({ name: match[3], type: match[2], line: lineNum });
        continue;
      }
      match = line.match(/^\s*impl\s+(<[^>]+>\s+)?([a-zA-Z0-9_$]+)/);
      if (match) {
        symbols.push({ name: "impl " + match[2], type: "impl", line: lineNum });
      }
    } else if (ext === ".java" || ext === ".cpp" || ext === ".h" || ext === ".hpp" || ext === ".cs") {
      match = line.match(/^\s*(public|private|protected\s+)?(class|struct|interface)\s+([a-zA-Z0-9_$]+)/);
      if (match) {
        symbols.push({ name: match[3], type: match[2], line: lineNum });
        continue;
      }
      match = line.match(/^\s*([a-zA-Z0-9_$<>*&::\s]+)\s+([a-zA-Z0-9_$]+)\s*\([^)]*\)\s*(\{)?\s*$/);
      if (match) {
        var retType = match[1].trim();
        var name = match[2];
        if (name !== "if" && name !== "for" && name !== "while" && name !== "switch" && name !== "catch" && !retType.includes("return")) {
          symbols.push({ name, type: ext === ".java" || ext === ".cs" ? "method" : "function", line: lineNum });
        }
      }
    } else if (ext === ".rb") {
      match = line.match(/^\s*(class|module)\s+([a-zA-Z0-9_$:]+)/);
      if (match) {
        symbols.push({ name: match[2], type: match[1], line: lineNum });
        continue;
      }
      match = line.match(/^\s*def\s+([a-zA-Z0-9_$.?=]+)/);
      if (match) {
        symbols.push({ name: match[1], type: "method", line: lineNum });
      }
    }
  }
  return symbols;
}

// src/tools.js
var DEBUG2 = false;
function dbg2() {
  if (DEBUG2) console.log.apply(console, arguments);
}
function _safePath(workspace6, relPath) {
  var base = path8.resolve(workspace6);
  var target = path8.resolve(path8.join(base, relPath));
  if (!target.startsWith(base)) {
    throw new Error("Path traversal blocked: " + relPath);
  }
  return target;
}
async function* read_file(args, workspace6) {
  var filePath = args.file_path || "";
  yield { type: "action", action: "read_file", message: "Reading file: " + filePath };
  try {
    var target = _safePath(workspace6, filePath);
    if (!(0, import_fs6.existsSync)(target)) {
      yield { type: "tool_result", tool: "read_file", success: false, message: "File not found: " + filePath };
      return;
    }
    var content = await fs6.readFile(target, "utf-8");
    yield { type: "tool_result", tool: "read_file", success: true, file_path: filePath, content };
  } catch (e) {
    yield { type: "tool_result", tool: "read_file", success: false, message: e.message };
  }
}
async function* write_file(args, workspace6) {
  var filePath = args.file_path || "";
  var content = args.content || "";
  yield { type: "action", action: "write_file", message: "Writing file: " + filePath };
  try {
    var target = _safePath(workspace6, filePath);
    var originalContent = "";
    if ((0, import_fs6.existsSync)(target)) {
      originalContent = await fs6.readFile(target, "utf-8");
    }
    var diffId = "diff_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
    var deferred = {};
    deferred.promise = new Promise(function(resolve3) {
      deferred.resolve = resolve3;
    });
    yield {
      type: "request_diff",
      id: diffId,
      tool: "write_file",
      file_path: filePath,
      original_content: originalContent,
      new_content: content,
      is_new_file: !originalContent,
      deferred
    };
    var diffResult = await deferred.promise;
    if (!diffResult || !diffResult.accepted) {
      yield { type: "tool_result", tool: "write_file", success: false, file_path: filePath, message: "Write rejected by user.", rejected: true };
      return;
    }
    await fs6.mkdir(path8.dirname(target), { recursive: true });
    await fs6.writeFile(target, content, "utf-8");
    yield { type: "tool_result", tool: "write_file", success: true, file_path: filePath, message: "File written: " + filePath };
  } catch (e) {
    yield { type: "tool_result", tool: "write_file", success: false, message: e.message };
  }
}
async function* edit_file(args, workspace6) {
  var filePath = args.file_path || "";
  var oldString = args.old_string || "";
  var newString = args.new_string || "";
  yield { type: "action", action: "edit_file", message: "Editing file: " + filePath };
  try {
    var target = _safePath(workspace6, filePath);
    if (!(0, import_fs6.existsSync)(target)) {
      yield { type: "tool_result", tool: "edit_file", success: false, message: "File not found: " + filePath };
      return;
    }
    var content = await fs6.readFile(target, "utf-8");
    var newContent = "";
    var idx = content.indexOf(oldString);
    if (idx !== -1) {
      newContent = content.substring(0, idx) + newString + content.substring(idx + oldString.length);
    } else {
      var escapeRegExp = function(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      };
      var tokens = oldString.trim().split(/\s+/);
      if (tokens.length === 0 || tokens.length === 1 && tokens[0] === "") {
        yield { type: "tool_result", tool: "edit_file", success: false, message: "old_string is empty." };
        return;
      }
      var regexParts = tokens.map(function(t) {
        return escapeRegExp(t);
      });
      var pattern = regexParts.join("\\s+");
      var regex = new RegExp(pattern, "g");
      var matches = [...content.matchAll(regex)];
      if (matches.length === 0) {
        yield { type: "tool_result", tool: "edit_file", success: false, message: "old_string not found in file (tried exact and fuzzy whitespace matching)." };
        return;
      }
      if (matches.length > 1) {
        yield { type: "tool_result", tool: "edit_file", success: false, message: "Multiple fuzzy matches for old_string found in file. Please provide more surrounding context." };
        return;
      }
      var match = matches[0];
      var matchIdx = match.index;
      var matchLen = match[0].length;
      newContent = content.substring(0, matchIdx) + newString + content.substring(matchIdx + matchLen);
    }
    var diffId = "diff_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
    var deferred = {};
    deferred.promise = new Promise(function(resolve3) {
      deferred.resolve = resolve3;
    });
    yield {
      type: "request_diff",
      id: diffId,
      tool: "edit_file",
      file_path: filePath,
      original_content: content,
      new_content: newContent,
      is_new_file: false,
      deferred
    };
    var diffResult = await deferred.promise;
    if (!diffResult || !diffResult.accepted) {
      yield { type: "tool_result", tool: "edit_file", success: false, file_path: filePath, message: "Edit rejected by user.", rejected: true };
      return;
    }
    await fs6.writeFile(target, newContent, "utf-8");
    yield { type: "tool_result", tool: "edit_file", success: true, file_path: filePath, message: "File edited: " + filePath };
  } catch (e) {
    yield { type: "tool_result", tool: "edit_file", success: false, message: e.message };
  }
}
async function* delete_file(args, workspace6) {
  var filePath = args.file_path || "";
  yield { type: "action", action: "delete_file", message: "Deleting file: " + filePath };
  try {
    var target = _safePath(workspace6, filePath);
    if (!(0, import_fs6.existsSync)(target)) {
      yield { type: "tool_result", tool: "delete_file", success: false, message: "File not found: " + filePath };
      return;
    }
    await fs6.unlink(target);
    yield { type: "tool_result", tool: "delete_file", success: true, file_path: filePath, message: "File deleted: " + filePath };
  } catch (e) {
    yield { type: "tool_result", tool: "delete_file", success: false, message: e.message };
  }
}
async function* create_folder(args, workspace6) {
  var folderPath = args.folder_path || "";
  yield { type: "action", action: "create_folder", message: "Creating folder: " + folderPath };
  try {
    var target = _safePath(workspace6, folderPath);
    await fs6.mkdir(target, { recursive: true });
    yield { type: "tool_result", tool: "create_folder", success: true, folder_path: folderPath, message: "Folder created: " + folderPath };
  } catch (e) {
    yield { type: "tool_result", tool: "create_folder", success: false, message: e.message };
  }
}
async function* delete_folder(args, workspace6) {
  var folderPath = args.folder_path || "";
  yield { type: "action", action: "delete_folder", message: "Deleting folder: " + folderPath };
  try {
    var target = _safePath(workspace6, folderPath);
    if (!(0, import_fs6.existsSync)(target)) {
      yield { type: "tool_result", tool: "delete_folder", success: false, message: "Folder not found: " + folderPath };
      return;
    }
    await fs6.rm(target, { recursive: true, force: true });
    yield { type: "tool_result", tool: "delete_folder", success: true, folder_path: folderPath, message: "Folder deleted: " + folderPath };
  } catch (e) {
    yield { type: "tool_result", tool: "delete_folder", success: false, message: e.message };
  }
}
async function* list_directory(args, workspace6) {
  var folderPath = args.folder_path || ".";
  yield { type: "action", action: "list_directory", message: "Listing directory: " + folderPath };
  try {
    var target = _safePath(workspace6, folderPath);
    var list = await fs6.readdir(target, { withFileTypes: true });
    var entries = list.map(function(item) {
      return { name: item.name, type: item.isDirectory() ? "directory" : "file" };
    });
    yield { type: "tool_result", tool: "list_directory", success: true, folder_path: folderPath, entries };
  } catch (e) {
    yield { type: "tool_result", tool: "list_directory", success: false, message: e.message };
  }
}
async function* search_files(args, workspace6) {
  var pattern = args.pattern || "*";
  var folderPath = args.folder_path || ".";
  yield { type: "action", action: "search_files", message: "Searching files: pattern='" + pattern + "' in '" + folderPath + "'" };
  try {
    var target = _safePath(workspace6, folderPath);
    var matches = [];
    try {
      var results = await searchFiles(pattern, workspace6, folderPath === "." ? "" : folderPath);
      matches = results || [];
    } catch (_) {
      matches = [];
    }
    yield { type: "tool_result", tool: "search_files", success: true, pattern, folder_path: folderPath, matches };
  } catch (e) {
    yield { type: "tool_result", tool: "search_files", success: false, message: e.message };
  }
}
async function* get_file_info(args, workspace6) {
  var filePath = args.file_path || "";
  yield { type: "action", action: "get_file_info", message: "Getting file info: " + filePath };
  try {
    var target = _safePath(workspace6, filePath);
    if (!(0, import_fs6.existsSync)(target)) {
      yield { type: "tool_result", tool: "get_file_info", success: false, message: "Path not found: " + filePath };
      return;
    }
    var stat4 = await fs6.stat(target);
    var info = {
      file_path: filePath,
      exists: true,
      is_file: stat4.isFile(),
      is_directory: stat4.isDirectory(),
      size: stat4.size,
      modified: stat4.mtime.toISOString(),
      created: stat4.birthtime.toISOString()
    };
    yield { type: "tool_result", tool: "get_file_info", success: true, info };
  } catch (e) {
    yield { type: "tool_result", tool: "get_file_info", success: false, message: e.message };
  }
}
async function* run_terminal(args, workspace6) {
  var command = args.command || "";
  var timeout = args.timeout || 30;
  var background = args.background || false;
  if (!command) {
    yield { type: "action", action: "run_terminal", message: "Checking terminal output..." };
    var checkResult = await checkTerminalOutput();
    yield {
      type: "tool_result",
      tool: "run_terminal",
      success: true,
      status: checkResult.status || "checking",
      stdout: checkResult.stdout || "",
      stderr: checkResult.stderr || "",
      output: checkResult.stdout || "",
      interactive: checkResult.interactive === true,
      prompt_detected: checkResult.promptDetected === true,
      waiting_for_input: checkResult.waitingForInput === true,
      shell: checkResult.shell || getShellName(),
      platform: checkResult.platform || getPlatformName(),
      working_directory: workspace6,
      exit_code: checkResult.exitCode,
      duration_ms: checkResult.durationMs || 0,
      message: "Terminal session is active. Current output:\n" + (checkResult.stdout || "(no new output)")
    };
    return;
  }
  yield { type: "action", action: "run_terminal", message: "Running command: " + command };
  try {
    dbg2("[TOOLS] run_terminal: calling terminalManager.executeCommand");
    var result = await executeCommand(command, timeout, background);
    dbg2("[TOOLS] run_terminal: executeCommand RETURNED. exitCode:", result.exitCode, "duration:", result.durationMs, "success:", result.success);
    var toolSuccess = result.exitCode === 0 || result.exitCode == null && result.success !== false;
    var toolExitCode = result.exitCode;
    var toolStderr = result.stderr || "";
    var toolStdout = result.stdout || "";
    var waitingForInput = result.waitingForInput === true;
    var interactive = result.interactive === true;
    var promptDetected = result.promptDetected === true;
    var status = result.status || (toolSuccess ? "completed" : "failed");
    dbg2("[TOOLS] run_terminal: yielding tool_result. exitCode:", toolExitCode, "success:", toolSuccess, "waitingForInput:", waitingForInput, "interactive:", interactive, "promptDetected:", promptDetected, "stdout length:", toolStdout.length);
    yield {
      type: "tool_result",
      tool: "run_terminal",
      success: toolSuccess,
      status,
      interactive,
      prompt_detected: promptDetected,
      // Structured terminal result for the LLM — accurate, no fabrication
      shell: result.shell || getShellName(),
      platform: result.platform || getPlatformName(),
      command,
      stdout: toolStdout,
      stderr: toolStderr,
      exit_code: toolExitCode,
      duration_ms: result.durationMs || 0,
      working_directory: result.workingDirectory || workspace6,
      waiting_for_input: waitingForInput,
      // Human-readable message based on actual output
      message: waitingForInput ? "The command is waiting for your input:\n" + (toolStdout || "(no output yet)") + "\n\nStatus: " + status + " | Interactive: " + interactive + " | Prompt detected: " + promptDetected + "\n\nUse `terminal_input` to respond to the prompt." : toolSuccess ? toolStdout || toolStderr ? "Command completed successfully." : "Command completed (no output)." : "Command failed" + (toolExitCode != null ? " with exit code " + toolExitCode : "") + (toolStderr ? ": " + toolStderr.trim().substring(0, 500) : "."),
      // Backward-compat fields
      output: toolStdout,
      exitCode: toolExitCode
    };
  } catch (e) {
    yield {
      type: "tool_result",
      tool: "run_terminal",
      success: false,
      command,
      stdout: "",
      stderr: e.message,
      exit_code: null,
      duration_ms: 0,
      shell: getShellName(),
      platform: getPlatformName(),
      working_directory: workspace6,
      message: "Execution error: " + e.message,
      output: "",
      exitCode: null
    };
  }
}
async function* get_current_datetime(args, workspace6) {
  yield { type: "action", action: "get_current_datetime", message: "Getting current date and time" };
  try {
    var now = (/* @__PURE__ */ new Date()).toISOString();
    yield { type: "tool_result", tool: "get_current_datetime", success: true, datetime: now };
  } catch (e) {
    yield { type: "tool_result", tool: "get_current_datetime", success: false, message: e.message };
  }
}
async function* find_in_files(args, workspace6) {
  var query = args.query || "";
  yield { type: "action", action: "find_in_files", message: "Searching file contents for: '" + query + "'" };
  if (!query) {
    yield { type: "tool_result", tool: "find_in_files", success: false, message: "No query provided." };
    return;
  }
  try {
    var results = await searchContent(query, workspace6);
    yield {
      type: "tool_result",
      tool: "find_in_files",
      success: true,
      query,
      results: results || [],
      message: results && results.length ? "Found " + results.length + " file(s) with matches." : "No matches found."
    };
  } catch (e) {
    yield { type: "tool_result", tool: "find_in_files", success: false, message: e.message };
  }
}
async function* terminal_input(args, workspace6) {
  var text = args.text || "";
  yield { type: "action", action: "terminal_input", message: "Sending input to terminal: " + text };
  try {
    var result = sendTerminalInput(text);
    yield { type: "tool_result", tool: "terminal_input", success: true, message: result.message };
  } catch (e) {
    yield { type: "tool_result", tool: "terminal_input", success: false, message: e.message };
  }
}
async function* stop_terminal(args, workspace6) {
  yield { type: "action", action: "stop_terminal", message: "Stopping terminal process (Ctrl+C)" };
  try {
    var result = await stopTerminal();
    yield { type: "tool_result", tool: "stop_terminal", success: true, message: result.message };
  } catch (e) {
    yield { type: "tool_result", tool: "stop_terminal", success: false, message: e.message };
  }
}
async function* list_symbols(args, workspace6) {
  var filePath = args.file_path || "";
  yield { type: "action", action: "list_symbols", message: "Getting code outline for: " + filePath };
  try {
    var target = _safePath(workspace6, filePath);
    if (!(0, import_fs6.existsSync)(target)) {
      yield { type: "tool_result", tool: "list_symbols", success: false, message: "File not found: " + filePath };
      return;
    }
    var content = await fs6.readFile(target, "utf-8");
    var symbols = parseSymbols(content, filePath);
    yield { type: "tool_result", tool: "list_symbols", success: true, file_path: filePath, entries: symbols };
  } catch (e) {
    yield { type: "tool_result", tool: "list_symbols", success: false, message: e.message };
  }
}
async function* patch_file(args, workspace6) {
  var filePath = args.file_path || "";
  var patches = args.patches || [];
  yield { type: "action", action: "patch_file", message: "Patching file: " + filePath + " (" + patches.length + " blocks)" };
  try {
    var target = _safePath(workspace6, filePath);
    if (!(0, import_fs6.existsSync)(target)) {
      yield { type: "tool_result", tool: "patch_file", success: false, message: "File not found: " + filePath };
      return;
    }
    var content = await fs6.readFile(target, "utf-8");
    var newContent = content;
    for (var i = 0; i < patches.length; i++) {
      var p = patches[i];
      var findStr = p.find || "";
      var replaceStr = p.replace || "";
      if (!findStr) continue;
      var idx = newContent.indexOf(findStr);
      if (idx !== -1) {
        newContent = newContent.substring(0, idx) + replaceStr + newContent.substring(idx + findStr.length);
      } else {
        var escapeRegExp = function(str) {
          return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        };
        var tokens = findStr.trim().split(/\s+/);
        if (tokens.length === 0 || tokens.length === 1 && tokens[0] === "") {
          yield { type: "tool_result", tool: "patch_file", success: false, message: "Patch #" + (i + 1) + " search block is empty." };
          return;
        }
        var regexParts = tokens.map(function(t) {
          return escapeRegExp(t);
        });
        var pattern = regexParts.join("\\s+");
        var regex = new RegExp(pattern, "g");
        var matches = [...newContent.matchAll(regex)];
        if (matches.length === 0) {
          yield { type: "tool_result", tool: "patch_file", success: false, message: "Patch #" + (i + 1) + " search block not found in file (tried exact and fuzzy matching)." };
          return;
        }
        if (matches.length > 1) {
          yield { type: "tool_result", tool: "patch_file", success: false, message: "Patch #" + (i + 1) + " search block is ambiguous (multiple matches found in file). Please add more context." };
          return;
        }
        var match = matches[0];
        var matchIdx = match.index;
        var matchLen = match[0].length;
        newContent = newContent.substring(0, matchIdx) + replaceStr + newContent.substring(matchIdx + matchLen);
      }
    }
    var diffId = "diff_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
    var deferred = {};
    deferred.promise = new Promise(function(resolve3) {
      deferred.resolve = resolve3;
    });
    yield {
      type: "request_diff",
      id: diffId,
      tool: "patch_file",
      file_path: filePath,
      original_content: content,
      new_content: newContent,
      is_new_file: false,
      deferred
    };
    var diffResult = await deferred.promise;
    if (!diffResult || !diffResult.accepted) {
      yield { type: "tool_result", tool: "patch_file", success: false, file_path: filePath, message: "Patch rejected by user.", rejected: true };
      return;
    }
    await fs6.writeFile(target, newContent, "utf-8");
    yield { type: "tool_result", tool: "patch_file", success: true, file_path: filePath, message: "File patched successfully: " + filePath };
  } catch (e) {
    yield { type: "tool_result", tool: "patch_file", success: false, message: e.message };
  }
}
async function* web_request(args, workspace6) {
  var url = args.url || "";
  var method = args.method || "GET";
  var headers = args.headers || {};
  var body = args.body || null;
  yield { type: "action", action: "web_request", message: "HTTP Request: " + method + " " + url };
  try {
    var options = {
      method,
      headers
    };
    if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
      options.body = typeof body === "object" ? JSON.stringify(body) : String(body);
      if (!headers["Content-Type"] && !headers["content-type"]) {
        options.headers["Content-Type"] = "application/json";
      }
    }
    var res = await fetch(url, options);
    var resText = await res.text();
    var maxBodyLen = 8e3;
    var truncated = false;
    if (resText.length > maxBodyLen) {
      resText = resText.substring(0, maxBodyLen);
      truncated = true;
    }
    var resHeaders = {};
    res.headers.forEach(function(value, key) {
      resHeaders[key] = value;
    });
    yield {
      type: "tool_result",
      tool: "web_request",
      success: true,
      url,
      status: res.status,
      status_text: res.statusText,
      headers: resHeaders,
      content: resText + (truncated ? "\n\n[Response body truncated for brevity]" : "")
    };
  } catch (e) {
    yield { type: "tool_result", tool: "web_request", success: false, message: e.message };
  }
}
async function* update_plan(args, workspace6) {
  yield { type: "action", action: "update_plan", message: "Updating execution plan" };
  var steps = args.steps;
  if (steps && !Array.isArray(steps)) steps = [steps];
  yield {
    type: "tool_result",
    tool: "update_plan",
    success: true,
    message: "Plan updated successfully.",
    steps
  };
}
async function* create_plan(args, workspace6) {
  yield { type: "action", action: "create_plan", message: "Creating execution plan" };
  var steps = args.steps;
  if (steps && !Array.isArray(steps)) steps = [steps];
  yield {
    type: "tool_result",
    tool: "create_plan",
    success: true,
    message: "Plan created successfully.",
    steps
  };
}
function registerAllTools() {
  register("read_file", read_file);
  register("read", read_file);
  register("write_file", write_file);
  register("write", write_file);
  register("edit_file", edit_file);
  register("edit", edit_file);
  register("delete_file", delete_file);
  register("create_folder", create_folder);
  register("delete_folder", delete_folder);
  register("list_directory", list_directory);
  register("search_files", search_files);
  register("get_file_info", get_file_info);
  register("run_terminal", run_terminal);
  register("bash", run_terminal);
  register("execute_command", run_terminal);
  register("terminal_input", terminal_input);
  register("stop_terminal", stop_terminal);
  register("list_symbols", list_symbols);
  register("patch_file", patch_file);
  register("web_request", web_request);
  register("get_current_datetime", get_current_datetime);
  register("find_in_files", find_in_files);
  register("update_plan", update_plan);
  register("create_plan", create_plan);
}

// src/config.js
var vscode4 = __toESM(require("vscode"), 1);
var _cached = null;
function getConfig() {
  if (_cached) return _cached;
  var cfg = vscode4.workspace.getConfiguration("qwen-coderun");
  _cached = {
    provider: cfg.get("provider", "ollama"),
    baseUrl: cfg.get("baseUrl", "http://localhost:11434"),
    model: cfg.get("model", ""),
    maxIterations: cfg.get("maxIterations", 20),
    streaming: cfg.get("streaming", true),
    showThinking: cfg.get("showThinking", true),
    autoScroll: cfg.get("autoScroll", true),
    confirmDangerous: cfg.get("confirmDangerous", true),
    organization: cfg.get("organization", null),
    project: cfg.get("project", null)
  };
  return _cached;
}
function invalidateCache() {
  _cached = null;
}
function getProviderConfig() {
  var cfg = getConfig();
  return {
    provider: "qwen",
    baseUrl: "https://chat.qwen.ai/api/v2",
    model: cfg.model || "qwen3.7-max",
    needsKey: true
  };
}
async function getProviderConfigWithKey(context) {
  var cfg = getProviderConfig();
  cfg.apiKey = await getApiKey(context) || "";
  return cfg;
}
async function getApiKey(context) {
  var key = "";
  try {
    key = context.globalState.get("qwen-coderun.fallbackCookie") || "";
  } catch (_) {
  }
  if (!key) {
    try {
      key = await context.secrets.get("qwen-coderun.apiKey") || "";
    } catch (_) {
    }
  }
  return key;
}
async function setApiKey(context, key) {
  try {
    await context.secrets.store("qwen-coderun.apiKey", key);
  } catch (_) {
  }
  await context.globalState.update("qwen-coderun.fallbackCookie", key);
}
async function deleteApiKey(context) {
  try {
    await context.secrets.delete("qwen-coderun.apiKey");
  } catch (_) {
  }
  await context.globalState.update("qwen-coderun.fallbackCookie", void 0);
}
async function updateSettings(settings, target) {
  target = target || vscode4.ConfigurationTarget.Global;
  var cfg = vscode4.workspace.getConfiguration("qwen-coderun");
  for (var key in settings) {
    await cfg.update(key, settings[key], target);
  }
  invalidateCache();
}
function needsApiKey2(provider) {
  return true;
}
function getAllProviderConfigs(context) {
  if (!context) return {};
  try {
    var raw = context.globalState.get(STORAGE_KEYS.PROVIDER_CONFIGS, "{}");
    return JSON.parse(raw) || {};
  } catch (e) {
    return {};
  }
}
function getSavedProviderConfig(context, provider) {
  var all = getAllProviderConfigs(context);
  return all[provider] || null;
}
async function saveProviderConfig(context, provider, config) {
  if (!context || !provider) return;
  var all = getAllProviderConfigs(context);
  all[provider] = {
    baseUrl: config.baseUrl || "",
    apiKey: config.apiKey || "",
    model: config.model || "",
    apiType: config.apiType || "openai"
  };
  await context.globalState.update(STORAGE_KEYS.PROVIDER_CONFIGS, JSON.stringify(all));
}
async function deleteProviderConfig(context, provider) {
  if (!context || !provider) return;
  var all = getAllProviderConfigs(context);
  delete all[provider];
  await context.globalState.update(STORAGE_KEYS.PROVIDER_CONFIGS, JSON.stringify(all));
}
async function getProviderConfigByName(context, providerName) {
  var saved = getSavedProviderConfig(context, providerName) || {};
  var isCompatible = providerName.startsWith("compatible");
  var defaults = isCompatible ? PROVIDER_DEFAULTS.compatible : PROVIDER_DEFAULTS[providerName] || PROVIDER_DEFAULTS.ollama;
  return {
    provider: providerName,
    baseUrl: saved.baseUrl || defaults.baseUrl,
    model: saved.model || "",
    apiKey: saved.apiKey || "",
    needsKey: defaults.needsKey,
    apiType: saved.apiType || "openai"
  };
}

// src/extension.js
init_providerManager();

// src/workspaceContext.js
var vscode5 = __toESM(require("vscode"), 1);
function getWorkspaceFolder() {
  var folders = vscode5.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return "";
  return folders[0].uri.fsPath;
}

// src/diffManager.js
var vscode6 = __toESM(require("vscode"), 1);
var fs7 = __toESM(require("fs/promises"), 1);
var os = __toESM(require("os"), 1);
var path9 = __toESM(require("path"), 1);
var _pendingPatches = {};
function storePatch(event) {
  var diffId = event.id;
  var originalText = event.original_content || "";
  var modifiedText = event.new_content || "";
  var stats = computeDiffStats(originalText, modifiedText);
  var patch = {
    id: diffId,
    filePath: event.file_path || "",
    originalText,
    modifiedText,
    isNewFile: event.is_new_file || false,
    tool: event.tool || "write_file",
    status: "pending",
    additions: stats.additions,
    deletions: stats.deletions,
    createdAt: Date.now()
  };
  _pendingPatches[diffId] = patch;
  return patch;
}
async function applyPatch(diffId, workspace6) {
  var patch = _pendingPatches[diffId];
  if (!patch) {
    return { success: false, message: "Patch not found: " + diffId };
  }
  if (patch.status !== "pending") {
    return { success: false, message: "Patch already " + patch.status };
  }
  patch.status = "accepted";
  if (patch.deferred && patch.deferred.resolve) {
    patch.deferred.resolve({ accepted: true });
  }
  delete _pendingPatches[diffId];
  return { success: true, message: "Applied: " + patch.filePath };
}
function rejectPatch(diffId) {
  var patch = _pendingPatches[diffId];
  if (!patch) {
    return { success: false, message: "Patch not found: " + diffId };
  }
  patch.status = "rejected";
  if (patch.deferred && patch.deferred.resolve) {
    patch.deferred.resolve({ accepted: false });
  }
  delete _pendingPatches[diffId];
  return { success: true, message: "Rejected: " + patch.filePath };
}
function getPatch(diffId) {
  return _pendingPatches[diffId] || null;
}
function getPendingPatches() {
  var result = [];
  for (var id in _pendingPatches) {
    if (_pendingPatches[id].status === "pending") {
      result.push(_pendingPatches[id]);
    }
  }
  return result;
}
async function acceptAll(workspace6) {
  var patches = getPendingPatches();
  var results = [];
  for (var i = 0; i < patches.length; i++) {
    var r = await applyPatch(patches[i].id, workspace6);
    r.diffId = patches[i].id;
    results.push(r);
  }
  return results;
}
function rejectAll() {
  var patches = getPendingPatches();
  var results = [];
  for (var i = 0; i < patches.length; i++) {
    var r = rejectPatch(patches[i].id);
    r.diffId = patches[i].id;
    results.push(r);
  }
  return results;
}
function cancelAll() {
  for (var id in _pendingPatches) {
    var patch = _pendingPatches[id];
    if (patch && patch.deferred && patch.deferred.resolve) {
      patch.deferred.resolve({ accepted: false });
    }
  }
  _pendingPatches = {};
}
async function openDiffEditor(diffId, workspace6) {
  var patch = _pendingPatches[diffId] || getPatch(diffId);
  if (!patch) return;
  try {
    var tmpDir = path9.join(os.tmpdir(), "qwen-coderun-diff");
    await fs7.mkdir(tmpDir, { recursive: true });
    var originalName = patch.isNewFile ? "(new) " + patch.filePath : patch.filePath;
    var originalUri = vscode6.Uri.file(path9.join(tmpDir, originalName.replace(/[\\/:*?"<>|]/g, "_") + ".original"));
    var proposedUri = vscode6.Uri.file(path9.join(tmpDir, patch.filePath.replace(/[\\/:*?"<>|]/g, "_") + ".proposed"));
    await fs7.writeFile(originalUri.fsPath, patch.originalText, "utf-8");
    await fs7.writeFile(proposedUri.fsPath, patch.modifiedText, "utf-8");
    var title = patch.isNewFile ? "Create: " + patch.filePath : "Edit: " + patch.filePath;
    await vscode6.commands.executeCommand("vscode.diff", originalUri, proposedUri, title);
  } catch (err) {
    console.error("[QWEN_CODERUN] Error opening diff editor:", err);
  }
}
function computeDiffStats(originalText, modifiedText) {
  var originalLines = originalText ? originalText.split("\n") : [];
  var modifiedLines = modifiedText ? modifiedText.split("\n") : [];
  var additions = 0;
  var deletions = 0;
  var maxLen = Math.max(originalLines.length, modifiedLines.length);
  for (var i = 0; i < maxLen; i++) {
    var orig = originalLines[i] || "";
    var mod = modifiedLines[i] || "";
    if (orig !== mod) {
      if (!orig && mod) additions++;
      else if (orig && !mod) deletions++;
      else {
        additions++;
        deletions++;
      }
    }
  }
  return { additions, deletions };
}

// src/extension.js
var import_meta = {};
var __filename2 = (0, import_url.fileURLToPath)(import_meta.url);
var __dirname2 = path10.dirname(__filename2);
var statusBarItem;
var currentWebview = null;
var sidebarWebviewView = null;
var extensionContext2 = null;
var currentAbortController = null;
function mergeSetCookies(currentCookieStr, setCookiesArray) {
  if (!setCookiesArray || !setCookiesArray.length) return currentCookieStr;
  if (currentCookieStr && currentCookieStr.trim().startsWith("eyJ")) {
    currentCookieStr = "token=" + currentCookieStr.trim();
  }
  var cookieMap = /* @__PURE__ */ new Map();
  if (currentCookieStr) {
    var parts = currentCookieStr.split(";");
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i].trim();
      if (!part) continue;
      var eqIdx = part.indexOf("=");
      if (eqIdx !== -1) {
        var key = part.substring(0, eqIdx).trim();
        var val = part.substring(eqIdx + 1).trim();
        if (key) cookieMap.set(key, val);
      } else if (part.startsWith("eyJ")) {
        cookieMap.set("token", part);
      }
    }
  }
  for (var j = 0; j < setCookiesArray.length; j++) {
    var setCookieStr = setCookiesArray[j];
    var mainPart = setCookieStr.split(";")[0].trim();
    var eqIdx2 = mainPart.indexOf("=");
    if (eqIdx2 !== -1) {
      var key2 = mainPart.substring(0, eqIdx2).trim();
      var val2 = mainPart.substring(eqIdx2 + 1).trim();
      if (key2) cookieMap.set(key2, val2);
    }
  }
  var newParts = [];
  cookieMap.forEach(function(val3, key3) {
    newParts.push(key3 + "=" + val3);
  });
  return newParts.join("; ");
}
globalThis.qwenMergeSetCookies = mergeSetCookies;
function activate(context) {
  console.log("[QWEN_CODERUN] Extension Activated");
  extensionContext2 = context;
  try {
    var key = context.globalState.get("qwen-coderun.fallbackCookie") || "";
    fs8.writeFileSync("D:/coderun-extension/debug_auth.log", JSON.stringify({
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      activated: true,
      hasContext: !!context,
      cookieLength: key ? key.length : 0,
      cookieStart: key ? key.substring(0, 30) : "",
      globalStateKeys: context ? context.globalState.keys() : []
    }, null, 2));
  } catch (err) {
    console.error("[QWEN_CODERUN] activate write error:", err);
  }
  globalThis.qwenOnCookieUpdate = async function(newCookie) {
    if (context && newCookie) {
      await setApiKey(context, newCookie);
      console.log("[QWEN_CODERUN] Cookies updated and saved automatically!");
    }
  };
  registerAllTools();
  setExtensionContext(context);
  registerTerminalListeners(context);
  initialize(context);
  statusBarItem = vscode7.window.createStatusBarItem(vscode7.StatusBarAlignment.Right, 100);
  statusBarItem.command = "qwen-coderun.openSidebar";
  statusBarItem.text = "$(comment-discussion) Qwen CodeRun";
  statusBarItem.tooltip = "Open Qwen CodeRun AI Agent";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);
  context.subscriptions.push(
    vscode7.commands.registerCommand("qwen-coderun.openSidebar", function() {
      vscode7.commands.executeCommand("qwen-coderun.chatView.focus");
    })
  );
  context.subscriptions.push(
    vscode7.commands.registerCommand("qwen-coderun.openPanel", function() {
      createOrShowPanel(context.extensionUri);
    })
  );
  context.subscriptions.push(
    vscode7.commands.registerCommand("qwen-coderun.newChat", function() {
      if (currentWebview) {
        currentWebview.postMessage({ type: "newChat" });
      }
    })
  );
  context.subscriptions.push(
    vscode7.commands.registerCommand("qwen-coderun.undoLastEdit", async function() {
      var ws = getWorkspaceFolder();
      if (!ws) {
        vscode7.window.showInformationMessage("No workspace folder open");
        return;
      }
      var result = await undoLast(ws, null);
      if (result.success) {
        vscode7.window.showInformationMessage(result.message);
        if (currentWebview) {
          currentWebview.postMessage({ type: "undoComplete", message: result.message });
        }
      } else {
        vscode7.window.showInformationMessage(result.message || "Nothing to undo");
      }
    })
  );
  var sidebarProvider = new SidebarWebviewViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode7.window.registerWebviewViewProvider("qwen-coderun.chatView", sidebarProvider, {
      webviewOptions: { retainContextWhenHidden: true }
    })
  );
  context.subscriptions.push(
    vscode7.window.onDidCloseTerminal(function(terminal) {
      onTerminalClosed(terminal);
    })
  );
  context.subscriptions.push(
    vscode7.workspace.onDidChangeConfiguration(async function(e) {
      if (e.affectsConfiguration("qwen-coderun")) {
        invalidateCache();
        if (currentWebview) {
          await sendCurrentSettings(currentWebview);
          await checkProviderHealth(currentWebview);
        }
      }
    })
  );
}
var SidebarWebviewViewProvider = class {
  constructor(extensionUri) {
    this.extensionUri = extensionUri;
  }
  resolveWebviewView(webviewView, context, token) {
    console.log("[QWEN_CODERUN] resolveWebviewView called");
    try {
      fs8.appendFileSync("D:/coderun-extension/debug_auth.log", `
[EVENT] ${(/* @__PURE__ */ new Date()).toISOString()} - resolveWebviewView called
`);
    } catch (_) {
    }
    sidebarWebviewView = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode7.Uri.file(path10.join(this.extensionUri.fsPath, "src"))]
    };
    webviewView.webview.html = getWebviewHtml(webviewView.webview, this.extensionUri);
    webviewView.webview.onDidReceiveMessage(function(message) {
      handleFrontendMessage(message, webviewView.webview);
    });
    currentWebview = webviewView.webview;
  }
};
function createOrShowPanel(extensionUri) {
  try {
    fs8.appendFileSync("D:/coderun-extension/debug_auth.log", `
[EVENT] ${(/* @__PURE__ */ new Date()).toISOString()} - createOrShowPanel called
`);
  } catch (_) {
  }
  var panel = vscode7.window.createWebviewPanel(
    "qwen-coderunPanel",
    "Qwen CodeRun Agent",
    vscode7.ViewColumn.Two,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode7.Uri.file(path10.join(extensionUri.fsPath, "src"))]
    }
  );
  panel.webview.html = getWebviewHtml(panel.webview, extensionUri);
  panel.webview.onDidReceiveMessage(function(message) {
    handleFrontendMessage(message, panel.webview);
  });
  currentWebview = panel.webview;
}
function getWebviewHtml(webview, extensionUri) {
  var srcPath = path10.join(extensionUri.fsPath, "src");
  var nonce = getNonce();
  var dashboardCss = webview.asWebviewUri(vscode7.Uri.file(path10.join(srcPath, "Dashboard.css")));
  var chatSpaceCss = webview.asWebviewUri(vscode7.Uri.file(path10.join(srcPath, "ChatSpace.css")));
  var markdownJs = webview.asWebviewUri(vscode7.Uri.file(path10.join(srcPath, "MarkdownRenderer.js")));
  var dashboardJs = webview.asWebviewUri(vscode7.Uri.file(path10.join(srcPath, "Dashboard.js")));
  var chatSpaceJs = webview.asWebviewUri(vscode7.Uri.file(path10.join(srcPath, "ChatSpace.js")));
  var workspaceFolder = getWorkspaceFolder();
  var cfg = getConfig();
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
  var text = "";
  var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (var i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
async function sendCurrentSettings(webview) {
  var activeProvider = extensionContext2?.globalState.get("qwen-coderun_selected_provider", "") || "";
  var cfg;
  if (activeProvider) {
    var saved = getSavedProviderConfig(extensionContext2, activeProvider) || {};
    var isCompatible = activeProvider.startsWith("compatible");
    var defaults = isCompatible ? PROVIDER_DEFAULTS.compatible : PROVIDER_DEFAULTS[activeProvider] || PROVIDER_DEFAULTS.ollama;
    cfg = {
      provider: activeProvider,
      baseUrl: saved.baseUrl || defaults.baseUrl,
      model: saved.model || "",
      maxIterations: getConfig().maxIterations,
      streaming: getConfig().streaming,
      showThinking: getConfig().showThinking,
      confirmDangerous: getConfig().confirmDangerous
    };
  } else {
    cfg = getConfig();
  }
  var hasKey = false;
  try {
    if (activeProvider) {
      var saved = getSavedProviderConfig(extensionContext2, activeProvider);
      hasKey = saved && !!saved.apiKey;
    } else {
      var key = await getApiKey(extensionContext2);
      hasKey = !!key && key.length > 0;
    }
  } catch (e) {
    hasKey = false;
  }
  var providerConfigs = getAllProviderConfigs(extensionContext2);
  webview.postMessage({
    type: "currentSettings",
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
    providerConfigs
  });
}
async function qwenGetHeaders(context) {
  var cookieStr = await getApiKey(context) || "";
  if (!cookieStr) return null;
  var token = "";
  var finalCookie = cookieStr;
  if (cookieStr.trim().startsWith("eyJ")) {
    token = cookieStr.trim();
    finalCookie = "token=" + token;
  } else {
    var parts = cookieStr.split(";");
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i].trim();
      if (part.startsWith("token=")) {
        token = part.substring(6);
        break;
      }
    }
  }
  var h = {
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Connection": "keep-alive",
    "Host": "chat.qwen.ai",
    "Sec-Ch-Ua": '"Not/A)Brand";v="99", "Chromium";v="148"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "source": "web",
    "timezone": (/* @__PURE__ */ new Date()).toString(),
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Code/1.130.0 Chrome/148.0.7778.280 Electron/42.6.0 Safari/537.36",
    "version": "0.2.78",
    "Referer": "https://chat.qwen.ai/",
    "Origin": "https://chat.qwen.ai",
    "Cookie": finalCookie
  };
  if (token) h["authorization"] = "Bearer " + token;
  return h;
}
async function fetchQwenChatsList(context) {
  var headers = await qwenGetHeaders(context);
  if (!headers) {
    console.error("[QWEN_CODERUN] qwenGetHeaders returned null");
    return null;
  }
  headers["x-request-id"] = "req-uuid-" + Date.now();
  try {
    var r = await fetch("https://chat.qwen.ai/api/v2/chats", { headers });
    console.log("[QWEN_CODERUN] fetchQwenChatsList response status:", r.status);
    if (r.ok) {
      var setCookies = typeof r.headers.getSetCookie === "function" ? r.headers.getSetCookie() : r.headers.get("set-cookie") ? r.headers.get("set-cookie").split(",") : null;
      if (setCookies && setCookies.length && typeof globalThis.qwenOnCookieUpdate === "function") {
        var currentCookie = await getApiKey(context);
        var merged = mergeSetCookies(currentCookie, setCookies);
        if (merged !== currentCookie) {
          await globalThis.qwenOnCookieUpdate(merged);
        }
      }
      var text = await r.text();
      try {
        var data = JSON.parse(text);
        if (data.success) {
          return data.data;
        } else {
          console.error("[QWEN_CODERUN] fetchQwenChatsList API success is false:", data);
        }
      } catch (jsonErr) {
        console.error("[QWEN_CODERUN] fetchQwenChatsList JSON parse error on response:", text.substring(0, 1e3));
      }
    } else {
      var errText = await r.text();
      console.error("[QWEN_CODERUN] fetchQwenChatsList HTTP error:", r.status, r.statusText, errText.substring(0, 1e3));
    }
  } catch (e) {
    console.error("[QWEN_CODERUN] Error fetching chats list:", e);
  }
  return null;
}
async function fetchQwenChatDetail(context, chatId) {
  var headers = await qwenGetHeaders(context);
  if (!headers) return null;
  headers["x-request-id"] = "req-uuid-" + Date.now();
  headers["Referer"] = "https://chat.qwen.ai/c/" + chatId;
  try {
    var r = await fetch("https://chat.qwen.ai/api/v2/chats/" + chatId, { headers });
    console.log("[QWEN_CODERUN] fetchQwenChatDetail status:", r.status);
    if (r.ok) {
      var setCookies = typeof r.headers.getSetCookie === "function" ? r.headers.getSetCookie() : r.headers.get("set-cookie") ? r.headers.get("set-cookie").split(",") : null;
      if (setCookies && setCookies.length && typeof globalThis.qwenOnCookieUpdate === "function") {
        var currentCookie = await getApiKey(context);
        var merged = mergeSetCookies(currentCookie, setCookies);
        if (merged !== currentCookie) {
          await globalThis.qwenOnCookieUpdate(merged);
        }
      }
      var text = await r.text();
      try {
        var data = JSON.parse(text);
        if (data.success && data.data && data.data.chat) {
          return data.data.chat.messages || [];
        } else {
          console.error("[QWEN_CODERUN] fetchQwenChatDetail API success is false or missing data:", data);
        }
      } catch (jsonErr) {
        console.error("[QWEN_CODERUN] fetchQwenChatDetail JSON parse error on response:", text.substring(0, 1e3));
      }
    } else {
      var errText = await r.text();
      console.error("[QWEN_CODERUN] fetchQwenChatDetail HTTP error:", r.status, r.statusText, errText.substring(0, 1e3));
    }
  } catch (e) {
    console.error("[QWEN_CODERUN] Error fetching chat detail:", e);
  }
  return null;
}
async function handleFrontendMessage(message, webview) {
  console.log("[QWEN_CODERUN] Received message:", message.type || message.command);
  var msgType = message.type || message.command;
  try {
    fs8.appendFileSync("D:/coderun-extension/debug_auth.log", `
[MSG] ${(/* @__PURE__ */ new Date()).toISOString()} - ${msgType}
`);
  } catch (err) {
  }
  switch (msgType) {
    case "webviewReady": {
      var wsFolder = getWorkspaceFolder();
      webview.postMessage({ type: "workspaceFolder", path: wsFolder });
      try {
        webview.postMessage({
          type: "permissionState",
          decisions: listAlwaysDecisions()
        });
        var cookie = await getApiKey(extensionContext2);
        try {
          fs8.writeFileSync("D:/coderun-extension/debug_auth.log", JSON.stringify({
            timestamp: (/* @__PURE__ */ new Date()).toISOString(),
            hasExtensionContext: !!extensionContext2,
            cookieLength: cookie ? cookie.length : 0,
            cookieStart: cookie ? cookie.substring(0, 30) : "",
            globalStateKeys: extensionContext2 ? extensionContext2.globalState.keys() : []
          }, null, 2));
        } catch (logErr) {
          console.error("[QWEN_CODERUN] Failed to write debug log:", logErr);
        }
        if (cookie) {
          webview.postMessage({ type: "qwenAuthState", authenticated: true });
          try {
            var chats = await fetchQwenChatsList(extensionContext2);
            if (chats) {
              var mappedChats = chats.map(function(c) {
                return { id: c.id, title: c.title || "Untitled Session" };
              });
              webview.postMessage({ type: "loadConversations", conversations: JSON.stringify(mappedChats) });
            }
          } catch (e) {
            console.error("[QWEN_CODERUN] Error loading active chats:", e.message);
          }
        } else {
          webview.postMessage({ type: "qwenAuthState", authenticated: false });
        }
      } catch (e) {
        console.error("[QWEN_CODERUN] Failed to send initial data:", e);
      }
      await sendCurrentSettings(webview);
      break;
    }
    case "webviewError": {
      try {
        fs8.appendFileSync("D:/coderun-extension/debug_auth.log", `
[WEBVIEW ERROR] ${JSON.stringify(message, null, 2)}
`);
      } catch (_) {
      }
      break;
    }
    case "startChat": {
      var userPrompt = message.message;
      var userImage = message.image || null;
      var history = message.history;
      var workspaceFolder = message.workspaceFolder;
      if (!history || history.length === 0) {
        resetTerminal();
      }
      var providerName = message.provider || "";
      var frontendModel = message.model || "";
      var providerConfig;
      if (providerName && (PROVIDER_DEFAULTS[providerName] || providerName.startsWith("compatible:"))) {
        providerConfig = await getProviderConfigByName(extensionContext2, providerName);
      } else {
        providerConfig = await getProviderConfigWithKey(extensionContext2);
      }
      providerConfig.chatId = message.conversationId;
      if (frontendModel && frontendModel.trim()) {
        providerConfig.model = frontendModel.trim();
      }
      if (!providerConfig.model) {
        webview.postMessage({
          type: "agentEvent",
          event: { type: "stream_error", error: "No model configured. Please select a model in the Qwen CodeRun model dropdown." }
        });
        break;
      }
      if (needsApiKey2(providerConfig.provider) && !providerConfig.apiKey) {
        webview.postMessage({
          type: "agentEvent",
          event: { type: "stream_error", error: "API key required for " + providerConfig.provider + ". Please set it in Qwen CodeRun settings." }
        });
        break;
      }
      setSendEventCallback(function(event) {
        webview.postMessage({ type: "agentEvent", event });
      });
      var askPermission = function(toolName, args, id) {
        var persistent = getAlwaysDecision(toolName);
        if (persistent) {
          sendEvent({
            type: "requestPermission",
            tool: toolName,
            arguments: args,
            id,
            autoResolved: true,
            decision: persistent
          });
          return Promise.resolve(persistent === "allow");
        }
        sendEvent({
          type: "requestPermission",
          tool: toolName,
          arguments: args,
          id
        });
        return requestPermission(toolName, args, id, null);
      };
      var sendEvent = function(event) {
        webview.postMessage({ type: "agentEvent", event });
        if (event.type === "request_diff" && event.id) {
          storePatch(event);
        }
      };
      currentAbortController = { stopped: false };
      var abortCtrl = currentAbortController;
      try {
        console.log("[EXTENSION] Calling runAgent...");
        await runAgent(userPrompt, providerConfig.model, workspaceFolder, history, providerConfig, sendEvent, askPermission, { signal: abortCtrl, image: userImage });
        console.log("[EXTENSION] runAgent completed");
        webview.postMessage({ type: "agentEvent", event: { type: "stream_end", stopped: abortCtrl.stopped } });
        if (providerConfig.chatId && message.conversationId && message.conversationId !== providerConfig.chatId) {
          webview.postMessage({
            type: "qwenChatIdTransition",
            oldId: message.conversationId,
            newId: providerConfig.chatId
          });
        }
      } catch (err) {
        console.error("[EXTENSION] Agent error:", err);
        webview.postMessage({ type: "agentEvent", event: { type: "stream_error", error: err.message } });
      } finally {
        console.log("[EXTENSION] runAgent finally block");
        if (currentAbortController === abortCtrl) currentAbortController = null;
      }
      break;
    }
    case "stopChat": {
      if (currentAbortController) {
        currentAbortController.stopped = true;
      }
      cancelAllPermissions();
      cancelAll();
      break;
    }
    case "permissionResponse": {
      resolvePermission(
        message.toolCallId,
        !!message.approved,
        { always: !!message.always, tool: message.tool }
      );
      break;
    }
    case "clearPermissionDecision": {
      if (message.tool) {
        clearAlwaysDecision(message.tool);
      } else {
        clearAlwaysDecision();
      }
      webview.postMessage({
        type: "permissionState",
        decisions: listAlwaysDecisions()
      });
      break;
    }
    case "showAlert": {
      if (message.message) vscode7.window.showErrorMessage(message.message);
      break;
    }
    case "confirmDelete": {
      vscode7.window.showWarningMessage(
        "Delete this conversation?",
        { modal: true },
        "Delete"
      ).then(function(choice) {
        if (choice === "Delete" && webview) {
          webview.postMessage({ type: "deleteConversationConfirmed", id: message.id });
        }
      });
      break;
    }
    case "confirmClearAll": {
      vscode7.window.showWarningMessage(
        "Delete ALL conversations? This cannot be undone.",
        { modal: true },
        "Delete All"
      ).then(function(choice) {
        if (choice === "Delete All" && webview) {
          webview.postMessage({ type: "clearAllConversationsConfirmed" });
        }
      });
      break;
    }
    case "runInTerminal":
    case "terminalCommand": {
      executeCommandLegacy(message.text);
      break;
    }
    case "requestWorkspaceFolder": {
      webview.postMessage({ type: "workspaceFolder", path: getWorkspaceFolder() });
      break;
    }
    case "saveConversations": {
      if (message.conversations && extensionContext2) {
        try {
          await extensionContext2.globalState.update("qwen-coderun_conversations", message.conversations);
        } catch (e) {
          console.error("[QWEN_CODERUN] Failed to save conversations:", e);
        }
      }
      break;
    }
    case "saveSelectedModel": {
      if (message.model && extensionContext2) {
        try {
          await extensionContext2.globalState.update("qwen-coderun_selected_model", message.model);
        } catch (e) {
          console.error("[QWEN_CODERUN] Failed to save model:", e);
        }
      }
      if (message.provider !== void 0 && extensionContext2) {
        try {
          await extensionContext2.globalState.update("qwen-coderun_selected_provider", message.provider);
        } catch (e) {
          console.error("[QWEN_CODERUN] Failed to save provider:", e);
        }
      }
      await sendCurrentSettings(webview);
      break;
    }
    case "openQwenLogin": {
      vscode7.env.openExternal(vscode7.Uri.parse("https://chat.qwen.ai/"));
      break;
    }
    case "loginQwen": {
      var pastedCookie = message.cookie || "";
      if (!pastedCookie) {
        webview.postMessage({ type: "qwenAuthState", authenticated: false, error: "Empty cookie string." });
        break;
      }
      await setApiKey(extensionContext2, pastedCookie);
      try {
        var testChats = await fetchQwenChatsList(extensionContext2);
        if (testChats) {
          webview.postMessage({ type: "qwenAuthState", authenticated: true });
          var mappedChats = testChats.map(function(c) {
            return { id: c.id, title: c.title || "Untitled Session" };
          });
          webview.postMessage({ type: "loadConversations", conversations: JSON.stringify(mappedChats) });
        } else {
          await deleteApiKey(extensionContext2);
          webview.postMessage({ type: "qwenAuthState", authenticated: false, error: "Invalid cookie. Please copy the fresh headers cookie string from chat.qwen.ai." });
        }
      } catch (e) {
        await deleteApiKey(extensionContext2);
        webview.postMessage({ type: "qwenAuthState", authenticated: false, error: "Network connection failed: " + e.message });
      }
      break;
    }
    case "logoutQwen": {
      await deleteApiKey(extensionContext2);
      webview.postMessage({ type: "qwenAuthState", authenticated: false });
      break;
    }
    case "getQwenChatDetail": {
      var chatId = message.chatId;
      try {
        var rawMessages = await fetchQwenChatDetail(extensionContext2, chatId);
        if (rawMessages) {
          var formattedMessages = [];
          for (var i = 0; i < rawMessages.length; i++) {
            var msg = rawMessages[i];
            var role = msg.role;
            if (role === "user") {
              formattedMessages.push({
                role: "user",
                content: msg.content || ""
              });
            } else if (role === "assistant") {
              var contentList = msg.content_list || [];
              var thinkContent = "";
              var answerContent = "";
              for (var j = 0; j < contentList.length; j++) {
                var block = contentList[j];
                var phase = block.phase;
                if (phase === "think") {
                  thinkContent += block.content || "";
                } else if (phase === "answer") {
                  answerContent += block.content || "";
                }
              }
              if (!answerContent && !thinkContent) {
                answerContent = msg.content || "";
              }
              formattedMessages.push({
                role: "assistant",
                thinking: thinkContent,
                content: answerContent
              });
            }
          }
          webview.postMessage({ type: "qwenChatDetail", success: true, chatId, messages: formattedMessages });
        } else {
          webview.postMessage({ type: "qwenChatDetail", success: false, error: "Failed to fetch details." });
        }
      } catch (e) {
        webview.postMessage({ type: "qwenChatDetail", success: false, error: e.message });
      }
      break;
    }
    case "saveSettings": {
      if (message.settings) {
        console.log("[QWEN_CODERUN] Saving settings:", JSON.stringify(message.settings));
        try {
          var settingsToUpdate = {};
          if (message.settings.provider !== void 0) settingsToUpdate.provider = message.settings.provider;
          if (message.settings.baseUrl !== void 0) settingsToUpdate.baseUrl = message.settings.baseUrl;
          if (message.settings.model !== void 0) settingsToUpdate.model = message.settings.model;
          if (message.settings.maxIterations !== void 0) settingsToUpdate.maxIterations = message.settings.maxIterations;
          if (message.settings.streaming !== void 0) settingsToUpdate.streaming = message.settings.streaming;
          if (message.settings.showThinking !== void 0) settingsToUpdate.showThinking = message.settings.showThinking;
          if (message.settings.confirmDangerous !== void 0) settingsToUpdate.confirmDangerous = message.settings.confirmDangerous;
          console.log("[QWEN_CODERUN] Updating VS Code settings:", JSON.stringify(settingsToUpdate));
          await updateSettings(settingsToUpdate, vscode7.ConfigurationTarget.Global);
          console.log("[QWEN_CODERUN] Settings saved successfully");
          var resolvedApiKey = "";
          if (message.apiKey !== void 0 && message.apiKey !== null) {
            if (message.apiKey === "") {
              console.log("[QWEN_CODERUN] Deleting API key from secrets");
              await deleteApiKey(extensionContext2);
            } else if (message.apiKey !== "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022") {
              console.log("[QWEN_CODERUN] Saving API key to secrets");
              await setApiKey(extensionContext2, message.apiKey);
              resolvedApiKey = message.apiKey;
            } else {
              try {
                resolvedApiKey = await getApiKey(extensionContext2) || "";
              } catch (_) {
              }
            }
          }
          var savedProvider = message.settings.provider || getConfig().provider;
          var savedBaseUrl = message.settings.baseUrl || getConfig().baseUrl;
          await saveProviderConfig(extensionContext2, savedProvider, {
            baseUrl: savedBaseUrl,
            apiKey: resolvedApiKey,
            model: message.settings.model || "",
            apiType: message.settings.apiType || "openai"
          });
          var overrideCfg = await getProviderConfigWithKey(extensionContext2);
          if (message.settings.provider) overrideCfg.provider = message.settings.provider;
          if (message.settings.baseUrl) overrideCfg.baseUrl = message.settings.baseUrl;
          if (message.settings.model) overrideCfg.model = message.settings.model;
          await sendCurrentSettings(webview);
          await checkProviderHealth(webview, overrideCfg);
          await refreshAllProviderModels(webview);
        } catch (e) {
          console.error("[QWEN_CODERUN] Failed to save settings:", e);
          webview.postMessage({ type: "showAlert", message: "Failed to save settings: " + e.message });
        }
      }
      break;
    }
    case "saveApiKey": {
      if (message.apiKey !== void 0 && extensionContext2) {
        if (message.apiKey === "") {
          await deleteApiKey(extensionContext2);
        } else {
          await setApiKey(extensionContext2, message.apiKey);
        }
        await sendCurrentSettings(webview);
        await checkProviderHealth(webview);
        await refreshAllProviderModels(webview);
      }
      break;
    }
    case "removeProviderConfig": {
      if (message.provider && extensionContext2) {
        console.log("[QWEN_CODERUN] Removing saved config for provider:", message.provider);
        await deleteProviderConfig(extensionContext2, message.provider);
        await sendCurrentSettings(webview);
        await refreshAllProviderModels(webview);
      }
      break;
    }
    case "requestConversations": {
      if (!extensionContext2) {
        webview.postMessage({ type: "loadConversations", conversations: "[]", selectedModel: "", selectedProvider: "" });
        return;
      }
      try {
        var stored = extensionContext2.globalState.get("qwen-coderun_conversations", "[]");
        var selectedModel = extensionContext2.globalState.get("qwen-coderun_selected_model", "");
        var selectedProvider = extensionContext2.globalState.get("qwen-coderun_selected_provider", "");
        webview.postMessage({ type: "loadConversations", conversations: stored, selectedModel, selectedProvider });
      } catch (e) {
        webview.postMessage({ type: "loadConversations", conversations: "[]", selectedModel: "", selectedProvider: "" });
      }
      break;
    }
    case "checkHealth": {
      await checkProviderHealth(webview);
      break;
    }
    case "refreshAllModels": {
      await refreshAllProviderModels(webview);
      break;
    }
    case "openFile": {
      if (message.path) {
        var wsPath = getWorkspaceFolder();
        var fullPath = path10.join(wsPath, message.path);
        vscode7.workspace.openTextDocument(fullPath).then(function(doc) {
          vscode7.window.showTextDocument(doc);
        }).catch(function(err) {
          console.error("[QWEN_CODERUN] Failed to open file:", err);
        });
      }
      break;
    }
    case "undoFile": {
      var wsPath = getWorkspaceFolder();
      var result;
      if (message.path) {
        result = await undoFile(message.path, wsPath, null);
      } else {
        result = await undoLast(wsPath, null);
      }
      if (result && result.success) {
        vscode7.window.showInformationMessage(result.message);
        webview.postMessage({ type: "undoComplete", message: result.message });
      } else {
        var errMsg = result && result.message || "Nothing to undo";
        vscode7.window.showInformationMessage(errMsg);
        webview.postMessage({ type: "undoComplete", message: errMsg });
      }
      break;
    }
    case "undoCheckpoint": {
      if (message.filePath) {
        var wsPath = getWorkspaceFolder();
        var result = await undoFile(message.filePath, wsPath, null);
        webview.postMessage({
          type: "undoCheckpointResult",
          filePath: message.filePath,
          success: result ? result.success : false,
          message: result ? result.message : "Failed"
        });
        if (result && result.success) {
          vscode7.window.showInformationMessage(result.message);
        }
      }
      break;
    }
    case "acceptDiff": {
      var wsPath = getWorkspaceFolder();
      var result = await applyPatch(message.diffId, wsPath);
      if (result.success) {
        resolveDiff(message.diffId, true);
      }
      webview.postMessage({ type: "diffResult", diffId: message.diffId, result });
      break;
    }
    case "acceptAllDiffs": {
      var wsPath = getWorkspaceFolder();
      var results = await acceptAll(wsPath);
      for (var ri = 0; ri < results.length; ri++) {
        var r = results[ri];
        if (r.success) {
          resolveDiff(r.diffId || r.message, true);
        }
      }
      webview.postMessage({ type: "diffAllResult", results });
      break;
    }
    case "rejectDiff": {
      if (message.diffId) {
        var result = rejectPatch(message.diffId);
        resolveDiff(message.diffId, false);
        webview.postMessage({ type: "diffResult", diffId: message.diffId, result });
      }
      break;
    }
    case "rejectAllDiffs": {
      var results = rejectAll();
      for (var ri = 0; ri < results.length; ri++) {
        var r = results[ri];
        resolveDiff(r.diffId, false);
      }
      webview.postMessage({ type: "diffAllResult", results });
      break;
    }
    case "openDiffEditor": {
      if (message.diffId) {
        var wsPath = getWorkspaceFolder();
        openDiffEditor(message.diffId, wsPath);
      }
      break;
    }
    default: {
      console.log("[QWEN_CODERUN] Unknown message type:", msgType);
    }
  }
}
async function checkProviderHealth(webview, overrideConfig) {
  var cfg = overrideConfig;
  if (!cfg) {
    var activeProvider = extensionContext2?.globalState.get("qwen-coderun_selected_provider", "") || "";
    if (activeProvider) {
      cfg = await getProviderConfigByName(extensionContext2, activeProvider);
    } else {
      cfg = await getProviderConfigWithKey(extensionContext2);
    }
  }
  console.log("[QWEN_CODERUN] Checking health for provider:", cfg.provider, "at", cfg.baseUrl, "model:", cfg.model);
  if (!cfg.baseUrl) {
    console.error("[QWEN_CODERUN] Health check skipped: No baseUrl configured");
    statusBarItem.text = "$(warning) Qwen CodeRun (No URL)";
    statusBarItem.tooltip = "Please configure base URL in Qwen CodeRun settings";
    if (webview) {
      webview.postMessage({
        type: "healthStatus",
        online: false,
        provider: cfg.provider || "none",
        error: "No base URL configured. Please set it in settings."
      });
    }
    return;
  }
  if (needsApiKey2(cfg.provider) && !cfg.apiKey) {
    console.error("[QWEN_CODERUN] Health check skipped: API key required but not set");
    statusBarItem.text = "$(warning) Qwen CodeRun (No API Key)";
    statusBarItem.tooltip = "Please set API key in Qwen CodeRun settings";
    if (webview) {
      webview.postMessage({
        type: "healthStatus",
        online: false,
        provider: cfg.provider || "none",
        error: "API key required. Please enter your API key in settings and click Save.",
        models: []
      });
    }
    return;
  }
  try {
    var provider = (await Promise.resolve().then(() => (init_providerManager(), providerManager_exports))).createProvider(cfg);
    var models = await provider.listModels(cfg);
    statusBarItem.text = "$(comment-discussion) Qwen CodeRun (Online)";
    statusBarItem.tooltip = cfg.provider + ": " + cfg.baseUrl + " | Models: " + models.length;
    if (webview) {
      webview.postMessage({
        type: "healthStatus",
        online: true,
        provider: cfg.provider,
        models
      });
    }
  } catch (err) {
    console.error("[QWEN_CODERUN] Health check failed:", err.message);
    console.error("[QWEN_CODERUN] Config used:", JSON.stringify({ provider: cfg.provider, baseUrl: cfg.baseUrl, model: cfg.model, hasKey: !!cfg.apiKey }));
    statusBarItem.text = "$(warning) Qwen CodeRun (Offline)";
    statusBarItem.tooltip = "Cannot reach " + cfg.provider + " at " + cfg.baseUrl + " - " + err.message;
    if (webview) {
      webview.postMessage({
        type: "healthStatus",
        online: false,
        provider: cfg.provider,
        error: err.message,
        models: []
      });
    }
  }
}
async function refreshAllProviderModels(webview) {
  var allConfigs = getAllProviderConfigs(extensionContext2);
  var providerKeys = Object.keys(allConfigs);
  if (!providerKeys.length) {
    await checkProviderHealth(webview);
    return;
  }
  for (var i = 0; i < providerKeys.length; i++) {
    var provName = providerKeys[i];
    var provCfg = await getProviderConfigByName(extensionContext2, provName);
    await checkProviderHealth(webview, provCfg);
  }
}
function deactivate() {
  if (statusBarItem) statusBarItem.dispose();
  dispose2();
  cancelAllPermissions();
  dispose();
  currentAbortController = null;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});

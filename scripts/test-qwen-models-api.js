// test-qwen-models-api.js — Probe Qwen web API for models list
import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';

async function getSavedCookie() {
  var SQL = await initSqlJs();
  var stateDbPath = path.join(process.env.APPDATA, 'Code', 'User', 'globalStorage', 'state.vscdb');
  var db = new SQL.Database(fs.readFileSync(stateDbPath));
  var res = db.exec("SELECT value FROM ItemTable WHERE key = 'Bala-Siva-Ganesh.qwen-coderun-agent'");
  var data = JSON.parse(res[0].values[0][0]);
  return data['qwen-coderun.fallbackCookie'] || '';
}

async function testEndpoints() {
  var cookieStr = await getSavedCookie();
  var token = '';
  var parts = cookieStr.split(';');
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i].trim();
    if (p.startsWith('token=')) token = p.substring(6);
    if (!token && p.startsWith('active_token=')) token = p.substring(13);
  }

  var headers = {
    'Accept': 'application/json, text/plain, */*',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    'Cookie': cookieStr,
    'Authorization': 'Bearer ' + token,
    'Origin': 'https://chat.qwen.ai',
    'Referer': 'https://chat.qwen.ai/'
  };

  var url = 'https://chat.qwen.ai/api/v2/models';
  console.log('Fetching models from:', url);
  var resp = await fetch(url, { headers: headers });
  console.log('Status:', resp.status, resp.statusText);
  var json = await resp.json();
  console.log('\n--- MODELS RETRIEVED FROM API ---');
  var models = (json.data && json.data.data) || json.data || [];
  for (var m of models) {
    console.log('- ID:', m.id, '| Name:', m.name, '| Owned By:', m.owned_by);
  }
  console.log('\nTotal models:', models.length);
  if (models.length > 0) {
    console.log('\nDetailed sample object for', models[0].id, ':');
    console.log(JSON.stringify(models[0], null, 2));
  }
}

testEndpoints();

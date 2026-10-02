import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';

async function main() {
  var SQL = await initSqlJs();
  var stateDbPath = path.join(process.env.APPDATA, 'Code', 'User', 'globalStorage', 'state.vscdb');
  var db = new SQL.Database(fs.readFileSync(stateDbPath));
  var res = db.exec("SELECT key, value FROM ItemTable WHERE key LIKE 'Bala-Siva-Ganesh%'");
  for (var i = 0; i < res.length; i++) {
    for (var j = 0; j < res[i].values.length; j++) {
      var k = res[i].values[j][0];
      var v = res[i].values[j][1];
      console.log('KEY:', k);
      try {
        var obj = JSON.parse(v);
        console.log('KEYS in obj:', Object.keys(obj));
        if (obj['qwen-coderun_provider_configs']) console.log('qwen-coderun_provider_configs:', obj['qwen-coderun_provider_configs']);
        if (obj['qwen-coderun_selected_provider']) console.log('qwen-coderun_selected_provider:', obj['qwen-coderun_selected_provider']);
        if (obj['qwen-coderun_selected_model']) console.log('qwen-coderun_selected_model:', obj['qwen-coderun_selected_model']);
      } catch (_) {
        console.log('VAL length:', v ? v.length : 0);
      }
    }
  }
}

main();

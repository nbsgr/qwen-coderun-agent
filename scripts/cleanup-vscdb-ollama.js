import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';

async function cleanup() {
  var SQL = await initSqlJs();
  var stateDbPath = path.join(process.env.APPDATA, 'Code', 'User', 'globalStorage', 'state.vscdb');
  var db = new SQL.Database(fs.readFileSync(stateDbPath));

  var res = db.exec("SELECT value FROM ItemTable WHERE key = 'Bala-Siva-Ganesh.qwen-coderun-agent'");
  if (res.length && res[0].values.length) {
    var data = JSON.parse(res[0].values[0][0]);
    if (data['qwen-coderun_provider_configs']) {
      try {
        var configs = JSON.parse(data['qwen-coderun_provider_configs']);
        if (configs.ollama) {
          delete configs.ollama;
          console.log('Removed stale ollama from qwen-coderun_provider_configs');
        }
        data['qwen-coderun_provider_configs'] = JSON.stringify(configs);
      } catch (_) {}
    }
    data['qwen-coderun_selected_provider'] = 'qwen';
    data['qwen-coderun_selected_model'] = data['qwen-coderun_selected_model'] || 'qwen3.7-plus';

    var updatedJson = JSON.stringify(data);
    db.run("UPDATE ItemTable SET value = ? WHERE key = 'Bala-Siva-Ganesh.qwen-coderun-agent'", [updatedJson]);
    var dataBytes = db.export();
    fs.writeFileSync(stateDbPath, Buffer.from(dataBytes));
    console.log('Successfully updated state.vscdb!');
  }
}

cleanup();

import initSqlJs from 'file:///D:/coderun-extension/node_modules/sql.js/dist/sql-wasm.js';
import fs from 'fs';
import path from 'path';
import { listModels } from '../src/providerQwen.js';

async function test() {
  var SQL = await initSqlJs();
  var stateDbPath = path.join(process.env.APPDATA, 'Code', 'User', 'globalStorage', 'state.vscdb');
  var db = new SQL.Database(fs.readFileSync(stateDbPath));
  var res = db.exec("SELECT value FROM ItemTable WHERE key = 'Bala-Siva-Ganesh.qwen-coderun-agent'");
  var cookie = JSON.parse(res[0].values[0][0])['qwen-coderun.fallbackCookie'];
  var models = await listModels({ apiKey: cookie });
  console.log('ListModels result:');
  console.log(models);
}

test();

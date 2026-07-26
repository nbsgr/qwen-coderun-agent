import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const SQL = await initSqlJs();

  const appData = process.env.APPDATA;
  const stateDbPath = path.join(appData, 'Code', 'User', 'globalStorage', 'state.vscdb');

  if (!fs.existsSync(stateDbPath)) {
    console.log('state.vscdb not found at:', stateDbPath);
    process.exit(1);
  }

  const buf = fs.readFileSync(stateDbPath);
  const db = new SQL.Database(buf);

  // Check schema
  const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
  for (const t of tables) {
    console.log('Table:', t.values[0][0]);
  }

  const cols = db.exec("PRAGMA table_info(ItemTable)");
  if (cols.length && cols[0].values.length) {
    console.log('ItemTable columns:', cols[0].values.map(function(c) { return c[1]; }).join(', '));
  }

  // Look for all extension keys
  const allKeys = db.exec("SELECT key FROM ItemTable WHERE key LIKE '%qwen%' LIMIT 30");
  if (allKeys.length && allKeys[0].values.length) {
    console.log('\n=== Qwen-related keys ===');
    for (const row of allKeys[0].values) {
      console.log('  ' + row[0]);
    }
  } else {
    console.log('\nNo qwen keys found - checking broader pattern...');
    const broader = db.exec("SELECT key FROM ItemTable WHERE key LIKE '%coderun%' OR key LIKE '%CodeRun%' LIMIT 30");
    if (broader.length && broader[0].values.length) {
      for (const row of broader[0].values) {
        console.log('  ' + row[0]);
      }
    }
  }

  // Try to find fallbackCookie value
  const valQuery = db.exec("SELECT value FROM ItemTable WHERE key LIKE '%fallbackCookie%' OR key LIKE '%apiKey%' LIMIT 10");
  if (valQuery.length && valQuery[0].values.length) {
    console.log('\n=== Cookie/API key values ===');
    for (const row of valQuery[0].values) {
      const val = row[0];
      console.log('  Length:', val.length, 'Start:', val.substring(0, 30));
    }
  }

  db.close();
}

main().catch(function(e) { console.error(e); process.exit(1); });

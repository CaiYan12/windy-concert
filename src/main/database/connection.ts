import Database from 'better-sqlite3';
import { migrations } from './migrations';

export function openDatabase(file: string): Database.Database {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');
  const current = db.pragma('user_version', { simple: true }) as number;
  for (let i = current; i < migrations.length; i++) {
    db.transaction(() => {
      db.exec(migrations[i].up);
      db.pragma(`user_version = ${i + 1}`);
    })();
  }
  return db;
}

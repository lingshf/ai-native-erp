import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(process.argv[2]);
try {
  db.exec('PRAGMA busy_timeout=0; BEGIN IMMEDIATE');
  db.exec("UPDATE accounts SET name='Writer must not commit' WHERE code='1000'");
  try {
    db.exec('COMMIT');
    process.exitCode = 1;
    console.log('UNEXPECTED_COMMIT');
  } catch (error) {
    if (error.errcode !== 5) throw error;
    db.exec('ROLLBACK');
    console.log('BUSY');
  }
} finally {
  db.close();
}

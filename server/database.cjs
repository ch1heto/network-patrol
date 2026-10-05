'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const PROJECT_ROOT = path.resolve(__dirname, '..');
function getDatabasePath(env = process.env) {
  const configured = env.PATROL_DB_PATH || env.PATROL_DB;
  return configured === ':memory:' ? configured : path.resolve(PROJECT_ROOT, configured || 'storage/patrol.sqlite');
}
function openDatabase(filename) {
  if (filename !== ':memory:') fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS teachers(id INTEGER PRIMARY KEY, login TEXT UNIQUE NOT NULL, name TEXT NOT NULL, password_hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS groups(id INTEGER PRIMARY KEY, teacher_id INTEGER NOT NULL REFERENCES teachers(id), name TEXT NOT NULL, course INTEGER NOT NULL CHECK(course BETWEEN 1 AND 6), capacity INTEGER NOT NULL CHECK(capacity BETWEEN 1 AND 200));
    CREATE TABLE IF NOT EXISTS group_invites(id INTEGER PRIMARY KEY, group_id INTEGER UNIQUE NOT NULL REFERENCES groups(id), token TEXT UNIQUE NOT NULL, open INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS students(id INTEGER PRIMARY KEY, group_id INTEGER NOT NULL REFERENCES groups(id), login TEXT UNIQUE NOT NULL, name TEXT NOT NULL, password_hash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, last_login TEXT, last_activity TEXT);
    CREATE TABLE IF NOT EXISTS chapters(id INTEGER PRIMARY KEY, title TEXT NOT NULL, planned INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS student_progress(student_id INTEGER PRIMARY KEY REFERENCES students(id), state TEXT NOT NULL, hints INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS chapter_results(student_id INTEGER NOT NULL REFERENCES students(id), chapter_id INTEGER NOT NULL REFERENCES chapters(id), score REAL NOT NULL, completed_at TEXT NOT NULL, PRIMARY KEY(student_id,chapter_id));
    CREATE TABLE IF NOT EXISTS quiz_attempts(id INTEGER PRIMARY KEY, student_id INTEGER NOT NULL REFERENCES students(id), task_id TEXT NOT NULL, response TEXT NOT NULL, correct INTEGER NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS practice_attempts(id INTEGER PRIMARY KEY, student_id INTEGER NOT NULL REFERENCES students(id), task_id TEXT NOT NULL, correct INTEGER NOT NULL, explanation TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, role TEXT NOT NULL, user_id INTEGER NOT NULL, expires INTEGER NOT NULL);
    PRAGMA user_version=1;`);
  return db;
}
module.exports = { openDatabase, getDatabasePath };

'use strict';
const { hashPassword } = require('./auth.cjs');
function validateTeacher(login, name, password) {
  if (typeof login !== 'string' || !login.trim() || login.length > 60 || typeof name !== 'string' || !name.trim() || name.length > 100 || typeof password !== 'string' || password.length < 10 || password.length > 128) {
    throw new Error('Укажите логин до 60 символов, имя до 100 символов и пароль длиной от 10 до 128 символов.');
  }
}
async function saveTeacher(db, { login, name, password }, { update = false } = {}) {
  validateTeacher(login, name, password);
  const hash = await hashPassword(password);
  db.exec('BEGIN IMMEDIATE');
  try {
    const existing = db.prepare('SELECT id FROM teachers WHERE login=?').get(login.trim());
    db.prepare(`INSERT INTO teachers(login,name,password_hash) VALUES(?,?,?) ON CONFLICT(login) ${update ? 'DO UPDATE SET name=excluded.name,password_hash=excluded.password_hash' : 'DO NOTHING'}`).run(login.trim(), name.trim(), hash);
    if (existing && update) db.prepare("DELETE FROM sessions WHERE role='teacher' AND user_id=?").run(existing.id);
    db.exec('COMMIT');
    return existing ? (update ? 'updated' : 'existing') : 'created';
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}
async function bootstrapDevTeacher(db, env = process.env, log = console.log) {
  if (env.NODE_ENV === 'production' || env.PATROL_DEV_TEACHER !== '1') return;
  const login = env.PATROL_DEV_TEACHER_LOGIN ?? 'teacher';
  const name = env.PATROL_DEV_TEACHER_NAME ?? 'Тестовый преподаватель';
  const password = env.PATROL_DEV_TEACHER_PASSWORD ?? 'Test-password-2026';
  validateTeacher(login, name, password);
  // Existing credentials are never reset by server startup.
  if (!db.prepare('SELECT id FROM teachers WHERE login=?').get(login.trim())) await saveTeacher(db, { login, name, password });
  log('Development teacher ready');
  log(`Login – ${login.trim()}`);
}
module.exports = { saveTeacher, bootstrapDevTeacher };

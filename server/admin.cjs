'use strict';
// Local administration only. No teacher registration HTTP endpoint exists.
const { openDatabase, getDatabasePath } = require('./database.cjs');
const { saveTeacher } = require('./teachers.cjs');
(async () => {
  const [rawLogin, rawName] = process.argv.slice(2);
  const login=rawLogin?.trim(), name=rawName?.trim();
  const password = process.env.PATROL_ADMIN_PASSWORD;
  const filename = getDatabasePath();
  const db = openDatabase(filename);
  try {
    const result = await saveTeacher(db, { login, name, password }, { update: true });
    console.log(result === 'updated' ? 'Пароль и имя преподавателя обновлены.' : 'Учётная запись преподавателя создана.');
    console.log(`БД – ${filename}`);
  } finally { db.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });

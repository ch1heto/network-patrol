'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {createApp}=require('../server/app.cjs');
const {getDatabasePath,openDatabase}=require('../server/database.cjs');
const {bootstrapDevTeacher}=require('../server/teachers.cjs');
const {verifyPassword}=require('../server/auth.cjs');
const ROOT=path.resolve(__dirname,'..');
const temp=fs.mkdtempSync(path.join(ROOT,'.prototype-checks/auth-'));
const filename=path.join(temp,'patrol.sqlite');
const env={...process.env,NODE_ENV:'test',PATROL_DB_PATH:filename,PATROL_DEV_TEACHER:'0'};
const npmCandidates=[process.env.npm_execpath,path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'),path.resolve(path.dirname(process.execPath),'../lib/node_modules/npm/bin/npm-cli.js')];
const npmCli=npmCandidates.find(p=>p&&fs.existsSync(p));assert.ok(npmCli,'npm CLI not found: run this suite through npm test or install npm with Node');
let checks=0;const eq=(actual,expected)=>{assert.equal(actual,expected);checks++;};
const admin=password=>spawnSync(process.execPath,[npmCli,'run','admin:teacher','--','teacher','Тестовый преподаватель'],{cwd:ROOT,env:{...env,PATROL_ADMIN_PASSWORD:password},encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']});
async function start(){const a=createApp({bootstrapEnv:env});await a.ready;await new Promise(r=>a.server.listen(0,'127.0.0.1',r));a.base=`http://127.0.0.1:${a.server.address().port}`;a.close=async()=>{await new Promise(r=>a.server.close(r));a.db.close();};return a;}
async function login(a,password,login='teacher'){const r=await fetch(a.base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({role:'teacher',login,password})});return {status:r.status,body:await r.json()};}
(async()=>{
  const prior=process.env.PATROL_DB_PATH;process.env.PATROL_DB_PATH=filename;
  let a,browser;
  try {
    eq(getDatabasePath({}),path.join(ROOT,'storage/patrol.sqlite'));
    eq(getDatabasePath({PATROL_DB_PATH:'storage/custom.sqlite'}),path.join(ROOT,'storage/custom.sqlite'));
    eq(getDatabasePath({PATROL_DB_PATH:filename,PATROL_DB:'other.sqlite'}),filename);
    {const r=admin('Test-password-2026');assert.ifError(r.error);assert.equal(r.status,0,r.stderr);checks++;}
    a=await start();eq(a.filename,filename);
    let teacher=a.db.prepare('SELECT * FROM teachers WHERE login=?').get('teacher');const id=teacher.id;
    eq(teacher.password_hash.startsWith('scrypt$'),true);eq(teacher.password_hash.includes('Test-password-2026'),false);
    eq((await login(a,'Test-password-2026')).status,200);
    const bad=await login(a,'Wrong-password-2026'),missing=await login(a,'Wrong-password-2026','missing');eq(bad.status,401);eq(missing.status,401);eq(bad.body.error,missing.body.error);
    await a.close();a=await start();eq((await login(a,'Test-password-2026')).status,200);
    {const r=admin('Updated-password-2026');assert.ifError(r.error);assert.equal(r.status,0,r.stderr);checks++;}eq((await login(a,'Test-password-2026')).status,401);eq((await login(a,'Updated-password-2026')).status,200);eq(a.db.prepare('SELECT id FROM teachers WHERE login=?').get('teacher').id,id);
    eq(admin('Test-password-2026').status,0);
    browser=await require('./browser.cjs').launchBrowser();
    const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('401'))errors.push(m.text());});
    await page.goto(a.base);await page.getByRole('button',{name:'Я преподаватель',exact:true}).click();
    const password=page.getByLabel('Пароль',{exact:true});await page.getByLabel('Логин',{exact:true}).fill('teacher');await password.fill('Test-password-2026');
    eq(await password.getAttribute('type'),'password');const before=await password.boundingBox();
    let requests=0;page.on('request',r=>{if(r.url().endsWith('/api/login'))requests++;});
    const eye=page.locator('.password-toggle');eq(await eye.getAttribute('aria-label'),'Показать пароль');eq(await eye.getAttribute('type'),'button');await eye.click();eq(await password.getAttribute('type'),'text');eq(await eye.getAttribute('aria-pressed'),'true');eq(requests,0);
    const after=await password.boundingBox();eq(after.width,before.width);eq(after.height,before.height);
    await page.getByRole('button',{name:'Скрыть пароль',exact:true}).focus();await page.keyboard.press('Space');eq(await password.getAttribute('type'),'password');
    await eye.focus();await page.keyboard.press('Enter');eq(await password.getAttribute('type'),'text');eq(requests,0);await page.getByRole('button',{name:'Скрыть пароль',exact:true}).click();
    await page.screenshot({path:'.prototype-checks/auth-login-desktop.png'});
    await password.focus();await page.keyboard.press('Enter');await page.getByRole('heading',{name:'Новая учебная группа',exact:true}).waitFor();eq(requests,1);
    await page.getByRole('button',{name:'Выйти',exact:true}).click();await page.getByRole('button',{name:'Я преподаватель',exact:true}).click();await page.getByLabel('Логин',{exact:true}).fill('teacher');await password.fill('Wrong-password-2026');await page.getByRole('button',{name:'Войти',exact:true}).click();await page.getByText('Логин или пароль не подходят.',{exact:true}).waitFor();eq(await page.getByRole('button',{name:'Войти',exact:true}).isEnabled(),true);eq(await password.inputValue(),'Wrong-password-2026');
    await password.fill('Test-password-2026');await page.getByRole('button',{name:'Войти',exact:true}).click();await page.getByRole('heading',{name:'Новая учебная группа',exact:true}).waitFor();
    await page.getByLabel('Название группы').fill('Проверка глаза');await page.getByRole('button',{name:'Создать группу',exact:true}).click();const card=page.locator('article').filter({has:page.getByRole('heading',{name:'Проверка глаза',exact:true})});const invite=await card.locator('a').getAttribute('href');
    const phone=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});phone.on('pageerror',e=>errors.push(e.message));await phone.goto(a.base+'/?invite='+new URL(invite).searchParams.get('invite'));const registration=phone.getByLabel('Создайте пароль от 10 символов');await registration.fill('Student-password-2026');await phone.getByRole('button',{name:'Показать пароль',exact:true}).click();eq(await registration.getAttribute('type'),'text');await phone.getByRole('button',{name:'Скрыть пароль',exact:true}).click();eq(await registration.getAttribute('type'),'password');eq(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await phone.screenshot({path:'.prototype-checks/auth-registration-mobile.png'});
    await phone.getByLabel('Фамилия',{exact:true}).fill('Тест');await phone.getByLabel('Имя',{exact:true}).fill('Студент');await phone.getByRole('button',{name:'Присоединиться',exact:true}).click();await phone.getByRole('button',{name:'Выйти и проверить вход',exact:true}).click();await phone.getByLabel('Пароль',{exact:true}).fill('Student-password-2026');await phone.getByRole('button',{name:'Показать пароль',exact:true}).click();eq(await phone.getByLabel('Пароль',{exact:true}).getAttribute('type'),'text');await phone.getByRole('button',{name:'Скрыть пароль',exact:true}).click();await phone.screenshot({path:'.prototype-checks/auth-login-mobile.png'});
    eq(errors.length,0);
    const logs=[],db=openDatabase(':memory:');
    await bootstrapDevTeacher(db,{NODE_ENV:'production',PATROL_DEV_TEACHER:'1'},v=>logs.push(v));eq(db.prepare('SELECT COUNT(*) AS n FROM teachers').get().n,0);eq(logs.length,0);
    await bootstrapDevTeacher(db,{NODE_ENV:'development'},v=>logs.push(v));eq(db.prepare('SELECT COUNT(*) AS n FROM teachers').get().n,0);
    await bootstrapDevTeacher(db,{NODE_ENV:'development',PATROL_DEV_TEACHER:'1'},v=>logs.push(v));teacher=db.prepare('SELECT * FROM teachers WHERE login=?').get('teacher');eq(await verifyPassword('Test-password-2026',teacher.password_hash),true);eq(logs.includes('Development teacher ready'),true);eq(logs.some(v=>v.includes('Test-password-2026')),false);
    const hash=teacher.password_hash;await bootstrapDevTeacher(db,{PATROL_DEV_TEACHER:'1',PATROL_DEV_TEACHER_PASSWORD:'Do-not-reset-2026'},()=>{});eq(db.prepare('SELECT password_hash FROM teachers WHERE login=?').get('teacher').password_hash,hash);
    await bootstrapDevTeacher(db,{PATROL_DEV_TEACHER:'1',PATROL_DEV_TEACHER_LOGIN:'mentor',PATROL_DEV_TEACHER_PASSWORD:'Custom-password-2026',PATROL_DEV_TEACHER_NAME:'Наставник'},()=>{});eq(await verifyPassword('Custom-password-2026',db.prepare('SELECT password_hash FROM teachers WHERE login=?').get('mentor').password_hash),true);
    eq(await verifyPassword('anything','broken-hash'),false);db.close();
    console.log(`PASS: ${checks} authentication checks – npm admin, shared DB, update/restart, passwords, production bootstrap guard, desktop/mobile eye and keyboard/Enter login`);
  }finally{if(browser)await browser.close();if(a?.server.listening)await a.close();if(prior===undefined)delete process.env.PATROL_DB_PATH;else process.env.PATROL_DB_PATH=prior;}
})().catch(e=>{console.error(e);process.exitCode=1;});

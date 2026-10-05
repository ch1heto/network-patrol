'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const QR = require('qrcode');
const content = require('./content.cjs');
const { openDatabase, getDatabasePath } = require('./database.cjs');
const { bootstrapDevTeacher } = require('./teachers.cjs');
const { hashPassword, verifyPassword, digest, randomToken } = require('./auth.cjs');
const ROOT = path.resolve(__dirname,'..');
const now = () => new Date().toISOString();
const fail = (message, status = 400) => { const e = new Error(message); e.status = status; throw e; };
function fresh() { return { version:1, currentChapter:0, completedChapters:[], unlockedLocations:['office','corridor','classroom'], xp:0, warnings:[], demerits:[], achievements:[], currentObjective:'meet', location:'office', introComplete:false, networkQuizPassed:false, briefingComplete:false, quizPassed:false, packetQuizPassed:false, packetDelivered:false, connections:[], networkModel:null, onboardingSeen:false }; }
function endReplay(p){const r=p.replay;if(!r)return;if(r.original)p.course[r.chapter]=r.original;else delete p.course[r.chapter];p.currentChapter=r.resumeChapter;p.currentObjective=r.resumeObjective;delete p.courseDraft;if(r.resumeDraft)p.courseDraft=r.resumeDraft;delete p.replay;content.network.course.migrate(p);}
function percent(p) { const intro=content.data.chapters.filter(c=>c.id<2).flatMap(c=>c.requiredFlags); const first=intro.filter(key=>p[key]).length/intro.length;const rest=Object.values(content.data.curriculum).reduce((sum,c)=>sum+(p.completedChapters.includes(c.id)?1:(p.course?.[c.id]?.step||0)/content.network.course.stages(c).length),0);return Math.round(100*(first+rest)/15); }
function createApp({ filename = getDatabasePath(), publicUrl = process.env.PATROL_PUBLIC_URL || `http://127.0.0.1:${process.env.PORT||8000}`, bootstrapEnv = process.env } = {}) {
  const address=new URL(publicUrl);
  if(!['http:','https:'].includes(address.protocol)||address.username||address.password||address.search||address.hash||address.pathname!=='/') throw new Error('PATROL_PUBLIC_URL должен содержать адрес сервера без пути и параметров.');
  publicUrl=address.origin;
  const db = openDatabase(filename);
  const ready = bootstrapDevTeacher(db, bootstrapEnv);
  ready.catch(() => {}); // Startup/request handlers report the failure without an unhandled rejection.
  for (const c of content.data.chapters) db.prepare('INSERT OR REPLACE INTO chapters(id,title,planned) VALUES(?,?,?)').run(c.id,c.title,c.planned ? 1 : 0);
  const run = (sql,...args) => db.prepare(sql).run(...args);
  const get = (sql,...args) => db.prepare(sql).get(...args);
  const all = (sql,...args) => db.prepare(sql).all(...args);
  const state = id => {const p=content.network.course.migrate(JSON.parse(get('SELECT state FROM student_progress WHERE student_id=?',id).state));if(p.completedChapters.includes(1)&&!p.unlockedLocations.includes('server'))p.unlockedLocations.push('server');const before=JSON.stringify(p);content.network.taskState.recoverProgress(p);if(JSON.stringify(p)!==before)run('UPDATE student_progress SET state=? WHERE student_id=?',JSON.stringify(p),id);return p;};
  const store = (id,p) => { run('UPDATE student_progress SET state=? WHERE student_id=?',JSON.stringify(p),id); run('UPDATE students SET last_activity=? WHERE id=?',now(),id); };
  const transaction = action => { db.exec('BEGIN IMMEDIATE'); try { const result=action(); db.exec('COMMIT'); return result; } catch(e) { db.exec('ROLLBACK'); throw e; } };
  const owner = (id, user) => { const g=get('SELECT * FROM groups WHERE id=? AND teacher_id=?',id,user.user_id); if(!g) fail('Группа не найдена.',404); return g; };
  function session(req) {
    const token = req.headers.cookie?.split(';').map(v=>v.trim()).find(v=>v.startsWith('patrol_session='))?.slice(15);
    if (!token) return null;
    const s=get('SELECT * FROM sessions WHERE token_hash=? AND expires>?',digest(token),Date.now());
    if(!s) return null;
    const u=get(`SELECT * FROM ${s.role==='teacher'?'teachers':'students'} WHERE id=?`,s.user_id);
    return u && (s.role==='teacher'||u.active) ? {...s, name:u.name, login:u.login} : null;
  }
  function requireRole(req,role) { const user=session(req); if(!user) fail('Войдите в учётную запись.',401); if(user.role!==role) fail('Доступ закрыт.',403); return user; }
  function loginSession(res,role,id) {
    const token=randomToken(); run('DELETE FROM sessions WHERE expires<=?',Date.now());
    run('INSERT INTO sessions VALUES(?,?,?,?)',digest(token),role,id,Date.now()+12*60*60*1000);
    res.setHeader('Set-Cookie',`patrol_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200${publicUrl.startsWith('https:')?'; Secure':''}`);
  }
  function invite(token, enforce=true) {
    const g=get(`SELECT g.*, i.open FROM group_invites i JOIN groups g ON g.id=i.group_id WHERE i.token=?`,token);
    if(!g) fail('Приглашение не найдено.',404);
    const count=get('SELECT COUNT(*) AS n FROM students WHERE group_id=? AND active=1',g.id).n;
    if(enforce && !g.open) fail('Преподаватель закрыл регистрацию.',410);
    if(enforce && count>=g.capacity) fail('В группе нет свободных мест.',409);
    return {...g,count};
  }
  function finishChapter(id,p) {
    if(p.completedChapters.includes(1))return;
    if(!content.data.chapters.filter(c=>c.id===0||c.id===1).flatMap(c=>c.requiredFlags||[]).every(key=>p[key])) return;
    const score=get('SELECT ROUND(100.0 * SUM(correct)/COUNT(*),1) AS score FROM quiz_attempts WHERE student_id=? AND task_id IN (?,?,?)',id,'networkQuiz','switchQuiz','packetTrue').score || 0;
    const result=run('INSERT OR IGNORE INTO chapter_results VALUES(?,?,?,?)',id,1,score,now());
    if(!p.unlockedLocations.includes('server'))p.unlockedLocations.push('server');
    if(result.changes) { p.completedChapters.push(1); p.xp+=100; p.achievements.push('Первое подключение'); }
    p.chapterScore=get('SELECT score FROM chapter_results WHERE student_id=? AND chapter_id=1',id).score;
    p.currentChapter=2; p.currentObjective='course';content.network.course.migrate(p);
  }
  const throttles = new Map();
  function throttle(req, identity = '', limit = 40) {
    const key=`${req.socket.remoteAddress}:${req.url}:${identity}`, t=Date.now(); let bucket=throttles.get(key);
    if(!bucket || bucket.until<t) { bucket={until:t+60000,count:0}; throttles.set(key,bucket); }
    if(++bucket.count>limit) fail('Слишком много попыток. Повторите через минуту.',429);
    if(throttles.size>1000) for(const [k,v] of throttles) if(v.until<t) throttles.delete(k);
  }
  async function body(req) {
    if(!req.headers['content-type']?.startsWith('application/json')) fail('Ожидается JSON.',415);
    if(req.headers.origin && req.headers.origin!==new URL(publicUrl).origin && req.headers.origin!==`http://${req.headers.host}`) fail('Источник запроса не разрешён.',403);
    let data=''; for await(const chunk of req) { data+=chunk; if(Buffer.byteLength(data)>100000) fail('Запрос слишком большой.',413); }
    try { const value=JSON.parse(data||'{}'); if(!value||Array.isArray(value)||typeof value!=='object') fail('Ожидается объект.'); return value; } catch { fail('Некорректный запрос.'); }
  }
  const text = (v,min=1,max=100) => { if(typeof v!=='string'||v.trim().length<min||v.length>max) fail('Проверьте заполнение полей.'); return v.trim(); };
  const password = v => { if(typeof v!=='string'||v.length<10||v.length>128) fail('Пароль должен содержать от 10 до 128 символов.'); return v; };
  async function api(req,res,url) {
    const route=url.pathname, method=req.method;
    if(method==='GET' && route==='/api/me') { const u=session(req); return {user:u?{role:u.role,name:u.name,login:u.login}:null}; }
    if(method==='POST' && route==='/api/login') {
      const b=await body(req), role=b.role==='teacher'?'teacher':'student'; throttle(req); throttle(req,`${role}:${text(b.login)}`,10);
      const u=get(`SELECT * FROM ${role==='teacher'?'teachers':'students'} WHERE login=?`,text(b.login));
      // A dummy hash keeps nonexistent login timing similar to a wrong password.
      const dummy='scrypt$0123456789abcdef0123456789abcdef$'+'00'.repeat(64);
      const ok=typeof b.password === 'string' && b.password.length <= 128 && await verifyPassword(b.password,u?.password_hash||dummy);
      if(!u||!ok||(role==='student'&&!u.active)) {
        if(process.env.NODE_ENV !== 'production') console.info(`Authentication rejected – ${!u ? 'account missing' : !ok ? 'password mismatch' : 'inactive account'}`);
        fail('Логин или пароль не подходят.',401);
      }
      loginSession(res,role,u.id); if(role==='student') run('UPDATE students SET last_login=?,last_activity=? WHERE id=?',now(),now(),u.id);
      return {role,login:u.login};
    }
    if(method==='POST' && route==='/api/logout') { await body(req); const u=session(req); if(u) run('DELETE FROM sessions WHERE token_hash=?',u.token_hash); res.setHeader('Set-Cookie','patrol_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'); return {ok:true}; }
    if(method==='GET' && route==='/api/invite') { const g=invite(url.searchParams.get('token')||''); return {name:g.name,course:g.course,remaining:g.capacity-g.count}; }
    if(method==='POST' && route==='/api/join') {
      throttle(req,'',200); const b=await body(req); if('group' in b||'groupId' in b||'course' in b||'teacher' in b) fail('Группа и курс определяются приглашением.');
      const name=[text(b.surname,1,60),text(b.firstName,1,60),b.patronymic?text(b.patronymic,1,60):''].filter(Boolean).join(' ');
      const hash=await hashPassword(password(b.password));
      const student=transaction(()=>{
        const g=invite(text(b.token,43,43));
        const serial=get('SELECT COUNT(*) AS n FROM students WHERE group_id=?',g.id).n+1;
        const login=`g${g.id}-${String(serial).padStart(2,'0')}`;
        const id=Number(run('INSERT INTO students(group_id,login,name,password_hash,last_login,last_activity) VALUES(?,?,?,?,?,?)',g.id,login,name,hash,now(),now()).lastInsertRowid);
        run('INSERT INTO student_progress(student_id,state) VALUES(?,?)',id,JSON.stringify(fresh())); return {id,login};
      });
      loginSession(res,'student',student.id); return {login:student.login};
    }
    if(route==='/api/groups') {
      const u=requireRole(req,'teacher');
      if(method==='POST') { const b=await body(req); const name=text(b.name,1,60); if(!Number.isInteger(b.course)||b.course<1||b.course>6||!Number.isInteger(b.capacity)||b.capacity<1||b.capacity>200) fail('Проверьте курс и количество мест.');
        const id=transaction(()=>{const id=Number(run('INSERT INTO groups(teacher_id,name,course,capacity) VALUES(?,?,?,?)',u.user_id,name,b.course,b.capacity).lastInsertRowid);run('INSERT INTO group_invites(group_id,token) VALUES(?,?)',id,randomToken());return id;}); return {id};
      }
      if(method==='GET') return {groups:all(`SELECT g.*, i.open, i.token, (SELECT COUNT(*) FROM students s WHERE s.group_id=g.id AND s.active=1) AS registered FROM groups g JOIN group_invites i ON i.group_id=g.id WHERE g.teacher_id=?`,u.user_id).map(g=>({...g,url:`${publicUrl}/?invite=${g.token}`}))};
    }
    const match=route.match(/^\/api\/groups\/(\d+)(?:\/(qr|close|students)(?:\/(\d+))?)?$/);
    if(match) {
      const u=requireRole(req,'teacher'),g=owner(Number(match[1]),u),action=match[2],sid=Number(match[3]);
      if(method==='GET'&&action==='qr') { const i=get('SELECT token FROM group_invites WHERE group_id=?',g.id); const svg=await QR.toString(`${publicUrl}/?invite=${i.token}`,{type:'svg',errorCorrectionLevel:'M'}); res.setHeader('Content-Type','image/svg+xml'); res.end(svg); return; }
      if(method==='POST'&&action==='close') { await body(req); run('UPDATE group_invites SET open=0 WHERE group_id=?',g.id); return {ok:true}; }
      if(method==='DELETE'&&action==='students'&&sid) { await body(req); const s=get('SELECT id FROM students WHERE id=? AND group_id=?',sid,g.id); if(!s) fail('Студент не найден.',404); transaction(()=>{run('UPDATE students SET active=0 WHERE id=?',sid);run("DELETE FROM sessions WHERE role='student' AND user_id=?",sid);}); return {ok:true}; }
      if(method==='GET'&&!action) {
        const students=all('SELECT id,name,login,last_login,last_activity FROM students WHERE group_id=? AND active=1',g.id).map(s=>{
          const p=state(s.id),results=all('SELECT * FROM chapter_results WHERE student_id=?',s.id),graded=results.filter(r=>r.chapter_id>0);
          const quizzes=all('SELECT task_id,correct,created_at FROM quiz_attempts WHERE student_id=? ORDER BY id',s.id);
          const practices=all('SELECT correct,explanation,created_at FROM practice_attempts WHERE student_id=? ORDER BY id',s.id);
          return {...s,progress:percent(p),currentChapter:p.currentChapter,score:graded.length?Math.round(graded.reduce((sum,r)=>sum+r.score,0)/graded.length):quizzes.length?Math.round(100*quizzes.filter(q=>q.correct).length/quizzes.length):null,attempts:quizzes.length+practices.length,hints:get('SELECT hints FROM student_progress WHERE student_id=?',s.id).hints,results,quizzes,practices,topics:[{title:'Компьютерные сети',progress:p.networkQuizPassed?100:0},{title:'Коммутатор',progress:p.quizPassed?100:0},{title:'Практика',progress:p.packetDelivered?100:0},{title:'Пакет',progress:p.packetQuizPassed?100:0},...content.data.chapters.filter(c=>c.id>=2).map(c=>({title:c.title,progress:p.completedChapters.includes(c.id)?100:p.course?.[c.id]?Math.round(100*p.course[c.id].step/content.network.course.stages(content.data.curriculum[c.id]).length):0}))]};
        });
        const attempts=students.flatMap(s=>s.quizzes),byTask={};for(const q of attempts){byTask[q.task_id]??={n:0,wrong:0};byTask[q.task_id].n++;byTask[q.task_id].wrong+=!q.correct;}
        const hardest=Object.entries(byTask).sort((a,b)=>b[1].wrong/b[1].n-a[1].wrong/a[1].n)[0];
        const scored=students.filter(s=>s.score!==null);
        return {group:g,students,aggregates:{active:students.length,progress:students.length?Math.round(students.reduce((a,s)=>a+s.progress,0)/students.length):0,score:scored.length?Math.round(scored.reduce((a,s)=>a+s.score,0)/scored.length):null,hardest:hardest?content.data.tasks[hardest[0]].title:'Пока нет попыток'}};
      }
    }
    if(route.startsWith('/api/student/')) {
      const u=requireRole(req,'student'),id=u.user_id;
      if(method==='GET'&&route==='/api/student/progress') return {progress:state(id)};
      if(method==='POST'&&route==='/api/student/state') {
        const b=await body(req),p=state(id);
        if(b.location && p.unlockedLocations.includes(b.location)) { p.location=b.location; if(p.location==='lab'&&!p.briefingComplete&&!p.completedChapters.includes(1))p.currentObjective='briefing'; }
        if(b.networkModel!==undefined) { if(!content.network.validModel(b.networkModel)) fail('Схема стенда повреждена.'); const prepared=content.network.taskState.prepare(b.networkModel,{chapter:1,free:p.completedChapters.includes(1),generation:p.networkGeneration||0});if((b.networkModel.task?.generation||0)===(p.networkGeneration||0))p.networkModel=prepared.model; }
        if(b.courseDraft!==undefined){const c=content.network.course.info(p);if(!c||b.courseDraft.chapter!==c.c.id||!content.network.validModel(b.courseDraft.model))fail('Учебная схема не относится к текущей главе.');const demo=b.courseDraft.demo===true,cs=p.course[c.c.id],generation=cs[demo?'demoGeneration':'taskGeneration']||0;if(demo&&(c.stage!=='demo'||![2,5,7].includes(c.c.id)))fail('Демонстрация не относится к текущему шагу.');const incoming=b.courseDraft.model.task;if((incoming?.generation||0)!==generation)return {ok:true,stale:true};if(!demo&&c.stage!=='practical')return {ok:true,stale:true};const prepared=content.network.taskState.prepare(b.courseDraft.model,{chapter:c.c.id,demo,generation});cs[demo?'demoModel':'model']=prepared.model;if(demo)cs.demoSaved=!prepared.recovered&&b.courseDraft.demoSaved===true;if(prepared.recovered){cs.draft={};delete cs.failedTask;p.labRecovery=prepared.message;}else if(b.courseDraft.draft&&typeof b.courseDraft.draft==='object'&&JSON.stringify(b.courseDraft.draft).length<50000){if(JSON.stringify(cs.draft)!==JSON.stringify(b.courseDraft.draft))delete cs.failedTask;cs.draft=b.courseDraft.draft;}}
        if(b.ux&&typeof b.ux==='object'){p.ux??={};p.ux.labTutorialSeen=b.ux.labTutorialSeen===true||p.ux.labTutorialSeen===true;if(b.ux.hintLevels&&typeof b.ux.hintLevels==='object')p.ux.hintLevels=Object.fromEntries(Object.entries(b.ux.hintLevels).filter(([key,v])=>content.data.taskContracts.registry[key]&&Number.isInteger(v)&&v>=0&&v<=3));}
        store(id,p); return {ok:true};
      }
      if(method==='POST'&&route==='/api/student/action') {
        const b=await body(req);
        return transaction(()=>{
          const p=state(id); let result={correct:true};
          if(b.action==='replayStart'){const chapter=b.chapter;if(p.replay)fail('Сначала завершите текущий повтор.');if(!Number.isInteger(chapter)||chapter<2||chapter>15||!p.completedChapters.includes(chapter))fail('Повтор доступен для завершённой главы.');const c=content.data.curriculum[chapter],original=p.course?.[chapter];p.course??={};p.replay={chapter,original:original?structuredClone(original):null,resumeChapter:p.currentChapter,resumeObjective:p.currentObjective,resumeDraft:p.courseDraft?structuredClone(p.courseDraft):null};p.currentChapter=chapter;p.currentObjective='course';delete p.courseDraft;p.replayGeneration=Math.max(p.replayGeneration||0,original?.taskGeneration||0)+1;p.course[chapter]={step:content.network.course.stages(c).indexOf('practical'),wrong:0,hints:0,taskGeneration:p.replayGeneration,tickets:chapter===15?original?.tickets||['cable','dns','gateway']:undefined};result={ok:true,message:'Повтор тренировки. XP и первый результат сохраняются.'};}
          else if(b.action==='replayEnd'){if(!p.replay)fail('Сейчас нет активного повтора.');endReplay(p);result={ok:true};}
          else if(b.action?.startsWith('course')) {
            const info=content.network.course.info(p);if(!info||b.chapter!==info.c.id||b.step!==info.state.step)fail('Шаг уже изменился. Откройте текущую цель снова.',409);
            const {c,state:cs,stage}=info;if(p.location!==c.location)fail(`Сначала перейдите в ${content.data.locations[c.location].name}.`);
            if(b.action==='courseReset'){if(!['practical','demo'].includes(stage))fail('Восстановление доступно в текущем задании или демонстрации.');const demo=stage==='demo',key=demo?'demoGeneration':'taskGeneration';cs[key]=(cs[key]||0)+1;if(p.replay)p.replayGeneration=Math.max(p.replayGeneration||0,cs[key]);if(content.network.taskState.NETWORK_CHAPTERS.includes(c.id)){cs[demo?'demoModel':'model']=content.network.taskState.initial({chapter:c.id,demo,generation:cs[key]});}cs.draft={};delete cs.failedTask;if(demo){cs.demoSaved=false;cs.guidedCable=false;}result={ok:true,message:'Учебный стенд восстановлен для текущего задания.'};}
            else if(b.action==='courseHint'){if(stage!=='practical')fail('Подсказки доступны во время самостоятельной практики.');if(cs.hints<3){cs.hints++;run('UPDATE student_progress SET hints=hints+1 WHERE student_id=?',id);}result={hint:c.hints[Math.min(cs.hints,3)-1],level:cs.hints};}
            else if(b.action==='courseDemo'){
              if((b.taskGeneration??b.model?.task?.generation??0)!==(cs.demoGeneration||0))fail('Демонстрация уже восстановлена. Откройте текущую схему.',409);if(![2,5,7].includes(c.id)||stage!=='demo'||!content.network.validModel(b.model))fail('Выполните текущую демонстрацию.');const demonstrated=c.id===2?!!content.network.topology.path(b.model,'d1','d2'):c.id===5?b.model.devices.find(d=>d.name==='PC-01')?.ip==='192.168.1.10':content.data.taskContracts.flows[7].slice(0,3).every(t=>content.data.taskContracts.done(t,b.model,{}));if(!demonstrated)fail('Выполните отмеченные действия демонстрации.');cs.guidedCable=true;result={ok:true,message:'Действия демонстрации выполнены. Теперь можно перейти к тренировке.'};
            }
            else if(b.action==='courseAdvance'){
              if([2,5,7].includes(c.id)&&stage==='demo'&&!cs.guidedCable)fail('Сначала выполните демонстрацию вместе с наставником.');
              if(!['intro','demo'].includes(stage)&&!stage.startsWith('theory-'))fail('Сначала выполните задание текущего шага.');
              cs.step++;if(p.courseDraft?.demo)delete p.courseDraft;
              if(c.id===15&&!cs.tickets)cs.tickets=[...content.network.course.faults].sort(()=>Math.random()-.5).slice(0,3);
            }
            else if(b.action==='courseAnswer'){
              if(stage!=='training'||!Number.isInteger(b.response)||b.response<0||b.response>=c.training.options.length)fail('Выберите ответ текущей тренировки.');
              result={correct:b.response===c.training.answer,explanation:c.training.explanations[b.response]};
              run('INSERT INTO practice_attempts(student_id,task_id,correct,explanation,created_at) VALUES(?,?,?,?,?)',id,`course-${c.id}-training`,result.correct?1:0,result.explanation,now());
              if(result.correct)cs.step++;else cs.wrong++;
            }
            else if(b.action==='coursePractice'){
              if((b.taskGeneration??b.model?.task?.generation??0)!==(cs.taskGeneration||0))fail('Задание уже восстановлено. Откройте текущую схему.',409);if(stage!=='practical')fail('Сначала прочитайте объяснение, демонстрацию и выполните тренировку.');
              const contract=content.data.taskContracts.registry[`c${c.id}-${stage}`];if(!contract)fail('У задания нет обязательной инструкции.');
              result=content.data.taskContracts.validate(c.id,b.response,b.model,cs.tickets);
              if(result.failedTask)cs.failedTask=result.failedTask;else delete cs.failedTask;
              run('INSERT INTO practice_attempts(student_id,task_id,correct,explanation,created_at) VALUES(?,?,?,?,?)',id,`course-${c.id}-practical`,result.ok?1:0,result.message,now());
              if(content.network.validModel(b.model))cs.model=content.network.taskState.prepare(b.model,{chapter:c.id,generation:cs.taskGeneration||0}).model;
              if(result.ok){cs.score=Math.max(0,100-cs.wrong*5-cs.hints*10);const saved=p.replay?{changes:0}:run('INSERT OR IGNORE INTO chapter_results VALUES(?,?,?,?)',id,c.id,cs.score,now());if(saved.changes){if(!p.completedChapters.includes(c.id))p.completedChapters.push(c.id);p.xp+=c.xp;p.achievements.push(c.title);}p[`courseDone${c.id}`]=true;cs.step++;}
              else cs.wrong++;
            }
            else if(b.action==='courseContinue'){
              if(stage!=='result'||!p.completedChapters.includes(c.id))fail('Сначала завершите практику.');
              if(p.replay){endReplay(p);}
              else if(c.id===15){p.currentChapter=16;p.currentObjective='courseFinished';}
              else {p.currentChapter=c.id+1;p.currentObjective='course';content.network.course.migrate(p);}
            }else fail('Учебное действие не поддерживается.');
          }
          else if(b.action==='resetTask'){if(p.currentChapter!==1||p.location!=='lab'||p.packetDelivered)fail('Восстановление доступно в текущей первой практике.');p.networkGeneration=(p.networkGeneration||0)+1;p.networkModel=content.network.taskState.initial({chapter:1,generation:p.networkGeneration});p.connections=[];result={ok:true,message:'Учебный стенд восстановлен для текущего задания.'};}
          else if(b.action==='introComplete') { p.introComplete=true;if(!p.completedChapters.includes(1))p.currentObjective=p.networkQuizPassed?'visitLab':'networkQuiz'; }
          else if(b.action==='briefingComplete') { if(!p.networkQuizPassed||p.location!=='lab') fail('Сначала пройдите знакомство и перейдите в лабораторию.');p.briefingComplete=true;if(!p.completedChapters.includes(1))p.currentObjective=p.quizPassed?'connect':'quiz'; }
          else if(b.action==='quiz') {
            const task=content.data.tasks[b.taskId];if(!task||task.type!=='quiz'||!Array.isArray(b.response)||!b.response.every(n=>Number.isInteger(n)&&n>=0&&n<task.options.length)||new Set(b.response).size!==b.response.length) fail('Выберите варианты ответа.');
            if(b.taskId==='networkQuiz'&&!p.introComplete || b.taskId==='switchQuiz'&&!p.briefingComplete || b.taskId==='packetTrue'&&!p.packetDelivered) fail('Сначала выполните предыдущий шаг.');
            result=content.engines.tasks.evaluate(task,b.response);run('INSERT INTO quiz_attempts(student_id,task_id,response,correct,created_at) VALUES(?,?,?,?,?)',id,b.taskId,JSON.stringify(b.response),result.correct?1:0,now());
            if(result.correct && b.taskId==='networkQuiz') {p.networkQuizPassed=true;if(!p.completedChapters.includes(0)){p.completedChapters.push(0);run('INSERT OR IGNORE INTO chapter_results VALUES(?,?,?,?)',id,0,100,now());p.achievements.push('Стажёр IT-службы');}if(p.currentChapter<2)p.currentChapter=1;if(!p.unlockedLocations.includes('lab'))p.unlockedLocations.push('lab');if(p.currentChapter<2)p.currentObjective='visitLab';}
            if(result.correct && b.taskId==='switchQuiz') {p.quizPassed=true;if(p.currentChapter<2)p.currentObjective='connect';}
            if(result.correct && b.taskId==='packetTrue') p.packetQuizPassed=true;
          }
          else if(b.action==='practice') {
            if(!p.briefingComplete||!p.quizPassed||p.location!=='lab') fail('Пройдите объяснение и проверку перед практикой в лаборатории.');
            result=content.data.taskContracts.validate(1,null,b.model);run('INSERT INTO practice_attempts(student_id,task_id,correct,explanation,created_at) VALUES(?,?,?,?,?)',id,'firstNetwork',result.ok?1:0,result.message,now());
            if(content.network.validModel(b.model)) p.networkModel=content.network.taskState.prepare(b.model,{chapter:1,generation:p.networkGeneration||0}).model;
            if(result.ok){p.packetDelivered=true;p.connections=['pc01','pc02'];if(p.currentChapter<2)p.currentObjective='packetQuiz';}
          }
          else if(b.action==='hint') run('UPDATE student_progress SET hints=hints+1 WHERE student_id=?',id);
          else fail('Действие не поддерживается.');
          finishChapter(id,p);content.network.course.migrate(p);store(id,p);return {...result,progress:p,percent:percent(p)};
        });
      }
    }
    fail('Запрос не найден.',404);
  }
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('Cache-Control','no-store');
    try {
      await ready;
      const url=new URL(req.url,'http://localhost');
      if(url.pathname.startsWith('/api/')) {const value=await api(req,res,url);if(!res.writableEnded){res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(value));}return;}
      if(!['GET','HEAD'].includes(req.method)) fail('Метод не поддерживается.',405);
      if(url.pathname==='/index.html') {
        const u=session(req);if(!u||u.role!=='student'){res.writeHead(302,{Location:'/'});res.end();return;}
        const boot=JSON.stringify(state(u.user_id)).replaceAll('<','\\u003c');
        const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8').replace('<head>',`<head><script>window.PATROL_INITIAL=${boot};</script>`);
        res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return;
      }
      const file=url.pathname==='/'?'portal.html':decodeURIComponent(url.pathname).slice(1);
      if(!/^(portal\.(html|js|css)|styles\.css|game\.js|(assets|data|engine|network|ui)\/[a-zA-Z0-9_./ -]+)$/.test(file)) fail('Файл не найден.',404);
      const absolute=path.resolve(ROOT,file);if(!absolute.startsWith(ROOT+path.sep)||!fs.existsSync(absolute)||!fs.statSync(absolute).isFile()) fail('Файл не найден.',404);
      const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.json':'application/json'};
      res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');if(req.method==='HEAD')res.end();else fs.createReadStream(absolute).pipe(res);
    } catch(e) {res.statusCode=e.status||500;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify({error:e.status?e.message:'Не удалось выполнить запрос. Попробуйте снова.'}));if(!e.status)console.error(e);}
  });
  return {server,db,ready,filename};
}
module.exports={createApp,fresh,percent};
if(require.main===module) {
  (async()=>{const {server,db,ready,filename}=createApp();try{await ready;}catch(e){db.close();throw e;}
    server.on('error',e=>{console.error(e.message);db.close();process.exitCode=1;});
    server.listen(Number(process.env.PORT||8000),process.env.HOST||'127.0.0.1',()=>{console.log(`БД – ${filename}`);console.log(`Сетевой патруль запущен на порту ${process.env.PORT||8000}`);});
  })().catch(e=>{console.error(e.message);process.exitCode=1;});
}

'use strict';
const { createApp, fresh }=require('../server/app.cjs');
const { hashPassword }=require('../server/auth.cjs');
async function fixture({filename=':memory:'}={}) {
  const a=createApp({filename,bootstrapEnv:{NODE_ENV:'test'}});
  const hash=await hashPassword('Test-password-2026');
  a.db.prepare('INSERT OR IGNORE INTO teachers(id,login,name,password_hash) VALUES(1,?,?,?)').run('teacher','Преподаватель проверки',hash);
  a.db.prepare('INSERT OR IGNORE INTO teachers(id,login,name,password_hash) VALUES(2,?,?,?)').run('other','Другой преподаватель',hash);
  await new Promise(r=>a.server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${a.server.address().port}`;
  const call=async(route,{method='GET',data,cookie}={})=>{
    const r=await fetch(base+route,{method,headers:{...(data?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},body:data?JSON.stringify(data):undefined,redirect:'manual'});
    const type=r.headers.get('content-type')||'';
    return {status:r.status,body:type.includes('application/json')?await r.json():await r.text(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
  };
  const teacher=await call('/api/login',{method:'POST',data:{role:'teacher',login:'teacher',password:'Test-password-2026'}});
  let group=await call('/api/groups',{method:'POST',cookie:teacher.cookie,data:{name:'ИСП-24-1',course:2,capacity:25}});
  const groupId=group.body.id;
  const groups=await call('/api/groups',{cookie:teacher.cookie});const token=groups.body.groups.find(g=>g.id===groupId).token;
  async function student(progress={}) {
    const joined=await call('/api/join',{method:'POST',data:{token,surname:'Иванов',firstName:'Иван',password:'Student-password-2026'}});
    if(joined.status!==200)throw new Error(JSON.stringify(joined));
    const s=a.db.prepare('SELECT id FROM students WHERE login=?').get(joined.body.login);
    a.db.prepare('UPDATE student_progress SET state=? WHERE student_id=?').run(JSON.stringify({...fresh(),...progress}),s.id);
    return {id:s.id,login:joined.body.login,cookie:joined.cookie};
  }
  async function browser(){return require('./browser.cjs').launchBrowser();}
  async function page(browser,progress={},options={}){
    const s=await student(progress),context=await browser.newContext(options);
    await context.addCookies([{name:'patrol_session',value:s.cookie.split('=')[1],url:base}]);
    const page=await context.newPage();page.student=s;return page;
  }
  return {...a,base,call,teacher:teacher.cookie,token,groupId,student,browser,page,async close(){await new Promise(r=>a.server.close(r));a.db.close();}};
}
module.exports={fixture};

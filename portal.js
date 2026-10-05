'use strict';
(() => {
  const app=document.getElementById('app'),message=document.getElementById('message');
  const node=(tag,text='',parent=app)=>{const e=document.createElement(tag);e.textContent=text;parent.append(e);return e;};
  const error=e=>{message.textContent=e.message;};
  async function api(url,method='GET',data) {const r=await fetch(url,{method,headers:method==='GET'?{}:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});const b=await r.json();if(!r.ok)throw new Error(b.error);return b;}
  function button(label,action,parent=app,secondary=false){const b=node('button',label,parent);b.type='button';if(secondary)b.className='secondary';b.onclick=async()=>{b.disabled=true;message.textContent='';try{await action();}catch(e){error(e);}finally{b.disabled=false;}};return b;}
  function input(label,name,parent,type='text',required=true){
    const l=node('label',label,parent);
    const holder=type==='password'?node('span','',l):l;
    if(type==='password')holder.className='password-field';
    const i=node('input','',holder);i.name=name;i.type=type;i.required=required;i.maxLength=type==='password'?128:60;
    i.id=`field-${name}`;l.htmlFor=i.id;i.setAttribute('aria-label',label);
    if(type==='password'){
      i.minLength=10;
      const toggle=node('button','',holder);toggle.type='button';toggle.className='password-toggle';toggle.setAttribute('aria-controls',i.id);
      function render(visible){
        toggle.setAttribute('aria-label',visible?'Скрыть пароль':'Показать пароль');toggle.setAttribute('aria-pressed',String(visible));
        toggle.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'+(visible?'<path d="m3 3 18 18"/>':'')+'</svg>';
      }
      render(false);
      toggle.onclick=()=>{const visible=i.type==='password';i.type=visible?'text':'password';render(visible);};
    }
    return i;
  }
  function form(parent,submit){const f=node('form','',parent);let pending=false;f.onsubmit=async e=>{e.preventDefault();if(pending)return;pending=true;const b=f.querySelector('[type=submit]');b.disabled=true;message.textContent='';try{await submit(Object.fromEntries(new FormData(f)));}catch(e){error(e);}finally{pending=false;b.disabled=false;}};return f;}
  function submit(label,f){const b=node('button',label,f);b.type='submit';}
  function login(role='student'){
    app.replaceChildren();node('h2',role==='teacher'?'Вход преподавателя':'Вход студента');
    const f=form(app,async b=>{await api('/api/login','POST',{...b,role});await boot();});
    input('Логин','login',f).autocomplete='username';input('Пароль','password',f,'password').autocomplete='current-password';submit('Войти',f);
    button(role==='teacher'?'Я студент':'Я преподаватель',()=>login(role==='teacher'?'student':'teacher'),app,true);
    node('p',role==='teacher'?'Учётную запись выдаёт администратор. Публичная регистрация преподавателей закрыта.':'Для первого входа откройте ссылку или QR-код от преподавателя.');
  }
  async function join(token){
    const g=await api(`/api/invite?token=${encodeURIComponent(token)}`);app.replaceChildren();node('h2',`Вы присоединяетесь к группе ${g.name}`);node('p',`${g.course} курс · свободных мест ${g.remaining}`);
    const f=form(app,async b=>{const r=await api('/api/join','POST',{...b,token});history.replaceState({},'', '/');app.replaceChildren();node('h2','Добро пожаловать');node('p',`Ваш логин – ${r.login}. Запишите его для следующего входа.`);const a=node('a','Запустить игру');a.href='/index.html';a.className='button';button('Выйти и проверить вход',logout,app,true);});
    input('Фамилия','surname',f).autocomplete='family-name';input('Имя','firstName',f).autocomplete='given-name';input('Отчество, если есть','patronymic',f,'text',false);input('Создайте пароль от 10 символов','password',f,'password').autocomplete='new-password';submit('Присоединиться',f);
  }
  async function logout(){await api('/api/logout','POST',{});await boot();}
  async function teacher(user){
    app.replaceChildren();const bar=node('div');bar.className='toolbar';node('h2',user.name,bar);button('Выйти',logout,bar,true);
    const f=form(app,async b=>{await api('/api/groups','POST',{name:b.name,course:Number(b.course),capacity:Number(b.capacity)});await teacher(user);});node('h3','Новая учебная группа',f);input('Название группы','name',f);
    const l=node('label','Курс',f),s=node('select','',f);s.name='course';s.id='group-course';l.htmlFor=s.id;for(let c=1;c<=6;c++){const o=node('option',`${c} курс`,s);o.value=c;}s.value=2;
    const cap=input('Максимум активных студентов','capacity',f,'number');cap.min=1;cap.max=200;cap.value=25;submit('Создать группу',f);
    const grid=node('div');grid.className='groups';
    for(const g of (await api('/api/groups')).groups){
      const card=node('article','',grid);node('h3',g.name,card);node('p',`${g.course} курс · зарегистрировано ${g.registered} из ${g.capacity}`,card);
      const qr=node('img','',card);qr.src=`/api/groups/${g.id}/qr`;qr.alt=`QR-код приглашения в группу ${g.name}`;qr.className='qr';
      const link=node('a',g.url,card);link.href=g.url;link.className='invite';
      button('Скопировать ссылку',async()=>{try{await navigator.clipboard.writeText(g.url);message.textContent='Ссылка скопирована.';}catch{message.textContent='Выделите и скопируйте ссылку над кнопкой.';}},card,true);
      if(g.open)button('Закрыть регистрацию',async()=>{await api(`/api/groups/${g.id}/close`,'POST',{});await teacher(user);},card,true);else node('p','Регистрация закрыта',card);
      button('Открыть результаты',()=>group(g.id,user),card);
    }
  }
  const date=value=>value?new Date(value).toLocaleString('ru-RU'):'Пока нет';
  async function group(id,user){
    const r=await api(`/api/groups/${id}`);app.replaceChildren();button('Все группы',()=>teacher(user),app,true);button('Обновить результаты',()=>group(id,user),app,true);node('h2',r.group.name);
    const a=r.aggregates,m=node('p',`Активных студентов ${a.active} · средний прогресс ${a.progress}% · средний балл ${a.score??'пока нет'}. Самая сложная проверка – ${a.hardest}`);m.className='metrics';
    const wrap=node('div');wrap.className='table-scroll';const table=node('table','',wrap),head=node('tr','',node('thead','',table));for(const h of ['ФИО','Прогресс','Средний балл','Текущая глава','Попытки','Последняя активность'])node('th',h,head);
    const tbody=node('tbody','',table);const details=node('section');details.className='card details';node('p','Нажмите на имя студента, чтобы посмотреть темы и попытки.',details);
    for(const s of r.students){const tr=node('tr','',tbody);button(s.name,()=>student(s,details,id,user),node('td','',tr),true);for(const v of [`${s.progress}%`,s.score??'Пока нет',s.currentChapter===16?'Курс завершён':`Глава ${s.currentChapter}`,s.attempts,date(s.last_activity)])node('td',String(v),tr);}
    if(!r.students.length)node('p','Студенты появятся после регистрации по приглашению.');
  }
  function student(s,parent,groupId,user){parent.replaceChildren();node('h3',s.name,parent);node('p',`Логин ${s.login} · подсказок ${s.hints} · последний вход ${date(s.last_login)}`,parent);
    for(const t of s.topics)node('p',`${t.title} – ${t.progress===null?'будущая глава':t.progress?`${t.progress}%`:'не начато'}`,parent);
    const attempts=node('details','',parent);node('summary','История проверок',attempts);for(const q of s.quizzes)node('p',`${({networkQuiz:'Сеть',switchQuiz:'Коммутатор',packetTrue:'Пакет'})[q.task_id]||q.task_id} – ${q.correct?'ответ принят':'нужна повторная попытка'} · ${date(q.created_at)}`,attempts);for(const p of s.practices)node('p',`Практика – ${p.explanation} · ${date(p.created_at)}`,attempts);
    for(const c of s.results)node('p',`Глава ${c.chapter_id} завершена · результат ${c.score}% · ${date(c.completed_at)}`,parent);
    button('Удалить ошибочную регистрацию',async()=>{if(!confirm(`Удалить регистрацию ${s.name}? Место в группе освободится, вход будет закрыт.`))return;await api(`/api/groups/${groupId}/students/${s.id}`,'DELETE',{});await group(groupId,user);},parent,true);
  }
  async function boot(){message.textContent='';try{const token=new URLSearchParams(location.search).get('invite');if(token){await join(token);return;}const {user}=await api('/api/me');if(!user){login();return;}if(user.role==='teacher'){await teacher(user);return;}app.replaceChildren();node('h2',user.name);node('p',`Ваш логин – ${user.login}`);const a=node('a','Запустить игру');a.href='/index.html';a.className='button';button('Выйти',logout,app,true);}catch(e){app.replaceChildren();error(e);button('К входу',()=>{history.replaceState({},'','/');login();},app,true);}}
  boot();
})();

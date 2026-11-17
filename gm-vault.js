/* Отдельный зашифрованный сейф ГМа. Не включать заметки в articles.enc.json! */
const GV={loaded:false,exists:false,env:null,key:"",notes:{},error:"",busy:false,drafts:{},notice:""};
const GV_PATH=()=>GH.dir+"data/gm-vault.enc.json";
const gvIsOpen=()=>!!(GH&&gh.login&&GV.key&&GV.exists);

function gvExtract(body){
  const lines=String(body||"").replace(/\r/g,"").split("\n"),pub=[],parts=[];
  for(let i=0;i<lines.length;i++){
    const m=lines[i].match(/^\s*:::\s*(гм|секрет)(?:\s+(.*))?\s*$/i);
    if(!m){pub.push(lines[i]);continue}
    let j=i+1;
    while(j<lines.length&&!/^\s*:::\s*$/.test(lines[j]))j++;
    if(j===lines.length)return{publicBody:String(body||""),parts:[],invalid:true};
    parts.push({title:(m[2]||"").trim(),body:lines.slice(i+1,j).join("\n")});
    i=j;
  }
  return{publicBody:pub.join("\n"),parts,invalid:false};
}
function gvHasLegacy(body){return /^\s*:::\s*(гм|секрет)(?:\s|$)/im.test(String(body||""))}
function gvCollect(all){
  const items=[];
  for(const [slug,a] of Object.entries(all||{})){
    if(!gvHasLegacy(a.body))continue;
    const part=gvExtract(a.body);
    if(part.invalid)throw new Error("В статье «"+(a.title||slug)+"» секретный блок не закрыт. Исправьте его вручную.");
    if(part.parts.length)items.push({slug,article:a,publicBody:part.publicBody,parts:part.parts});
  }
  return items;
}
function gvImported(item){
  return item.parts.map((p,i)=>{
    const tag="<!-- imported-gm:"+encodeURIComponent(item.slug)+":"+i+" -->";
    return tag+"\n"+(p.title?"## "+p.title+"\n":"")+p.body;
  });
}
function gvArticleHtml(slug){
  if(!GH||!gh.login||!canW())return"";
  const note=gvIsOpen()?(GV.notes[slug]||""):"";
  return '<div class="gm-vault-article">'+
    '<a class="btn" href="#gm-vault/'+encodeURIComponent(slug)+'">🔒 Заметки ГМа</a>'+
    (note?'<div class="gm-secret"><div class="gm-tag">Отдельный сейф ГМа</div>'+render(note)+'</div>':"")+
    '</div>';
}
async function gvReadFile(){
  try{
    const j=await ghApi("contents/"+GV_PATH()+"?ref="+encodeURIComponent(GH.branch)+"&t="+Date.now());
    const t=j.content?new TextDecoder().decode(b64dec(j.content)):await fetch(j.download_url,{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error("Не удалось получить файл сейфа");return r.text()});
    return{env:JSON.parse(t),sha:j.sha};
  }catch(e){if(e.status===404)return null;throw e}
}
async function gvLoad(){
  if(GV.loaded||!GH||!gh.login)return;
  try{const r=await gvReadFile();GV.loaded=true;GV.exists=!!r;GV.env=r?.env||null;GV.error=""}
  catch(e){GV.error="Не удалось загрузить сейф: "+(e.message||"ошибка сети")}
}
function gvMessage(s){return s?'<p class="notice">'+esc(s)+'</p>':""}
async function gvHtml(slug){
  document.title="Сейф ГМа · Кодекс Термины";
  if(!GH)return '<div class="gut"><div class="inner gm"><h1>Сейф ГМа</h1><p>Отдельный сейф доступен на версии GitHub Pages.</p></div></div>';
  if(!gh.login)return '<div class="gut"><div class="inner gm"><h1>Сейф ГМа</h1><p>Сначала войдите как редактор GitHub.</p><a class="btn" href="#gm">Вход для ГМа</a></div></div>';
  await gvLoad();
  const wrapStart='<div class="gut"><div class="inner editor"><div class="eyebrow">Только для ГМа</div><h1>Сейф ГМа</h1>';
  const warn='<p class="status">Для заметок нужен отдельный пароль, не совпадающий с ключом энциклопедии. Он не сохраняется в браузере. Если вы потеряете этот пароль, восстановить заметки из шифротекста будет невозможно.</p>';
  if(!GV.loaded)return wrapStart+gvMessage(GV.error||"Не удалось открыть сейф. Проверьте соединение и обновите страницу.")+'</div></div>';
  if(!GV.exists)return wrapStart+'<p>Создайте отдельно зашифрованный сейф для приватных заметок. Для этого нужны права записи ГМа.</p>'+warn+
    '<div class="form"><label>Новый пароль сейфа (от 16 символов)<input id="gv-password" type="password" autocomplete="new-password"></label>'+
    '<label>Повторите пароль<input id="gv-confirm-password" type="password" autocomplete="new-password"></label>'+
    '<button class="btn primary" id="gv-create" type="button" '+(GV.busy?"disabled":"")+'>Создать сейф</button></div>'+gvMessage(GV.error)+'</div></div>';
  if(!gvIsOpen())return wrapStart+'<p>Общего ключа энциклопедии недостаточно для доступа к приватным заметкам.</p>'+warn+
    '<div class="form"><label>Пароль сейфа<input id="gv-password" type="password" autocomplete="off"></label>'+
    '<button class="btn primary" id="gv-unlock" type="button" '+(GV.busy?"disabled":"")+'>Открыть сейф</button></div>'+gvMessage(GV.error)+'</div></div>';
  const choices=Object.entries(articles).filter(([,a])=>a&&a.title).sort((a,b)=>a[1].title.localeCompare(b[1].title,"ru"));
  const chosen=Object.hasOwn(articles,slug)?slug:"";
  const options='<option value="">Выберите статью...</option>'+choices.map(([s,a])=>'<option value="'+esc(s)+'" '+(s===chosen?'selected':'')+'>'+esc(a.title)+'</option>').join("");
  const count=Object.values(GV.notes).filter(Boolean).length;
  let affected=[],migrationError="";
  try{affected=gvCollect(articles)}catch(e){migrationError=e.message||"Есть повреждённые блоки"}
  const form= '<label>Статья<select id="gv-select">'+options+'</select></label>'+
    (chosen?'<label>Приватная заметка к статье<textarea id="gv-note" spellcheck="false">'+esc(Object.hasOwn(GV.drafts,chosen)?GV.drafts[chosen]:(GV.notes[chosen]||""))+'</textarea></label>'+
      '<div class="actions"><button class="btn primary" id="gv-save" type="button" '+(GV.busy?"disabled":"")+'>Сохранить секрет отдельно</button>'+
      '<a class="btn" href="#'+encodeURIComponent(chosen)+'">К статье</a></div>':
      '<p class="status">Выберите статью, чтобы добавить или изменить приватные заметки. В общей статье они храниться не будут.</p>');
  const migration=migrationError?'<p class="notice err">'+esc(migrationError)+'</p>':affected.length?'<section class="block"><h2 class="sec">Старые секретные блоки</h2>'+
    '<p>Найдено '+affected.length+' '+plural(affected.length,"статья","статьи","статей")+' с блоками <code>:::гм</code> или <code>:::секрет</code> в общей базе. Сейчас они <strong>не защищены</strong> от читателей с ключом энциклопедии.</p>'+
    '<p>Перенос сначала сохраняет заметки в отдельный сейф, затем убирает блоки из текущей версии общей базы. Старые версии в истории GitHub и в резервных копиях <strong>останутся доступными со старым ключом</strong>; для полной защиты понадобится очистка истории и смена общего ключа.</p>'+
    '<label>Для подтверждения напишите ПЕРЕНЕСТИ<input id="gv-migrate-confirm" type="text" autocomplete="off" placeholder="ПЕРЕНЕСТИ"></label>'+
    '<button class="btn danger" type="button" id="gv-migrate" '+(GV.busy?"disabled":"")+'>Перенести блоки в сейф</button></section>':
    '<p class="status">В открытых статьях не обнаружено старых блоков ГМа. Это не проверка предыдущих версий файлов.</p>';
  return wrapStart+'<div class="actions"><button class="btn" id="gv-lock" type="button">Закрыть сейф</button><a class="btn" href="#gm">Панель ГМа</a></div>'+
    gvMessage(GV.error)+gvMessage(GV.notice)+
    '<p class="lede">'+count+' '+plural(count,"приватная заметка","приватные заметки","приватных заметок")+'. Пароль сейфа хранится только в памяти открытой страницы.</p>'+
    '<div class="form">'+form+'</div>'+migration+'</div></div>';
}
async function gvCreate(){
  const password=$("#gv-password")?.value||"";
  const confirm=$("#gv-confirm-password")?.value||"";
  if(password.length<16){GV.error="Нужен пароль длиной не менее 16 символов.";return view()}
  if(password===lock.key){GV.error="Пароль сейфа должен отличаться от ключа энциклопедии.";return view()}
  if(password!==confirm){GV.error="Пароли не совпадают.";return view()}
  GV.busy=true;GV.error="";view();
  try{
    const doc={v:1,notes:{},updatedAt:Date.now()};
    const env=await encryptData(doc,password);
    await ghApi("contents/"+GV_PATH(),{method:"PUT",body:JSON.stringify({message:"Создать отдельный зашифрованный сейф ГМа",content:b64enc(new TextEncoder().encode(JSON.stringify(env))),branch:GH.branch})});
    GV.key=password;GV.notes={};GV.env=env;GV.loaded=true;GV.exists=true;GV.notice="Сейф создан. Запишите пароль в безопасном месте.";
  }catch(e){GV.error="Не удалось создать сейф: "+(e.message||"нет связи")}
  finally{GV.busy=false;view()}
}
async function gvUnlock(){
  const password=$("#gv-password")?.value||"";
  if(!password)return;
  GV.busy=true;GV.error="";view();
  try{
    const raw=await gvReadFile();
    if(!raw)throw new Error("Файл сейфа не найден");
    const doc=await decryptData(raw.env,password);
    if(doc.v!==1||!doc.notes||typeof doc.notes!=="object"||Array.isArray(doc.notes))throw new Error("Неверный формат сейфа");
    GV.key=password;GV.notes=doc.notes;GV.env=raw.env;GV.exists=true;GV.loaded=true;
  }catch{GV.error="Пароль сейфа не подошёл или файл повреждён.";GV.key="";GV.notes={}}
  finally{GV.busy=false;view()}
}
async function gvUpdate(change){
  if(!gvIsOpen())throw new Error("Сначала откройте сейф");
  const raw=await gvReadFile();
  if(!raw)throw new Error("Файл сейфа не найден");
  const doc=await decryptData(raw.env,GV.key);
  if(doc.v!==1||!doc.notes||typeof doc.notes!=="object"||Array.isArray(doc.notes))throw new Error("Неверный формат сейфа");
  const notes=change({...doc.notes});
  const next={v:1,notes,updatedAt:Date.now()};
  const env=await encryptData(next,GV.key);
  await ghApi("contents/"+GV_PATH(),{method:"PUT",body:JSON.stringify({message:"Обновление зашифрованных заметок ГМа",content:b64enc(new TextEncoder().encode(JSON.stringify(env))),sha:raw.sha,branch:GH.branch})});
  GV.notes=notes;GV.env=env;
}
async function gvSave(slug){
  if(!articles[slug])return;
  const value=$("#gv-note")?.value||"";
  GV.drafts[slug]=value;GV.busy=true;GV.error="";GV.notice="";view();
  try{
    await gvUpdate(notes=>{
      if((notes[slug]||"")!==(GV.notes[slug]||""))throw new Error("Эту заметку обновили в другой вкладке. Обновите страницу и сверьте изменения.");
      if(value.trim())notes[slug]=value;else delete notes[slug];
      return notes;
    });
    delete GV.drafts[slug];GV.notice="Приватная заметка сохранена отдельно от энциклопедии.";
  }catch(e){GV.error="Не удалось сохранить: "+(e.message||"нет связи")}
  finally{GV.busy=false;view()}
}
async function gvMigrate(){
  if(($("#gv-migrate-confirm")?.value||"").trim()!=="ПЕРЕНЕСТИ"){GV.error="Напишите ПЕРЕНЕСТИ для подтверждения.";return view()}
  GV.busy=true;GV.error="";GV.notice="";view();
  try{
    /* Получить свежую версию базы и сохранить секреты ПЕРЕД удалением из неё. */
    const current=await ghRead();
    const found=gvCollect(current.data.articles);
    if(!found.length){GV.notice="В текущей версии старых блоков нет.";return}
    await gvUpdate(notes=>{
      for(const item of found){
        const before=notes[item.slug]||"";
        const add=gvImported(item).filter(x=>!before.includes(x));
        if(add.length)notes[item.slug]=before+(before?"\n\n---\n\n":"")+add.join("\n\n");
      }
      return notes;
    });
    const data=current.data;
    data.articles={...data.articles};
    for(const item of found)data.articles[item.slug]={...item.article,body:item.publicBody,updatedAt:Date.now()};
    data.at=Date.now();
    const env=await encryptData(data,lock.key);
    await ghApi("contents/"+DATA_PATH(),{method:"PUT",body:JSON.stringify({message:"Убрать GM-блоки из общей версии статей",content:b64enc(new TextEncoder().encode(JSON.stringify(env))),sha:current.sha,branch:GH.branch})});
    articles=data.articles;snapMeta={at:data.at};
    GV.notice="Из текущей базы перенесено "+found.length+" "+plural(found.length,"статья","статьи","статей")+". Не забудьте сменить ключ общей вики и обработать старую историю.";
  }catch(e){GV.error="Перенос не завершён: "+(e.message||"нет связи")+". Секреты, уже записанные в сейф, не удалены. Обновите страницу и повторите после проверки."}
  finally{GV.busy=false;view()}
}
function gvBind(){
  const button=(id,fn)=>{const el=$(id);if(el)el.onclick=fn};
  button("#gv-create",gvCreate);
  button("#gv-unlock",gvUnlock);
  button("#gv-lock",()=>{GV.key="";GV.notes={};GV.drafts={};GV.error="";GV.notice="";view()});
  button("#gv-save",()=>gvSave(route().slice(9)));
  button("#gv-migrate",gvMigrate);
  const sel=$("#gv-select");if(sel)sel.onchange=()=>{const s=sel.value;location.hash=s?"gm-vault/"+encodeURIComponent(s):"gm-vault"};
  const pw=$("#gv-password");if(pw)pw.onkeydown=e=>{if(e.key==="Enter"){const id=GV.exists?"#gv-unlock":"#gv-create";$(id)?.click()}};
}

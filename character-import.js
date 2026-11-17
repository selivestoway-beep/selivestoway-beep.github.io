/* Локальный импорт персонажей без публикации незашифрованных текстов в GitHub. */
const CI={items:[],file:"",error:"",working:false,report:[],done:new Set(),status:""};
const CI_FORMAT="kodeks-terminy-characters";

function ciEscape(s){return esc(s)}
function ciValidate(obj){
  if(!obj||obj.format!==CI_FORMAT||obj.version!==1||!Array.isArray(obj.articles))throw Error("Неверный формат файла импорта.");
  if(!obj.articles.length||obj.articles.length>20)throw Error("В пакете должно быть от 1 до 20 персонажей.");
  const used=new Set();
  for(const a of obj.articles){
    if(!a||a.kind!=="character"||typeof a.slug!=="string"||!/^[a-z0-9][a-z0-9-]{1,60}$/.test(a.slug)||used.has(a.slug))throw Error("Недопустимый или повторяющийся идентификатор персонажа.");
    used.add(a.slug);
    if(typeof a.title!=="string"||!a.title.trim()||a.title.length>120||typeof a.body!=="string"||!a.body.trim()||a.body.length>50000)throw Error("Отсутствует имя или текст статьи.");
    if(typeof a.group!=="string"||!a.group.trim())throw Error("Не задана группа персонажа.");
    if(!a.image||typeof a.image.base64!=="string"||!/^image\/(webp|png|jpeg|gif)$/.test(a.image.mime)||!/^[a-zA-Z0-9._-]+$/.test(a.image.filename||""))throw Error("Не найден портрет: "+a.title);
    if(a.image.base64.length>4e6||!/^[A-Za-z0-9+/]*={0,2}$/.test(a.image.base64))throw Error("Портрет повреждён или слишком большой: "+a.title);
    for(const key of ["role","summary","facts","relations","status"]){
      if(a[key]!==undefined&&typeof a[key]!=="string")throw Error("Неверное поле "+key+": "+a.title);
    }
    if(a.aliases!==undefined&&(!Array.isArray(a.aliases)||!a.aliases.every(x=>typeof x==="string")))throw Error("Неверные альтернативные имена: "+a.title);
  }
  return obj.articles;
}
function ciHtml(){
  document.title="Импорт персонажей · Кодекс Термины";
  if(!GH||lock.state!=="open")return '<div class="gut"><div class="inner editor"><h1>Импорт персонажей</h1><p>Функция доступна на открытом сайте GitHub Pages.</p></div></div>';
  if(!gh.login)return '<div class="gut"><div class="inner editor"><h1>Импорт персонажей</h1><p>Сначала войдите как ГМ через GitHub.</p><a class="btn" href="#gm">Вход для ГМа</a></div></div>';
  const intro='<section class="sky small gut"><div class="inner"><div class="eyebrow">Мастерская</div><h1>Импорт персонажей</h1><p class="lede">Импортируйте готовый пакет с текстами и портретами. Тексты шифруются ключом открытого кодекса до отправки в GitHub.</p></div></section>';
  const hint='<p class="status">Файл импортируется только в браузере. Его незашифрованная копия не публикуется в репозитории. Для сохранения нужны права записи ГМа. Перед заменой существующей статьи сохраните её резервную копию.</p>';
  const pick='<div class="form"><label for="ci-file">Пакет персонажей (JSON)<input type="file" id="ci-file" accept=".json,application/json" '+(CI.working?'disabled':'')+'></label></div>';
  let listings="";
  if(CI.items.length){
    const rows=CI.items.map(a=>{
      const old=articles[a.slug];const collision=old&&norm(old.title)!==norm(a.title);
      const clash=Object.entries(articles).some(([slug,b])=>slug!==a.slug&&norm(b.title)===norm(a.title));
      const st=CI.done.has(a.slug)?"Импортировано":collision?"Конфликт: другой персонаж в этом адресе":clash?"Конфликт: имя занято":"Готово к импорту";
      return '<tr><td><b>'+ciEscape(a.title)+'</b><br><small>'+ciEscape(a.role||a.group)+'</small></td><td>'+ciEscape(a.slug)+'</td><td>'+ciEscape(old?"Обновление существующей записи":"Новая запись")+'</td><td>'+ciEscape(st)+'</td></tr>';
    }).join("");
    const blockers=CI.items.some(a=>(articles[a.slug]&&norm(articles[a.slug].title)!==norm(a.title))||Object.entries(articles).some(([s,b])=>s!==a.slug&&norm(b.title)===norm(a.title)));
    listings='<div class="tbl"><table><thead><tr><th>Персонаж</th><th>Адрес</th><th>Действие</th><th>Статус</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
      '<p class="status">Обновление существующей записи заменит её описание и портрет, но сохранит дату создания и дополнительные поля. История правок остаётся в вики.</p>'+
      (blockers?'<p class="notice err">Обнаружен конфликт. Импорт недоступен, пока конфликтующие идентификаторы не будут исправлены.</p>':"")+
      '<div class="actions"><button class="btn primary" type="button" id="ci-start" '+(CI.working||blockers||CI.done.size===CI.items.length?'disabled':'')+'>Сохранить персонажей в зашифрованной вики</button></div>';
  }
  const report=CI.report.map(x=>'<li>'+ciEscape(x)+'</li>').join("");
  return intro+'<div class="gut"><div class="inner editor"><h2 class="sec">Пакет для импорта</h2>'+hint+pick+
    (CI.file?'<p class="status">Выбран файл: '+ciEscape(CI.file)+'</p>':"")+
    (CI.error?'<p class="notice err">'+ciEscape(CI.error)+'</p>':"")+
    listings+'<p class="status" id="ci-status" role="status">'+ciEscape(CI.status)+'</p>'+
    (report?'<ol>'+report+'</ol>':"")+'</div></div>';
}
function ciImageFile(img){
  const bin=atob(img.base64);
  const bytes=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
  return new File([bytes],img.filename,{type:img.mime});
}
function ciDoc(a,old,image){
  const now=Date.now();
  const doc={...(old||{}),
    kind:"character",
    title:a.title.trim(),
    category:"Персонажи",
    group:a.group.trim(),
    role:(a.role||"").trim(),
    summary:(a.summary||"").trim(),
    status:(a.status||"").trim(),
    aliases:Array.isArray(a.aliases)?a.aliases.map(x=>x.trim()).filter(Boolean):[],
    facts:(a.facts||"").replace(/\r/g,"").trim(),
    relations:(a.relations||"").replace(/\r/g,"").trim(),
    body:a.body.replace(/\r/g,""),
    image,
    order:old?.order??99,
    createdAt:old?.createdAt||now,
    updatedAt:now,
    updatedBy:"gh:"+(gh.login||"ГМ")
  };
  return doc;
}
async function ciStart(){
  if(CI.working||!CI.items.length||!GH||!gh.login||lock.state!=="open")return;
  CI.error="";CI.working=true;CI.status="Проверяем актуальную базу…";
  try{
    const current=await ghRead();
    if(!current?.data?.articles)throw Error("Не удалось прочитать действующую базу статей.");
    articles=current.data.articles;
    for(const a of CI.items){
      const old=articles[a.slug];
      if((old&&norm(old.title)!==norm(a.title))||Object.entries(articles).some(([s,b])=>s!==a.slug&&norm(b.title)===norm(a.title)))throw Error("Импорт остановлен: конфликт имени или адреса статьи "+a.slug);
    }
    for(const a of CI.items){
      if(CI.done.has(a.slug))continue;
      CI.status="Загружаем портрет: "+a.title;ciSetStatus();
      const image=await ghUpload(ciImageFile(a.image),a.slug);
      CI.status="Шифруем и сохраняем статью: "+a.title;ciSetStatus();
      const old=articles[a.slug];
      await commitDoc(a.slug,ciDoc(a,old,image),{act:old?"edit":"create",note:"Импорт подготовленного пакета персонажей"});
      CI.done.add(a.slug);
      CI.report.push("Готово: "+a.title);
    }
    CI.status="Импорт завершён. Персонажи опубликованы после обновления GitHub Pages.";
  }catch(e){CI.error="Импорт прерван: "+(e?.message||"неизвестная ошибка")+". Ранее сохранённые записи остаются в вики.";CI.status="Сохранённые записи можно открыть из списка ниже."}
  CI.working=false;
  view();
}
function ciSetStatus(){const target=document.getElementById("ci-status");if(target)target.textContent=CI.status}
function ciBind(){
  const pick=$("#ci-file");
  if(pick)pick.onchange=async()=>{
    const f=pick.files?.[0];if(!f)return;
    CI.file=f.name;CI.items=[];CI.done.clear();CI.report=[];CI.error="";CI.status="";
    if(f.size>5*1024*1024){CI.error="Файл больше 5 МБ.";view();return}
    try{CI.items=ciValidate(JSON.parse(await f.text()))}
    catch(e){CI.error=e.message||"Не удалось прочитать файл."}
    view();
  };
  const start=$("#ci-start");if(start)start.onclick=ciStart;
}

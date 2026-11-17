import {readFileSync} from "node:fs";
import {test} from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
const source=readFileSync(new URL("../character-import.js",import.meta.url),"utf8");
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const context=vm.createContext({gh:{login:"Проверка"}});
const api=vm.runInContext(source+"\n({ciValidate,ciDoc})",context);
const character=(slug,title)=>({slug,kind:"character",title,group:"Альянс",body:"Описание",role:"Должность",image:{filename:slug+".webp",mime:"image/webp",base64:"QUJDRA=="}});
const pack=articles=>({format:"kodeks-terminy-characters",version:1,articles});
test("valid JavaScript for importer and wiki app",()=>{
  assert.doesNotThrow(()=>new vm.Script(source));
  const app=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].at(-1)[1];
  assert.doesNotThrow(()=>new vm.Script(app));
});
test("importer validates character packages",()=>{
  const docs=api.ciValidate(pack([character("pontifik-alister","Понтифик Алистер"),character("immora","Иммора, Архангел Истины")]));
  assert.equal(docs.length,2);
  assert.throws(()=>api.ciValidate(pack([character("a","X"),character("a","Y")])),/идентификатор/);
  assert.throws(()=>api.ciValidate(pack([character("valid","")])),/имя или текст/);
  assert.throws(()=>api.ciValidate(pack([{...character("valid","X"),image:{filename:"x.exe",mime:"application/x-msdownload",base64:"QUJD"}}])),/портрет/);
  assert.throws(()=>api.ciValidate({format:"other",version:1,articles:[character("valid","X")]}),/формат/);
});
test("existing articles preserve stable metadata on replacement",()=>{
  const current={createdAt:123,order:8,custom:"сохранить",body:"старый"};
  const draft=api.ciDoc({...character("pontifik-alister","Понтифик Алистер"),summary:"Новая запись"},current,"images/pontifik-alister.webp");
  assert.equal(draft.createdAt,123);
  assert.equal(draft.order,8);
  assert.equal(draft.custom,"сохранить");
  assert.equal(draft.image,"images/pontifik-alister.webp");
  assert.equal(draft.body,"Описание");
  assert.equal(draft.summary,"Новая запись");
});
test("secrets never enter repository as source files",()=>{
  assert.match(source,/const CI_FORMAT="kodeks-terminy-characters"/);
  assert.match(source,/await ghRead\(\)/);
  assert.match(source,/await ghUpload\(ciImageFile\(a\.image\),a\.slug\)/);
  assert.match(source,/await commitDoc\(a\.slug,ciDoc/);
  assert.match(html,/<script src="character-import\.js"><\/script>/);
  assert.match(html,/else if\(r==="import-personazhi"\)html=ciHtml\(\)/);
  assert.doesNotMatch(html,/"title":"Иммора, Архангел Истины"/);
  assert.doesNotMatch(html,/"title":"Понтифик Алистер"/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Script } from "node:vm";
const path=(p)=>new URL("../"+p,import.meta.url);
const additions=JSON.parse(readFileSync(path("data/published-additions.json"),"utf8"));
const html=readFileSync(path("index.html"),"utf8");
test("published articles include Alister, Immora and Iden",()=>{
 assert.equal(additions.version,1);
 assert.deepEqual(Object.keys(additions.articles).sort(),["iden-bitardskii","immora","pontifik-alister"]);
 assert.equal(additions.articles["pontifik-alister"].title,"Понтифик Алистер");
 assert.equal(additions.articles.immora.title,"Иммора, Архангел Истины");
 assert.equal(additions.articles["iden-bitardskii"].title,"Иден Битардский");
 for(const [slug,a] of Object.entries(additions.articles)){
   assert.equal(a.kind,"character");
   assert.equal(a.category,"Персонажи");
   assert.ok(a.body.length>800);
   assert.equal(a.image,"images/"+slug+(slug==="iden-bitardskii"?".jpg":".png"));
 }
});
test("original PNG and JPEG portraits are byte-for-byte intact",()=>{
 const expected={"images/pontifik-alister.png":"694f124993cd3754bd84985420a8f5b665e4a94d","images/immora.png":"97d6b5b4a3883680c1c888b9483f4389c5207fa2","images/iden-bitardskii.jpg":"26122557d4d8a47e0b8522436b7e8408ee64fc75"};
 for(const [p,sha] of Object.entries(expected)){
   const b=readFileSync(path(p));
   assert.ok(p.endsWith(".jpg")?b.subarray(0,3).toString("hex")==="ffd8ff":b.subarray(0,8).toString("hex")==="89504e470d0a1a0a");
   const hash=createHash("sha1").update(Buffer.from("blob "+b.length+"\0")).update(b).digest("hex");
   assert.equal(hash,sha);
 }
});
test("facts are verified additions rather than an overwrite",()=>{
 assert.equal(additions.facts.length,10);
 assert.ok(additions.facts.every(f=>typeof f==="string"&&f.includes("[[")));
 assert.match(html,/function dykFacts\(\)\{[^\n]*publishedFacts\(out\)/);
 assert.match(html,/const original=String\(body\|\|""\)/);
});
test("codex JS syntax is valid, content is loaded only after unlock",()=>{
 const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
 assert.ok(scripts.length>=2);
 assert.doesNotThrow(()=>new Script(scripts.at(-1)[1]));
 assert.match(html,/await publishedLoad\(\)/);
 assert.match(html,/articles=publishedMerge\(data\.articles\|\|\{\}\)/);
 assert.match(html,/articles=publishedMerge\(fresh\.data\.articles\|\|articles\)/);
 assert.match(html,/publishedFactBody\(a\.body\)/);
});

test("Iden biography is complete and carefully proofread",()=>{
  const a=additions.articles["iden-bitardskii"];
  assert.equal(a.group,"Главные герои");
  assert.equal(a.aliases.includes("Оп"),true);
  assert.ok(a.body.length>10500);
  assert.equal((a.body.match(/^## /gm)||[]).length,8);
  assert.match(a.body,/## Драконий путь/);
  assert.match(a.body,/\[\[Эрих Аскариос\|Эрихом\]\]/);
  for(const typo of ["Эрихшм","напротяжении","алкокголю","Поускай","оставалось дишь"]){
    assert.ok(!a.body.includes(typo),"Unfixed typo: "+typo);
  }
  assert.equal(a.image,"images/iden-bitardskii.jpg");
});
test("overlay updates retain existing character order and creation time",()=>{
  assert.match(html,/createdAt:old\.createdAt\|\|a\.createdAt/);
  assert.match(html,/order:old\.order\?\?a\.order/);
});

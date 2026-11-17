import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Script } from "node:vm";
const path=(p)=>new URL("../"+p,import.meta.url);
const additions=JSON.parse(readFileSync(path("data/published-additions.json"),"utf8"));
const html=readFileSync(path("index.html"),"utf8");
test("published articles come from the two supplied biographies",()=>{
 assert.equal(additions.version,1);
 assert.deepEqual(Object.keys(additions.articles).sort(),["immora","pontifik-alister"]);
 assert.equal(additions.articles["pontifik-alister"].title,"Понтифик Алистер");
 assert.equal(additions.articles.immora.title,"Иммора, Архангел Истины");
 for(const [slug,a] of Object.entries(additions.articles)){
   assert.equal(a.kind,"character");
   assert.equal(a.category,"Персонажи");
   assert.ok(a.body.length>800);
   assert.equal(a.image,"images/"+slug+".png");
 }
});
test("original PNG uploads are byte-for-byte intact",()=>{
 const expected={"images/pontifik-alister.png":"694f124993cd3754bd84985420a8f5b665e4a94d","images/immora.png":"97d6b5b4a3883680c1c888b9483f4389c5207fa2"};
 for(const [p,sha] of Object.entries(expected)){
   const b=readFileSync(path(p));
   assert.equal(b.subarray(0,8).toString("hex"),"89504e470d0a1a0a");
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

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../gm-vault.js", import.meta.url), "utf8");
const app = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const functions = vm.runInNewContext(source + "\n({gvExtract,gvHasLegacy,gvCollect,gvImported})");

test("GM vault JavaScript parses without dependencies", () => {
  assert.doesNotThrow(() => new vm.Script(source));
});

test("extracts private text without changing public paragraphs", () => {
  const text = "До\n:::гм Тайна\nЗлодей — [[Казакион]]\n:::\nПосле";
  const result = functions.gvExtract(text);
  assert.equal(result.invalid, false);
  assert.equal(result.parts.length, 1);
  assert.equal(result.parts[0].title, "Тайна");
  assert.equal(result.parts[0].body, "Злодей — [[Казакион]]");
  assert.equal(result.publicBody, "До\nПосле");
  assert.equal(result.publicBody.includes("Злодей"), false);
});

test("supports multiple secret block types", () => {
  const doc = "Публично\n:::секрет\nФакт А\n:::\n\n:::гм Для мастера\nФакт Б\n:::";
  const result = functions.gvExtract(doc);
  assert.equal(result.invalid, false);
  assert.equal(result.parts.length, 2);
  assert.equal(result.publicBody.includes("Факт А"), false);
  assert.equal(result.publicBody.includes("Факт Б"), false);
  assert.ok(functions.gvHasLegacy(doc));
});

test("an unclosed GM block is never migrated destructively", () => {
  const text = "Публичное\n:::гм\nСекрет";
  assert.equal(functions.gvExtract(text).invalid, true);
  assert.throws(() => functions.gvCollect({foo:{title:"Тест",body:text}}), /не закрыт/);
});

test("keeps ordinary spoilers and mechanics in public body", () => {
  const text = ":::спойлер\nИгровой спойлер\n:::\n:::механика Тест\nУрон\n:::";
  const result = functions.gvExtract(text);
  assert.equal(result.parts.length, 0);
  assert.equal(result.publicBody, text);
});

test("migration supports multiple articles without exposing their GM parts", () => {
  const all = {
    a: {title:"А",body:"A\n:::гм\nSECRET ONE\n:::\nB"},
    b: {title:"Б",body:"C\n:::секрет Другое\nSECRET TWO\n:::"},
    c: {title:"В",body:"Only public"}
  };
  const found = functions.gvCollect(all);
  assert.equal(found.length, 2);
  assert.equal(found[0].publicBody, "A\nB");
  assert.equal(found[1].publicBody, "C");
  assert.ok(functions.gvImported(found[0])[0].includes("SECRET ONE"));
  assert.ok(functions.gvImported(found[1])[0].includes("SECRET TWO"));
  assert.ok(!JSON.stringify(found.map(x=>x.publicBody)).includes("SECRET"));
});

test("GM vault uses a distinct passphrase, encrypted writes and no shared article updates for notes", () => {
  assert.match(source, /password===lock\.key/);
  assert.match(source, /encryptData\(next,GV\.key\)/);
  assert.match(source, /contents\/"\+GV_PATH\(\)/);
  assert.match(source, /GV\.key=password/);
  assert.doesNotMatch(source, /(?:localStorage|sessionStorage)\.setItem\([^)]*GV/);
  assert.match(app, /if\(GH&&gvHasLegacy\(d\.body\)\)/);
  assert.match(app, /gvArticleHtml\(slug\)/);
});

test("old public article body is written only after vault update succeeds", () => {
  const fn = source.slice(source.indexOf("async function gvMigrate(){"), source.indexOf("function gvBind(){"));
  assert.ok(fn.indexOf("await gvUpdate(") >= 0);
  assert.ok(fn.indexOf("await ghApi(") > fn.indexOf("await gvUpdate("));
  assert.match(fn, /sha:current\.sha/);
});

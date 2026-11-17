import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import vm from "node:vm";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
const app = scripts.at(-1)?.[1] || "";

test("the HTML contains the application script and essential landmarks", () => {
  assert.ok(app.includes("function view()"));
  assert.match(html, /<main id="main"><\/main>/);
  assert.match(html, /id="q"/);
  assert.match(html, /id="snapshot"/);
});

test("the application JavaScript is syntactically valid", () => {
  assert.doesNotThrow(() => new vm.Script(app, { filename: "index.html" }));
});

test("malformed URL hashes cannot crash the router", () => {
  const routeSrc = app.split("\n").find(line => line.startsWith("function route(){"));
  assert.ok(routeSrc, "route() must exist");
  const context = { location: { hash: "#kazakion" } };
  const route = vm.runInNewContext(routeSrc + "\nroute", context);
  assert.equal(route(), "kazakion");
  context.location.hash = "#%D0%9A%D0%BE%D0%B4%D0%B5%D0%BA%D1%81";
  assert.equal(route(), "Кодекс");
  context.location.hash = "#%ZZ";
  assert.equal(route(), "");
});

function createStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem(key) { return data.get(key) ?? null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); },
  };
}

test("existing credentials migrate to session storage and can be cleared", () => {
  const begin = app.indexOf("function readSessionSecret(key){");
  const end = app.indexOf('const GH_KEY="kodeks.gh.token";', begin);
  assert.ok(begin >= 0 && end > begin, "session helpers must exist");
  const sessionStorage = createStorage();
  const localStorage = createStorage({ old: "legacy-token" });
  const helpers = vm.runInNewContext(
    app.slice(begin, end) + "\n({readSessionSecret,saveSessionSecret,clearSessionSecret})",
    { sessionStorage, localStorage },
  );
  assert.equal(helpers.readSessionSecret("old"), "legacy-token");
  assert.equal(sessionStorage.getItem("old"), "legacy-token");
  assert.equal(localStorage.getItem("old"), null);
  helpers.saveSessionSecret("old", "new-session-token");
  assert.equal(sessionStorage.getItem("old"), "new-session-token");
  assert.equal(localStorage.getItem("old"), null);
  helpers.clearSessionSecret("old");
  assert.equal(sessionStorage.getItem("old"), null);
});

test("no persistent writes of GitHub tokens or wiki passphrases", () => {
  assert.doesNotMatch(app, /localStorage\.setItem\(\s*(GH_KEY|KEY_LS)/);
  assert.match(app, /saveSessionSecret\(GH_KEY,t\)/);
  assert.match(app, /saveSessionSecret\(KEY_LS,pass\)/);
  assert.match(app, /clearSessionSecret\(GH_KEY\)/);
});

test("published JSON envelopes are parseable encrypted containers", () => {
  const files = ["articles.enc.json", ...readdirSync(new URL("../data/hist/", import.meta.url))
    .filter(name => name.endsWith(".enc.json")).map(name => "hist/" + name)];
  assert.ok(files.length > 2, "encrypted article files should exist");
  for (const file of files) {
    const envelope = JSON.parse(readFileSync(new URL("../data/" + file, import.meta.url), "utf8"));
    assert.equal(envelope.v, 1, file);
    assert.equal(typeof envelope.ct, "string", file);
    assert.equal(Buffer.from(envelope.salt, "base64").length, 16, file);
    assert.equal(Buffer.from(envelope.iv, "base64").length, 12, file);
    assert.ok(envelope.ct.length > 20, file);
  }
});

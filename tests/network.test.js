"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { read } = require("./helpers");

// Every network call site and every hardcoded host is deliberate. If a test here
// fails, update PRIVACY.md and the Preferences privacy text before this list.
const ALLOWED_HOSTS = new Set(["translate.google.com", "libretranslate.com", "localhost"]);

const SCRIPTS = ["background.js", "content/translator.js", "content/composer.js", "options/options.js"];

test("fetch() only appears at the known call sites", () => {
  const counts = Object.fromEntries(SCRIPTS.map((f) => [f, (read(f).match(/\bfetch\(/g) || []).length]));
  assert.deepEqual(counts, {
    "background.js": 5, // ollama translate, google, libretranslate, ollama detect, ollama model list
    "content/translator.js": 0,
    "content/composer.js": 0,
    "options/options.js": 1, // LibreTranslate Test Connection
  });
});

test("no XMLHttpRequest / WebSocket / sendBeacon / eval", () => {
  for (const f of SCRIPTS) {
    assert.doesNotMatch(read(f), /XMLHttpRequest|new WebSocket|sendBeacon|\beval\(|new Function\(/, f);
  }
});

test("hardcoded hosts in scripts are on the allowlist", () => {
  for (const f of SCRIPTS) {
    const code = read(f).replace(/^\s*\/\/.*$/gm, ""); // comments may link to docs
    for (const [, host] of code.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) {
      assert.ok(ALLOWED_HOSTS.has(host.toLowerCase()), `${f}: unexpected host ${host}`);
    }
  }
});

test("privacy text names every service host the code can contact", () => {
  const policy = read("PRIVACY.md") + read("options/options.html");
  for (const host of ["translate.google.com", "libretranslate.com"]) assert.match(policy, new RegExp(host.replace(/\./g, "\\.")));
});

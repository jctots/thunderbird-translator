"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { json, read, root } = require("./helpers");

const langs = fs.readdirSync(path.join(root, "_locales"));
const en = json("_locales/en/messages.json");

for (const lang of langs.filter((l) => l !== "en")) {
  test(`${lang}: same keys as en`, () => {
    const keys = Object.keys(json(`_locales/${lang}/messages.json`));
    assert.deepEqual(Object.keys(en).filter((k) => !keys.includes(k)), [], "missing in " + lang);
    assert.deepEqual(keys.filter((k) => !(k in en)), [], "extra in " + lang);
  });
}

test("every i18n key used by the options page exists in en", () => {
  const used = new Set([
    ...[...read("options/options.html").matchAll(/(?:data-i18n|title-i18n)="([^"]+)"/g)].map((m) => m[1]),
    ...[...read("options/options.js").matchAll(/getMessage\(\s*"([^"]+)"/g)].map((m) => m[1]),
    ...[...read("options/options.js").matchAll(/showStatus\(\s*"([^"]+)"/g)].map((m) => m[1]),
  ]);
  const missing = [...used].filter((k) => !(k in en));
  assert.deepEqual(missing, []);
});

test("appName is the same in every locale (rename regression, 1.9.1)", () => {
  for (const lang of langs) {
    assert.equal(json(`_locales/${lang}/messages.json`).appName.message, "Privacy Translator for Thunderbird", lang);
  }
});

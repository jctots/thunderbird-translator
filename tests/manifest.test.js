"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { json, read, root } = require("./helpers");
const { packagedFiles } = require("../scripts/files");

const manifest = json("manifest.json");

function referencedFiles(m) {
  const files = [];
  for (const k of ["message_display_action", "compose_action"]) {
    files.push(...Object.values(m[k]?.default_icon || {}));
  }
  files.push(...Object.values(m.icons || {}));
  files.push(...(m.background?.scripts || []));
  if (m.options_ui?.page) files.push(m.options_ui.page);
  return [...new Set(files)];
}

test("every file the manifest references exists and is packaged", () => {
  const packaged = new Set(packagedFiles());
  for (const f of referencedFiles(manifest)) {
    assert.ok(fs.existsSync(path.join(root, f)), `missing: ${f}`);
    assert.ok(packaged.has(f), `not in the package list: ${f}`);
  }
});

test("content scripts registered in background.js exist and are packaged", () => {
  const packaged = new Set(packagedFiles());
  const registered = [...read("background.js").matchAll(/file:\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(registered.length >= 2);
  for (const f of registered) assert.ok(packaged.has(f), `not packaged: ${f}`);
});

test("host access stays optional (nothing granted at install)", () => {
  assert.ok(!(manifest.permissions || []).some((p) => p.includes("://")));
  assert.deepEqual(manifest.optional_permissions, ["*://*/*"]);
});

test("version has a matching README changelog entry", () => {
  const first = read("README.md").match(/^### v(\d+\.\d+\.\d+)/m);
  assert.equal(first?.[1], manifest.version, "top README changelog entry must equal manifest version");
});

test("gecko id and name are set", () => {
  assert.ok(manifest.browser_specific_settings?.gecko?.id);
  assert.match(manifest.name, / for Thunderbird$/, "trademark policy: NAME for Thunderbird");
});

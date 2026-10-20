"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { read, root } = require("./helpers");
const { packagedFiles } = require("../scripts/files");

test("every packaged file exists", () => {
  for (const f of packagedFiles()) assert.ok(fs.existsSync(path.join(root, f)), `missing: ${f}`);
});

test("nothing that ATN rejected or that is dev-only gets packaged", () => {
  for (const f of packagedFiles()) {
    assert.ok(!/^(_docs|tests|scripts|\.github|node_modules)\//.test(f), f);
    assert.ok(!/\.(md|xpi|zip|png|gif)$/i.test(f), f);
  }
});

test("make_xpi.ps1 names the same files as scripts/files.js", () => {
  const ps = read("make_xpi.ps1");
  const listed = [...ps.matchAll(/^\s*'([^']+)',?\s*$/gm)].map((m) => m[1].replace(/\\/g, "/"));
  const fixed = packagedFiles().filter((f) => !f.startsWith("_locales/"));
  assert.deepEqual(listed.sort(), fixed.sort());
  assert.match(ps, /_locales/);
});

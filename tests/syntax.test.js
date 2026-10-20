"use strict";
const test = require("node:test");
const { execFileSync } = require("child_process");
const path = require("path");
const { packagedFiles, root } = require("../scripts/files");

for (const rel of packagedFiles().filter((f) => f.endsWith(".js"))) {
  test(`${rel} parses`, () => {
    execFileSync(process.execPath, ["--check", path.join(root, rel)]);
  });
}

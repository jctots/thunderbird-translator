"use strict";
// Single list of what goes into the XPI. make_xpi.ps1 must name the same files
// (tests/package.test.js enforces it). _docs/ is deliberately excluded: shipping
// it was rejected in ATN review of 1.8.3.

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

const FIXED = [
  "manifest.json",
  "background.js",
  "content/translator.js",
  "content/composer.js",
  "options/options.html",
  "options/options.js",
  "icons/translate.svg",
];

function walk(dir) {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]
  );
}

function packagedFiles() {
  return [...FIXED, ...walk("_locales").sort()];
}

module.exports = { packagedFiles, FIXED, root };

if (require.main === module) console.log(packagedFiles().join("\n"));

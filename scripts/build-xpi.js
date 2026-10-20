"use strict";
// Builds thunderbird-translator-v<version>.xpi using the system `zip`.
// Windows users can keep using make_xpi.ps1; both package the same files.

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { packagedFiles, root } = require("./files");

const { version } = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const out = path.join(root, `thunderbird-translator-v${version}.xpi`);
fs.rmSync(out, { force: true });
execFileSync("zip", ["-q", "-X", out, ...packagedFiles()], { cwd: root, stdio: "inherit" });
console.log(`Built ${path.basename(out)}`);

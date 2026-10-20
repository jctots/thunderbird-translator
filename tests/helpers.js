"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const json = (rel) => JSON.parse(read(rel));

// A stand-in for the WebExtension globals: any property is a callable that
// returns a resolved promise, so background.js can run its top-level
// registration code without Thunderbird. Pass `overrides` for what a test needs.
function stub() {
  const handler = {
    get(_t, prop) {
      if (prop === "then") return undefined; // never look like a thenable
      return new Proxy(function () {}, handler);
    },
    apply: () => Promise.resolve(undefined),
  };
  return new Proxy(function () {}, handler);
}

// Loads background.js in a sandbox and returns its top-level functions/constants.
function loadBackground({ fetch, storage = {}, permissions = true, author = "" } = {}) {
  const api = stub();
  const messenger = new Proxy(api, {
    get(target, prop) {
      if (prop === "storage") {
        return { local: { get: async (defaults) => ({ ...defaults, ...storage }), set: async () => {} } };
      }
      if (prop === "messageDisplay") {
        return { getDisplayedMessage: async () => ({ author: typeof author === "function" ? author() : author }), onMessageDisplayed: { addListener() {} } };
      }
      if (prop === "permissions") {
        return { contains: async () => permissions, request: async () => permissions };
      }
      return target[prop];
    },
  });
  const sandbox = { messenger, browser: messenger, console: { log() {}, warn() {}, error() {} }, fetch, URL, URLSearchParams, setTimeout, clearTimeout };
  vm.createContext(sandbox);
  vm.runInContext(
    read("background.js") +
      `\n;globalThis.__t = { normalizeOllamaUrl, originPatternFromUrl, serviceOrigin, extractPlainTextFromParts,
        translateWithGoogle, translateWithLibreTranslate, translateWithOllama, translateText, detectWithOllama,
        serviceNeedsSetup, getSenderAddress, LANGUAGES, LANGUAGE_NAMES, DEFAULT_SERVICE };`,
    sandbox
  );
  return { t: sandbox.__t, sandbox, messenger };
}

module.exports = { root, read, json, loadBackground };

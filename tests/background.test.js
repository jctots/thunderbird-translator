"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadBackground } = require("./helpers");

const jsonResponse = (body, ok = true, status = 200) => ({
  ok, status, statusText: "", json: async () => body, text: async () => JSON.stringify(body),
});

test("background.js loads with stubbed WebExtension APIs", () => {
  const { t } = loadBackground();
  assert.equal(t.DEFAULT_SERVICE, "disabled", "fresh installs send nothing");
});

test("normalizeOllamaUrl strips trailing slashes and falls back to localhost", () => {
  const { t } = loadBackground();
  assert.equal(t.normalizeOllamaUrl("http://h:11434///"), "http://h:11434");
  assert.equal(t.normalizeOllamaUrl(""), "http://localhost:11434");
});

test("originPatternFromUrl drops the port and rejects non-http(s)", () => {
  const { t } = loadBackground();
  assert.equal(t.originPatternFromUrl("http://localhost:11434"), "http://localhost/*");
  assert.equal(t.originPatternFromUrl("https://lt.example.com/translate"), "https://lt.example.com/*");
  assert.equal(t.originPatternFromUrl("file:///etc/passwd"), null);
  assert.equal(t.originPatternFromUrl("not a url"), null);
});

test("serviceOrigin: disabled has no origin", () => {
  const { t } = loadBackground();
  assert.equal(t.serviceOrigin({ service: "disabled" }), null);
  assert.equal(t.serviceOrigin({ service: "google" }), "https://translate.google.com/*");
});

test("translateText refuses to run while disabled (no fetch)", async () => {
  let called = false;
  const { t } = loadBackground({ fetch: async () => { called = true; } });
  await assert.rejects(t.translateText("hi", { service: "disabled" }, null, null), /No translation service/);
  assert.equal(called, false);
});

test("translateText refuses when host access was not granted (no fetch)", async () => {
  let called = false;
  const { t } = loadBackground({ permissions: false, fetch: async () => { called = true; } });
  await assert.rejects(
    t.translateText("hi", { service: "google", googleTargetLang: "en" }, null, null),
    /has not been granted/
  );
  assert.equal(called, false);
});

test("serviceNeedsSetup: true when disabled or not granted, false when ready", async () => {
  assert.equal(await loadBackground().t.serviceNeedsSetup({ service: "disabled" }), true);
  assert.equal(await loadBackground({ permissions: false }).t.serviceNeedsSetup({ service: "google" }), true);
  assert.equal(await loadBackground().t.serviceNeedsSetup({ service: "google" }), false);
});

test("Google: parses segments and returns the detected language", async () => {
  let url;
  const { t } = loadBackground({ fetch: async (u) => { url = u; return jsonResponse([[["Hallo ", "Hello "], ["Welt", "World"]], null, "en"]); } });
  const r = await t.translateWithGoogle("Hello World", "de");
  assert.deepEqual({ ...r }, { translated: "Hallo Welt", detectedLang: "en" });
  assert.match(url, /^https:\/\/translate\.google\.com\//);
  assert.match(url, /tl=de/);
});

test("Google: bad payload and HTTP errors throw", async () => {
  await assert.rejects(loadBackground({ fetch: async () => jsonResponse({}) }).t.translateWithGoogle("x", "en"), /Invalid response/);
  await assert.rejects(loadBackground({ fetch: async () => jsonResponse({}, false, 429) }).t.translateWithGoogle("x", "en"), /429/);
});

test("LibreTranslate: posts to /translate once, sends api_key only when set", async () => {
  const calls = [];
  const { t } = loadBackground({ fetch: async (u, o) => { calls.push([u, JSON.parse(o.body)]); return jsonResponse({ translatedText: " Hi ", detectedLanguage: { language: "de" } }); } });
  const r = await t.translateWithLibreTranslate("Hallo", "en", "https://lt.example.com/", "");
  assert.deepEqual({ ...r }, { translated: "Hi", detectedLang: "de" });
  await t.translateWithLibreTranslate("Hallo", "en", "https://lt.example.com/translate", "KEY");
  assert.equal(calls[0][0], "https://lt.example.com/translate");
  assert.equal(calls[1][0], "https://lt.example.com/translate", "no doubled /translate");
  assert.equal("api_key" in calls[0][1], false);
  assert.equal(calls[1][1].api_key, "KEY");
  assert.equal(calls[0][1].source, "auto");
});

test("LibreTranslate: server error surfaces", async () => {
  const { t } = loadBackground({ fetch: async () => jsonResponse({ error: "x" }, false, 500) });
  await assert.rejects(t.translateWithLibreTranslate("a", "en", "https://x", ""), /LibreTranslate error: 500/);
});

test("Ollama: builds the prompt, escapes the text, sends the bearer key", async () => {
  let req;
  const { t } = loadBackground({ fetch: async (u, o) => { req = [u, o]; return jsonResponse({ response: " Hello <b> \n" }); } });
  const r = await t.translateWithOllama("a <b> & c", {
    model: "m", targetLanguage: "en", sourceLang: "de", ollamaUrl: "http://h:11434/", ollamaApiKey: "K", ollamaTranslatePrompt: "",
  });
  assert.equal(r.translated, "Hello <b>");
  assert.equal(req[0], "http://h:11434/api/generate");
  assert.equal(req[1].headers.Authorization, "Bearer K");
  const body = JSON.parse(req[1].body);
  assert.equal(body.model, "m");
  assert.equal(body.stream, false);
  assert.match(body.prompt, /a &lt;b&gt; &amp; c/);
  assert.match(body.prompt, /Deutsch/);
});

test("Ollama: 404 gives a pull hint", async () => {
  const { t } = loadBackground({ fetch: async () => jsonResponse({}, false, 404) });
  await assert.rejects(t.translateWithOllama("x", { model: "gemma", targetLanguage: "en", ollamaUrl: "http://h" }), /ollama pull gemma/);
});

test("Ollama language detection tolerates chatty replies", async () => {
  const detect = async (response) => {
    const { t } = loadBackground({ fetch: async () => jsonResponse({ response }) });
    return t.detectWithOllama("hallo", { model: "m", ollamaUrl: "http://h" });
  };
  assert.equal(await detect("de"), "de");
  assert.equal(await detect("DE\n"), "de");
  assert.equal(await detect("The language is Deutsch"), "de");
  assert.equal(await detect("Filipino"), "tl");
  await assert.rejects(detect("¯\\_(ツ)_/¯"), /Could not parse/);
});

test("extractPlainTextFromParts finds the first text/plain part", () => {
  const { t } = loadBackground();
  const tree = { contentType: "multipart/alternative", parts: [
    { contentType: "text/html", body: "<p>x</p>" },
    { contentType: "multipart/mixed", parts: [{ contentType: "text/plain", body: "plain" }] },
  ] };
  assert.equal(t.extractPlainTextFromParts(tree), "plain");
  assert.equal(t.extractPlainTextFromParts(null), "");
});

test("getSenderAddress handles 'Name <addr>' and bare addresses, case-insensitively", async () => {
  let current = "";
  const { t } = loadBackground({ author: () => current });
  const call = (a) => { current = a; return t.getSenderAddress(1); };
  assert.equal(await call('"Bob B." <Bob@Example.COM>'), "bob@example.com");
  assert.equal(await call("alice@example.com"), "alice@example.com");
  assert.equal(await call(""), null);
  assert.equal(await t.getSenderAddress(null), null);
});

test("language lists agree: every menu language has a native name", () => {
  const { t } = loadBackground();
  for (const l of t.LANGUAGES) assert.ok(t.LANGUAGE_NAMES[l.value], l.value);
});

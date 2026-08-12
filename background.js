"use strict";

const DEFAULT_OLLAMA_URL = "http://localhost:11434";
const DEFAULT_MODEL = "translategemma";
const DEFAULT_SERVICE = "google";
const DEFAULT_LIBRE_URL = "https://libretranslate.com";

const DEFAULT_TRANSLATE_PROMPT =
`You are a professional {SOURCE_LANG} ({SOURCE_CODE}) to {TARGET_LANG} ({TARGET_CODE}) translator. Your goal is to accurately convey the meaning and nuances of the original {SOURCE_LANG} text while adhering to {TARGET_LANG} grammar, vocabulary, and cultural sensitivities.
Produce only the {TARGET_LANG} translation, without any additional explanations or commentary. Translate the text inside the <text> tags:

<text>{TEXT}</text>`;

const DEFAULT_DETECT_PROMPT =
`Identify the language of the following text. Reply with ONLY the ISO 639-1 two-letter language code.
Examples: "en" for English, "tl" for Filipino/Tagalog, "fr" for French, "de" for German,
"es" for Spanish, "ja" for Japanese, "zh" for Chinese, "ko" for Korean, "ar" for Arabic.
No explanation. Just the two-letter code.

<text>{TEXT}</text>`;

const LANGUAGE_NAMES = {
  en: "English",
  it: "italiano",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  nl: "Nederlands",
  pt: "Português",
  ru: "Русский",
  ja: "日本語",
  zh: "中文",
  ko: "한국어",
  ar: "العربية",
  tr: "Türkçe",
  pl: "Polski",
  tl: "Filipino",
};

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "nl", label: "Nederlands" },
  { value: "de", label: "Deutsch" },
  { value: "fr", label: "Français" },
  { value: "es", label: "Español" },
  { value: "it", label: "Italiano" },
  { value: "pt", label: "Português" },
  { value: "ru", label: "Русский" },
  { value: "ja", label: "日本語" },
  { value: "zh", label: "中文" },
  { value: "ko", label: "한국어" },
  { value: "ar", label: "العربية" },
  { value: "tr", label: "Türkçe" },
  { value: "pl", label: "Polski" },
  { value: "tl", label: "Filipino" },
];

const LANG_STORAGE_KEY = {
  ollama: "ollamaTargetLang",
  google: "googleTargetLang",
  libretranslate: "libreTargetLang",
};

const COMPOSE_LANG_KEY = {
  ollama: "ollamaComposeLang",
  google: "googleComposeLang",
  libretranslate: "libreComposeLang",
};

// --- Settings ---

async function updateReadButtonTitle() {
  const settings = await messenger.storage.local.get({
    service: DEFAULT_SERVICE,
    ollamaTargetLang: "en",
    googleTargetLang: "en",
    libreTargetLang: "en",
  });
  const langKey = LANG_STORAGE_KEY[settings.service] || "googleTargetLang";
  const lang = (settings[langKey] || "en").toUpperCase();
  messenger.messageDisplayAction.setTitle({ title: `Translate (${lang})` });
}

async function updateComposeButtonTitle() {
  const settings = await messenger.storage.local.get({
    service: DEFAULT_SERVICE,
    ollamaComposeLang: "en",
    googleComposeLang: "en",
    libreComposeLang: "en",
  });
  const langKey = COMPOSE_LANG_KEY[settings.service] || "googleComposeLang";
  const lang = (settings[langKey] || "en").toUpperCase();
  messenger.composeAction.setTitle({ title: `Translate (${lang})` });
}

async function getSettings() {
  return messenger.storage.local.get({
    ollamaUrl: DEFAULT_OLLAMA_URL,
    model: DEFAULT_MODEL,
    detectionModel: "",
    service: DEFAULT_SERVICE,
    ollamaTargetLang: "en",
    googleTargetLang: "en",
    libreTargetLang: "en",
    ollamaComposeLang: "en",
    googleComposeLang: "en",
    libreComposeLang: "en",
    libreUrl: DEFAULT_LIBRE_URL,
    ollamaApiKey: "",
    libreApiKey: "",
    autoTranslate: false,
    neverTranslateLangs: [],
    ollamaTranslatePrompt: "",
    ollamaDetectPrompt: "",
  });
}

// --- Register content scripts ---

if (messenger.messageDisplayScripts) {
  messenger.messageDisplayScripts.register({
    js: [{ file: "content/translator.js" }],
  }).then(() => {
    console.log("[Translator] messageDisplayScripts registered");
  }).catch(e => {
    console.warn("[Translator] messageDisplayScripts.register failed:", e.message);
  });
}

if (messenger.composeScripts) {
  messenger.composeScripts.register({
    js: [{ file: "content/composer.js" }],
  }).then(() => {
    console.log("[Translator] composeScripts registered");
  }).catch(e => {
    console.warn("[Translator] composeScripts.register failed:", e.message);
  });
}

updateReadButtonTitle();
updateComposeButtonTitle();

// --- Detected language cache (tabId → lang code) ---
// Google/LT: populated from translation API responses.
// Ollama: populated by a separate detectWithOllama() call after translation.
// Cleared when a new message is displayed in that tab.

const detectedLangByTab = new Map();

// Tracks tabs where auto-translate is currently running.
// The Never/Always toggle is disabled while translation is in progress.
const translatingTabs = new Set();

messenger.messageDisplay.onMessageDisplayed.addListener((tab) => {
  if (tab?.id != null) {
    detectedLangByTab.delete(tab.id);
    translatingTabs.delete(tab.id);
    messenger.messageDisplayAction.setBadgeText({ tabId: tab.id, text: "" });
  }
});

messenger.tabs.onRemoved.addListener((tabId) => {
  translatingTabs.delete(tabId);
  portMap.delete(tabId);
  detectedLangByTab.delete(tabId);
});

// --- Port management ---

const portMap        = new Map();
const framePortMap   = new Map();
const composePortMap = new Map();
let lastActivePort   = null;

const pendingPopupRequests = new Map();
let nextPopupReqId = 0;

function sendToTabPort(tabId, command, extra = {}) {
  return new Promise((resolve, reject) => {
    const port = portMap.get(tabId);
    if (!port) { reject(new Error("No content script for this tab")); return; }
    const reqId = nextPopupReqId++;
    const timeoutId = setTimeout(() => {
      pendingPopupRequests.delete(reqId);
      reject(new Error("Content script timeout"));
    }, 30000);
    pendingPopupRequests.set(reqId, { resolve, reject, timeoutId, port });
    port.postMessage({ command, reqId, ...extra });
  });
}

function sendToComposePort(windowId, command, extra = {}) {
  return new Promise((resolve, reject) => {
    const port = composePortMap.get(windowId);
    if (!port) { reject(new Error("No compose content script for this window")); return; }
    const reqId = nextPopupReqId++;
    const timeoutId = setTimeout(() => {
      pendingPopupRequests.delete(reqId);
      reject(new Error("Compose script timeout"));
    }, 30000);
    pendingPopupRequests.set(reqId, { resolve, reject, timeoutId, port });
    port.postMessage({ command, reqId, ...extra });
  });
}

function resolvePending(reqId, result) {
  const pending = pendingPopupRequests.get(reqId);
  if (!pending) return;
  clearTimeout(pending.timeoutId);
  pendingPopupRequests.delete(reqId);
  pending.resolve(result);
}

messenger.runtime.onConnect.addListener((port) => {

  // --- Read-mode content script ---
  if (port.name === "translator") {
    const tabId   = port.sender?.tab?.id ?? null;
    const frameId = port.sender?.frameId ?? 0;
    const fKey    = `${tabId}-${frameId}`;

    if (tabId != null) portMap.set(tabId, port);
    framePortMap.set(fKey, port);
    lastActivePort = port;

    port.onDisconnect.addListener(() => {
      if (tabId != null && portMap.get(tabId) === port) portMap.delete(tabId);
      framePortMap.delete(fKey);
      if (lastActivePort === port) {
        lastActivePort = portMap.size > 0 ? [...portMap.values()].at(-1) : null;
      }
      if (tabId != null) detectedLangByTab.delete(tabId);
      for (const [reqId, pending] of pendingPopupRequests.entries()) {
        if (pending.port === port) {
          clearTimeout(pending.timeoutId);
          pendingPopupRequests.delete(reqId);
          pending.reject(new Error("Content script disconnected"));
        }
      }
    });

    port.onMessage.addListener(async (message) => {

      // Translate API request
      if (message.command === "translate") {
        try {
          const settings = await getSettings();
          const sourceLang = tabId != null ? (detectedLangByTab.get(tabId) || null) : null;
          const { translated, detectedLang } = await translateText(message.text, settings, null, sourceLang);
          // Cache detected lang from translation response (Google / LT)
          if (tabId != null && detectedLang && !detectedLangByTab.has(tabId)) {
            detectedLangByTab.set(tabId, detectedLang);
          }
          port.postMessage({ id: message.id, success: true, translated });
        } catch (e) {
          port.postMessage({ id: message.id, success: false, error: e.message });
        }
        return;
      }

      // Exemption check: called after auto-translate completes.
      // For Ollama: runs detection here (after translation) if neverTranslateLangs is non-empty.
      if (message.command === "checkExemption") {
        try {
          const settings = await getSettings();
          const { neverTranslateLangs = [] } = settings;
          let detectedLang = tabId != null ? (detectedLangByTab.get(tabId) || null) : null;

          // Ollama: no detected lang from translation response — run separate detection now
          if (!detectedLang && neverTranslateLangs.length > 0
              && settings.service === "ollama" && tabId != null) {
            try {
              const msg = await messenger.messageDisplay.getDisplayedMessage(tabId);
              if (msg) {
                const full = await messenger.messages.getFull(msg.id);
                const sample = extractPlainTextFromParts(full).trim().slice(0, 500);
                if (sample) {
                  detectedLang = await detectWithOllama(sample, settings);
                  detectedLangByTab.set(tabId, detectedLang);
                }
              }
            } catch (e) {
              console.warn("[Translator] Ollama detection failed in checkExemption:", e.message);
            }
          }

          const shouldRevert = !!(detectedLang && neverTranslateLangs.includes(detectedLang));
          port.postMessage({ id: message.id, success: true, shouldRevert });
        } catch (e) {
          port.postMessage({ id: message.id, success: false, error: e.message });
        }
        return;
      }

      // Subject translation request
      if (message.command === "getTranslatedSubject") {
        try {
          const msg = await messenger.messageDisplay.getDisplayedMessage(tabId);
          const subject = msg?.subject || "";
          if (!subject) {
            port.postMessage({ id: message.id, success: true, translated: null });
            return;
          }
          const settings = await getSettings();
          const sourceLang = tabId != null ? (detectedLangByTab.get(tabId) || null) : null;
          const { translated } = await translateText(subject, settings, null, sourceLang);
          const SERVICE_LABELS = { ollama: "Ollama", google: "Google Translate", libretranslate: "LibreTranslate" };
          const serviceLabel = SERVICE_LABELS[settings.service] || settings.service;
          const serviceUrl = settings.service === "ollama" ? settings.ollamaUrl
            : settings.service === "libretranslate" ? settings.libreUrl
            : null;
          port.postMessage({ id: message.id, success: true, translated, serviceLabel, serviceUrl });
        } catch (e) {
          port.postMessage({ id: message.id, success: false, error: e.message });
        }
        return;
      }

      if (["translateDone", "revertDone", "stateDone"].includes(message.command)) {
        resolvePending(message.reqId, message);
        return;
      }

      if (message.command === "setBadge") {
        translatingTabs.add(tabId);
        messenger.messageDisplayAction.setBadgeText({ tabId, text: "..." });
        messenger.messageDisplayAction.setBadgeBackgroundColor({ tabId, color: "#f90" });
        return;
      }
      if (message.command === "clearBadge") {
        translatingTabs.delete(tabId);
        if (message.success) {
          messenger.messageDisplayAction.setBadgeText({ tabId, text: "✓" });
          messenger.messageDisplayAction.setBadgeBackgroundColor({ tabId, color: "#1a7f37" });
          setTimeout(() => messenger.messageDisplayAction.setBadgeText({ tabId, text: "" }), 2000);
        } else {
          messenger.messageDisplayAction.setBadgeText({ tabId, text: "!" });
          messenger.messageDisplayAction.setBadgeBackgroundColor({ tabId, color: "#c00" });
        }
        return;
      }
    });
    return;
  }

  // --- Compose content script ---
  if (port.name === "translator-composer") {
    const windowId = port.sender?.tab?.windowId ?? null;
    if (windowId != null) composePortMap.set(windowId, port);

    port.onDisconnect.addListener(() => {
      if (windowId != null) composePortMap.delete(windowId);
      for (const [reqId, pending] of pendingPopupRequests.entries()) {
        if (pending.port === port) {
          clearTimeout(pending.timeoutId);
          pendingPopupRequests.delete(reqId);
          pending.reject(new Error("Compose script disconnected"));
        }
      }
    });

    port.onMessage.addListener(async (message) => {
      if (message.command === "translate") {
        try {
          const settings = await getSettings();
          const composeLangKey = COMPOSE_LANG_KEY[settings.service] || "googleComposeLang";
          const targetLang = settings[composeLangKey] || "en";
          const { translated } = await translateText(message.text, settings, targetLang, null);
          port.postMessage({ id: message.id, success: true, translated });
        } catch (e) {
          port.postMessage({ id: message.id, success: false, error: e.message });
        }
        return;
      }
      if (message.command === "translateSelectionDone") {
        resolvePending(message.reqId, message);
      }
    });
    return;
  }
});

// --- Host permissions ---
// Host access is declared in manifest.json under optional_permissions, not
// permissions, so nothing is granted at install time. The options page requests
// the origin for the active service on save; everything here only checks.

const GOOGLE_ORIGIN = "https://translate.google.com/*";

// Ollama endpoints are built by string concatenation, so a trailing slash in the
// configured URL produces "host//api/tags". LibreTranslate already strips it.
function normalizeOllamaUrl(url) {
  return (url || DEFAULT_OLLAMA_URL).replace(/\/+$/, "");
}

// Match patterns carry no port, so http://localhost:11434 becomes http://localhost/*
function originPatternFromUrl(url) {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== "http:" && protocol !== "https:") return null;
    return `${protocol}//${hostname}/*`;
  } catch {
    return null;
  }
}

function serviceOrigin(settings) {
  switch (settings.service) {
    case "ollama":         return originPatternFromUrl(settings.ollamaUrl);
    case "libretranslate": return originPatternFromUrl(settings.libreUrl);
    case "google":         return GOOGLE_ORIGIN;
    default:               return null;
  }
}

async function assertHostPermission(origin, label) {
  if (!origin) throw new Error(`No valid ${label} server URL is configured. Check Preferences.`);
  if (!await messenger.permissions.contains({ origins: [origin] })) {
    throw new Error(`Access to ${origin} has not been granted. Open Preferences and press Save to grant it.`);
  }
}

// --- Translation APIs ---
// All return { translated: string, detectedLang: string|null }

async function translateWithOllama(text, settings) {
  const { model, targetLanguage, ollamaApiKey, ollamaTranslatePrompt, sourceLang } = settings;
  const ollamaUrl = normalizeOllamaUrl(settings.ollamaUrl);
  const targetLangName = LANGUAGE_NAMES[targetLanguage] || targetLanguage;
  const targetLangCode = (targetLanguage || "").toUpperCase();
  const sourceLangName = sourceLang ? (LANGUAGE_NAMES[sourceLang] || sourceLang.toUpperCase()) : "the source language";
  const sourceLangCode = sourceLang ? sourceLang.toUpperCase() : "auto";

  const promptTemplate = ollamaTranslatePrompt || DEFAULT_TRANSLATE_PROMPT;
  const safeText = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const prompt = promptTemplate
    .replace(/{SOURCE_LANG}/g, sourceLangName)
    .replace(/{SOURCE_CODE}/g, sourceLangCode)
    .replace(/{TARGET_LANG}/g, targetLangName)
    .replace(/{TARGET_CODE}/g, targetLangCode)
    .replace(/{TEXT}/g, safeText)
    .replace(/{targetLanguage}/g, targetLangName)
    .replace(/{text}/g, safeText);

  const headers = { "Content-Type": "application/json" };
  if (ollamaApiKey) headers["Authorization"] = `Bearer ${ollamaApiKey}`;

  const response = await fetch(`${ollamaUrl}/api/generate`, {
    method: "POST",
    headers,
    body: JSON.stringify({ model, prompt, stream: false }),
  });

  if (!response.ok) {
    if (response.status === 404)
      throw new Error(`Ollama model "${model}" not found. Please run: ollama pull ${model}`);
    throw new Error(`Ollama error: ${response.status} ${response.statusText}`);
  }

  const translated = (await response.json()).response.trim();
  return { translated, detectedLang: null }; // Ollama detection is a separate call
}

async function translateWithGoogle(text, targetLanguage) {
  const params = new URLSearchParams({
    client: "gtx", sl: "auto", tl: targetLanguage, dt: "t", q: text,
  });
  const response = await fetch(`https://translate.google.com/translate_a/single?${params}`, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
  });
  if (!response.ok) throw new Error(`Google Translate error: ${response.status}`);
  const data = await response.json();
  if (data?.[0] && Array.isArray(data[0])) {
    const translated = data[0].filter(p => p?.[0]).map(p => p[0]).join("").trim();
    if (translated) return { translated, detectedLang: data[2] || null };
  }
  throw new Error("Invalid response from Google Translate");
}

async function translateWithLibreTranslate(text, targetLanguage, libreUrl, libreApiKey) {
  const base = (libreUrl || DEFAULT_LIBRE_URL).replace(/\/+$/, "");
  const endpoint = base.endsWith("/translate") ? base : base + "/translate";
  const body = { q: text, source: "auto", target: targetLanguage };
  if (libreApiKey) body.api_key = libreApiKey;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`LibreTranslate error: ${response.status} - ${err.substring(0, 100)}`);
  }
  const data = await response.json();
  if (data?.translatedText) {
    return {
      translated: data.translatedText.trim(),
      detectedLang: data.detectedLanguage?.language || null,
    };
  }
  if (data?.error) throw new Error(`LibreTranslate API error: ${data.error}`);
  throw new Error("Invalid response from LibreTranslate");
}

async function translateText(text, settings, targetLangOverride, sourceLang) {
  const { service, ollamaTargetLang, googleTargetLang, libreTargetLang, libreUrl, libreApiKey } = settings;
  const targetLang = targetLangOverride
    || { ollama: ollamaTargetLang, google: googleTargetLang, libretranslate: libreTargetLang }[service]
    || "en";
  await assertHostPermission(serviceOrigin(settings), service);
  switch (service) {
    case "ollama":         return translateWithOllama(text, { ...settings, targetLanguage: targetLang, sourceLang: sourceLang || null });
    case "google":         return translateWithGoogle(text, targetLang);
    case "libretranslate": return translateWithLibreTranslate(text, targetLang, libreUrl, libreApiKey);
    default: throw new Error(`Unknown service: ${service}`);
  }
}

// --- Ollama language detection (separate from translation) ---

async function detectWithOllama(sample, settings) {
  const { ollamaApiKey, detectionModel, model, ollamaDetectPrompt } = settings;
  const ollamaUrl = normalizeOllamaUrl(settings.ollamaUrl);
  const detectModel = (detectionModel || "").trim() || model;
  const promptTemplate = ollamaDetectPrompt || DEFAULT_DETECT_PROMPT;
  const safeSample = sample.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const prompt = promptTemplate.replace(/{text}/g, safeSample).replace(/{TEXT}/g, safeSample);

  await assertHostPermission(originPatternFromUrl(ollamaUrl), "Ollama");

  const headers = { "Content-Type": "application/json" };
  if (ollamaApiKey) headers["Authorization"] = `Bearer ${ollamaApiKey}`;

  const response = await fetch(`${ollamaUrl}/api/generate`, {
    method: "POST",
    headers,
    body: JSON.stringify({ model: detectModel, prompt, stream: false }),
  });
  if (!response.ok) throw new Error(`Ollama detection error: ${response.status}`);

  const raw = (await response.json()).response.trim().toLowerCase();

  // 1. Strict: response starts with a known 2-3 char code
  const strictMatch = raw.match(/^([a-z]{2,3})\b/);
  if (strictMatch && LANGUAGE_NAMES[strictMatch[1]]) return strictMatch[1];

  // 2. Reverse-lookup: model returned a full language name ("English", "Filipino", ...)
  for (const [code, name] of Object.entries(LANGUAGE_NAMES)) {
    if (raw.includes(name.toLowerCase())) return code;
  }

  // 3. Scan for any known code anywhere in the response
  const tokens = raw.match(/\b[a-z]{2,3}\b/g) || [];
  for (const token of tokens) {
    if (LANGUAGE_NAMES[token]) return token;
  }

  throw new Error(`Could not parse language code from Ollama detection: "${raw}"`);
}

// Extract plain text from a MessagePart tree (messenger.messages.getFull response)
function extractPlainTextFromParts(part) {
  if (!part) return "";
  if (part.contentType === "text/plain" && part.body) return part.body;
  if (Array.isArray(part.parts)) {
    for (const p of part.parts) {
      const text = extractPlainTextFromParts(p);
      if (text) return text;
    }
  }
  return "";
}

async function getInstalledModels(ollamaUrl) {
  const url = normalizeOllamaUrl(ollamaUrl);
  await assertHostPermission(originPatternFromUrl(url), "Ollama");
  const response = await fetch(`${url}/api/tags`);
  if (!response.ok) throw new Error(`Ollama error: ${response.status}`);
  return (await response.json()).models.map(m => m.name);
}

// --- Context menu ---

browser.menus.create({
  id: "auto-translate",
  title: "Auto-translate",
  type: "checkbox",
  checked: false,
  contexts: ["message_display_action"],
});

browser.menus.create({
  id: "sep-1",
  type: "separator",
  contexts: ["message_display_action"],
});

browser.menus.create({
  id: "translate-to-read",
  title: "Translate to",
  contexts: ["message_display_action"],
});
for (const lang of LANGUAGES) {
  browser.menus.create({
    id: `read-lang-${lang.value}`,
    parentId: "translate-to-read",
    title: lang.label,
    type: "radio",
    checked: lang.value === "en",
    contexts: ["message_display_action"],
  });
}

browser.menus.create({
  id: "sep-never",
  type: "separator",
  contexts: ["message_display_action"],
});

browser.menus.create({
  id: "never-translate-toggle",
  title: "Never auto-translate",
  type: "normal",
  enabled: false,
  contexts: ["message_display_action"],
});

browser.menus.create({
  id: "translate-to-compose",
  title: "Translate to",
  contexts: ["compose_action"],
});
for (const lang of LANGUAGES) {
  browser.menus.create({
    id: `compose-lang-${lang.value}`,
    parentId: "translate-to-compose",
    title: lang.label,
    type: "radio",
    checked: lang.value === "en",
    contexts: ["compose_action"],
  });
}

browser.menus.onShown.addListener(async (info, tab) => {
  const isRead    = info.contexts.includes("message_display_action");
  const isCompose = info.contexts.includes("compose_action");
  if (!isRead && !isCompose) return;

  const settings = await getSettings();
  const tabId = tab?.id ?? null;

  if (isRead) {
    await browser.menus.update("auto-translate", { checked: settings.autoTranslate });

    const readLangKey    = LANG_STORAGE_KEY[settings.service] || "googleTargetLang";
    const activeReadLang = settings[readLangKey] || "en";
    for (const lang of LANGUAGES) {
      await browser.menus.update(`read-lang-${lang.value}`, { checked: lang.value === activeReadLang });
    }

    if (!settings.autoTranslate) {
      await browser.menus.update("never-translate-toggle", {
        title: "Never auto-translate",
        enabled: false,
      });
    } else if (tabId != null && translatingTabs.has(tabId)) {
      // Translation is currently running — disable toggle until it finishes
      await browser.menus.update("never-translate-toggle", {
        title: "Detecting language…",
        enabled: false,
      });
    } else {
      let detectedLang = tabId != null ? detectedLangByTab.get(tabId) : null;

      // For Ollama: run on-demand detection when cache is empty (e.g. manual translate)
      if (!detectedLang && settings.service === "ollama" && tabId != null) {
        try {
          const msg = await messenger.messageDisplay.getDisplayedMessage(tabId);
          if (msg) {
            const full = await messenger.messages.getFull(msg.id);
            const sample = extractPlainTextFromParts(full).trim().slice(0, 500);
            if (sample) {
              detectedLang = await detectWithOllama(sample, settings);
              detectedLangByTab.set(tabId, detectedLang);
            }
          }
        } catch (e) {
          console.warn("[Translator] Ollama on-demand detection failed in onShown:", e.message);
        }
      }

      if (detectedLang) {
        const langName   = LANGUAGE_NAMES[detectedLang] || detectedLang.toUpperCase();
        const neverLangs = settings.neverTranslateLangs || [];
        const isExcluded = neverLangs.includes(detectedLang);
        await browser.menus.update("never-translate-toggle", {
          title: isExcluded ? `Always auto-translate ${langName}` : `Never auto-translate ${langName}`,
          enabled: true,
        });
      } else {
        await browser.menus.update("never-translate-toggle", {
          title: "Never auto-translate",
          enabled: false,
        });
      }
    }
  }

  if (isCompose) {
    const composeLangKey    = COMPOSE_LANG_KEY[settings.service] || "googleComposeLang";
    const activeComposeLang = settings[composeLangKey] || "en";
    for (const lang of LANGUAGES) {
      await browser.menus.update(`compose-lang-${lang.value}`, { checked: lang.value === activeComposeLang });
    }
  }

  browser.menus.refresh();
});

browser.menus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "auto-translate") {
    await messenger.storage.local.set({ autoTranslate: info.checked });
    return;
  }

  if (info.menuItemId === "never-translate-toggle") {
    const tabId = tab?.id ?? null;
    const detectedLang = tabId != null ? detectedLangByTab.get(tabId) : null;
    if (!detectedLang) return;
    const { neverTranslateLangs = [] } = await messenger.storage.local.get({ neverTranslateLangs: [] });
    const isExcluded = neverTranslateLangs.includes(detectedLang);
    const updated = isExcluded
      ? neverTranslateLangs.filter(l => l !== detectedLang)
      : [...new Set([...neverTranslateLangs, detectedLang])];
    await messenger.storage.local.set({ neverTranslateLangs: updated });
    return;
  }

  const { service } = await messenger.storage.local.get({ service: DEFAULT_SERVICE });
  if (String(info.menuItemId).startsWith("read-lang-")) {
    const lang    = info.menuItemId.replace("read-lang-", "");
    const langKey = LANG_STORAGE_KEY[service] || "googleTargetLang";
    await messenger.storage.local.set({ [langKey]: lang });
    messenger.messageDisplayAction.setTitle({ title: `Translate (${lang.toUpperCase()})` });
    return;
  }
  if (String(info.menuItemId).startsWith("compose-lang-")) {
    const lang    = info.menuItemId.replace("compose-lang-", "");
    const langKey = COMPOSE_LANG_KEY[service] || "googleComposeLang";
    await messenger.storage.local.set({ [langKey]: lang });
    messenger.composeAction.setTitle({ title: `Translate (${lang.toUpperCase()})` });
  }
});

// --- messageDisplayAction toggle ---

messenger.messageDisplayAction.onClicked.addListener(async (tab) => {
  const tabId = tab.id;
  messenger.messageDisplayAction.setBadgeText({ tabId, text: "..." });
  messenger.messageDisplayAction.setBadgeBackgroundColor({ tabId, color: "#f90" });
  try {
    const state = await sendToTabPort(tabId, "getState");
    if (state.isTranslated) {
      await sendToTabPort(tabId, "doRevert");
      messenger.messageDisplayAction.setBadgeText({ tabId, text: "" });
    } else {
      const settings = await getSettings();
      const targetLang = { ollama: settings.ollamaTargetLang, google: settings.googleTargetLang, libretranslate: settings.libreTargetLang }[settings.service] || "en";
      const result = await sendToTabPort(tabId, "doTranslate", { targetLang });
      if (result.success) {
        messenger.messageDisplayAction.setBadgeText({ tabId, text: "✓" });
        messenger.messageDisplayAction.setBadgeBackgroundColor({ tabId, color: "#1a7f37" });
        setTimeout(() => messenger.messageDisplayAction.setBadgeText({ tabId, text: "" }), 2000);
      } else {
        messenger.messageDisplayAction.setBadgeText({ tabId, text: "!" });
        messenger.messageDisplayAction.setBadgeBackgroundColor({ tabId, color: "#c00" });
      }
    }
  } catch (e) {
    console.error("[Translator] onClicked error:", e.message);
    messenger.messageDisplayAction.setBadgeText({ tabId, text: "!" });
    messenger.messageDisplayAction.setBadgeBackgroundColor({ tabId, color: "#c00" });
  }
});

// --- composeAction ---

messenger.composeAction.onClicked.addListener(async (tab) => {
  const tabId    = tab.id;
  const windowId = tab.windowId;
  messenger.composeAction.setBadgeText({ tabId, text: "..." });
  messenger.composeAction.setBadgeBackgroundColor({ tabId, color: "#f90" });
  try {
    const result = await sendToComposePort(windowId, "doTranslateSelection");
    if (result.success) {
      messenger.composeAction.setBadgeText({ tabId, text: "✓" });
      messenger.composeAction.setBadgeBackgroundColor({ tabId, color: "#1a7f37" });
      setTimeout(() => messenger.composeAction.setBadgeText({ tabId, text: "" }), 2000);
    } else {
      messenger.composeAction.setBadgeText({ tabId, text: "!" });
      messenger.composeAction.setBadgeBackgroundColor({ tabId, color: "#c00" });
    }
  } catch (e) {
    console.error("[Translator] compose onClicked error:", e.message);
    messenger.composeAction.setBadgeText({ tabId, text: "!" });
    messenger.composeAction.setBadgeBackgroundColor({ tabId, color: "#c00" });
  }
});

// --- Message handler (options page) ---

// The listener itself must stay synchronous. An async listener returns a Promise
// for *every* message, including ones it does not handle, so it claims messages
// meant for other listeners and their responses can be dropped.
// https://webextension-api.thunderbird.net/en/mv3/guides/runtimeMessaging.html

async function handleGetModels(message) {
  try {
    const settings = await getSettings();
    return { success: true, models: await getInstalledModels(message.ollamaUrl || settings.ollamaUrl) };
  } catch (e) { return { success: false, error: e.message }; }
}

async function handleTestConnection(message) {
  try {
    return { success: true, models: await getInstalledModels(message.ollamaUrl) };
  } catch (e) { return { success: false, error: e.message }; }
}

async function handleSaveSettings(message) {
  await messenger.storage.local.set({
    ollamaUrl:             message.ollamaUrl,
    model:                 message.model,
    detectionModel:        message.detectionModel,
    ollamaApiKey:          message.ollamaApiKey,
    libreUrl:              message.libreUrl,
    libreApiKey:           message.libreApiKey,
    service:               message.service,
    ollamaTranslatePrompt: message.ollamaTranslatePrompt,
    ollamaDetectPrompt:    message.ollamaDetectPrompt,
  });
  updateReadButtonTitle();
  updateComposeButtonTitle();
  return { success: true };
}

function onOptionsMessage(message) {
  switch (message?.command) {
    case "getModels":      return handleGetModels(message);
    case "testConnection": return handleTestConnection(message);
    case "saveSettings":   return handleSaveSettings(message);
  }
  // Not ours — return undefined so other listeners can respond.
}

messenger.runtime.onMessage.addListener(onOptionsMessage);

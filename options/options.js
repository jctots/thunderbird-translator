"use strict";

// Keep in sync with DEFAULT_TRANSLATE_PROMPT in background.js
const DEFAULT_TRANSLATE_PROMPT =
`You are a professional {SOURCE_LANG} ({SOURCE_CODE}) to {TARGET_LANG} ({TARGET_CODE}) translator. Your goal is to accurately convey the meaning and nuances of the original {SOURCE_LANG} text while adhering to {TARGET_LANG} grammar, vocabulary, and cultural sensitivities.
Produce only the {TARGET_LANG} translation, without any additional explanations or commentary. Please translate the following {SOURCE_LANG} text into {TARGET_LANG}:

{TEXT}`;

// Keep in sync with DEFAULT_DETECT_PROMPT in background.js
const DEFAULT_DETECT_PROMPT =
`Identify the language of the following text. Reply with ONLY the ISO 639-1 two-letter language code.
Examples: "en" for English, "tl" for Filipino/Tagalog, "fr" for French, "de" for German,
"es" for Spanish, "ja" for Japanese, "zh" for Chinese, "ko" for Korean, "ar" for Arabic.
No explanation. Just the two-letter code.

Text: {TEXT}`;

function translatePage() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    el.textContent = browser.i18n.getMessage(key);
  });
  document.querySelectorAll("[title-i18n]").forEach((el) => {
    const key = el.getAttribute("title-i18n");
    el.setAttribute("title", browser.i18n.getMessage(key));
  });
}

// --- Element refs ---
const urlInput                    = document.getElementById("ollamaUrl");
const modelSelect                 = document.getElementById("model");
const detectionModelSelect        = document.getElementById("detectionModel");
const ollamaApiKeyInput           = document.getElementById("ollamaApiKey");
const openAiUrlInput              = document.getElementById("openAiUrl");
const openAiModelSelect           = document.getElementById("openAiModel");
const openAiDetectionModelSelect  = document.getElementById("openAiDetectionModel");
const openAiApiKeyInput           = document.getElementById("openAiApiKey");
const libreUrlInput               = document.getElementById("libreUrl");
const libreApiKeyInput            = document.getElementById("libreApiKey");
const refreshBtn                  = document.getElementById("refreshModels");
const refreshDetectionBtn         = document.getElementById("refreshDetectionModels");
const refreshOpenAiBtn            = document.getElementById("refreshModelsOpenAi");
const refreshOpenAiDetectionBtn   = document.getElementById("refreshDetectionModelsOpenAi");
const testBtn                     = document.getElementById("testConnection");
const testOpenAiBtn               = document.getElementById("testConnectionOpenAi");
const testLibreBtn                = document.getElementById("testLibreConnection");
const saveBtn                     = document.getElementById("save");
const statusDiv                   = document.getElementById("status");
const ollamaTestStatus            = document.getElementById("ollamaTestStatus");
const openAiTestStatus            = document.getElementById("openAiTestStatus");
const libreTestStatus             = document.getElementById("libreTestStatus");
const serviceRadios               = document.querySelectorAll("input[name='service']");
const ollamaTranslatePromptTA     = document.getElementById("ollamaTranslatePrompt");
const ollamaDetectPromptTA        = document.getElementById("ollamaDetectPrompt");
const openAiTranslatePromptTA     = document.getElementById("openAiTranslatePrompt");
const openAiDetectPromptTA        = document.getElementById("openAiDetectPrompt");

// --- Status ---
function showStatus(messageKey, isError, replacements = {}) {
  const message = browser.i18n.getMessage(messageKey, Object.values(replacements));
  statusDiv.textContent = message || messageKey;
  statusDiv.className = "status " + (isError ? "error" : "success");
}

function clearStatus() {
  statusDiv.className = "status";
  statusDiv.textContent = "";
}

// --- Service radio helpers ---
function getSelectedService() {
  for (const r of serviceRadios) {
    if (r.checked) return r.value;
  }
  return "google";
}

function setSelectedService(service) {
  for (const r of serviceRadios) {
    r.checked = (r.value === service);
  }
}

function getUrlRequiredMessage() {
  return browser.i18n.getMessage("serverUrlRequired") || "URL required";
}

// --- Load settings ---
async function loadSettings() {
  const settings = await browser.storage.local.get({
    ollamaUrl: "http://localhost:11434",
    model: "",
    detectionModel: "",
    ollamaApiKey: "",
    libreUrl: "https://libretranslate.com",
    libreApiKey: "",
    openAiUrl: "https://api.openai.com/v1",
    openAiModel: "",
    openAiDetectionModel: "",
    openAiApiKey: "",
    service: "google",
    ollamaTranslatePrompt: "",
    ollamaDetectPrompt: "",
    openAiTranslatePrompt: "",
    openAiDetectPrompt: "",
  });

  urlInput.value = settings.ollamaUrl;
  ollamaApiKeyInput.value = settings.ollamaApiKey;
  libreUrlInput.value = settings.libreUrl;
  libreApiKeyInput.value = settings.libreApiKey;
  openAiUrlInput.value = settings.openAiUrl;
  openAiApiKeyInput.value = settings.openAiApiKey;
  ollamaTranslatePromptTA.value = settings.ollamaTranslatePrompt || DEFAULT_TRANSLATE_PROMPT;
  ollamaDetectPromptTA.value = settings.ollamaDetectPrompt || DEFAULT_DETECT_PROMPT;
  openAiTranslatePromptTA.value = settings.openAiTranslatePrompt || DEFAULT_TRANSLATE_PROMPT;
  openAiDetectPromptTA.value = settings.openAiDetectPrompt || DEFAULT_DETECT_PROMPT;
  setSelectedService(settings.service);

  await loadModels(settings.model);
  await loadDetectionModels(settings.detectionModel);
}

// --- Ollama Models ---
async function loadModels(selectedModel, ollamaUrl) {
  const result = await browser.runtime.sendMessage({ command: "getModels", service: "ollama", url: ollamaUrl });

  modelSelect.innerHTML = "";

  if (!result.success) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = browser.i18n.getMessage("cannotLoadModels");
    modelSelect.appendChild(opt);
    if (selectedModel) {
      const saved = document.createElement("option");
      saved.value = selectedModel;
      saved.textContent = selectedModel + " " + browser.i18n.getMessage("saved");
      saved.selected = true;
      modelSelect.appendChild(saved);
    }
    return;
  }

  if (result.models.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = browser.i18n.getMessage("noModelsFound");
    modelSelect.appendChild(opt);
    return;
  }

  for (const name of result.models) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    if (name === selectedModel) opt.selected = true;
    modelSelect.appendChild(opt);
  }

  if (selectedModel && !result.models.includes(selectedModel)) {
    const saved = document.createElement("option");
    saved.value = selectedModel;
    saved.textContent = selectedModel + " " + browser.i18n.getMessage("notFound");
    saved.selected = true;
    modelSelect.prepend(saved);
  }
}

async function loadDetectionModels(selectedModel, ollamaUrl) {
  const result = await browser.runtime.sendMessage({ command: "getModels", service: "ollama", url: ollamaUrl });

  detectionModelSelect.innerHTML = '<option value="">Same as Translate Model</option>';

  if (!result.success) {
    if (selectedModel) {
      const saved = document.createElement("option");
      saved.value = selectedModel;
      saved.textContent = selectedModel + " " + browser.i18n.getMessage("saved");
      saved.selected = true;
      detectionModelSelect.appendChild(saved);
    }
    return;
  }

  for (const name of result.models) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    if (name === selectedModel) opt.selected = true;
    detectionModelSelect.appendChild(opt);
  }

  if (selectedModel && !result.models.includes(selectedModel) && selectedModel !== "") {
    const saved = document.createElement("option");
    saved.value = selectedModel;
    saved.textContent = selectedModel + " " + browser.i18n.getMessage("notFound");
    saved.selected = true;
    detectionModelSelect.prepend(saved);
  }
}

// --- OpenAI-Compatible Models ---
async function loadOpenAiModels(selectedModel, openAiUrl) {
  const result = await browser.runtime.sendMessage({
    command: "getModels",
    service: "openai",
    url: openAiUrl,
    apiKey: openAiApiKeyInput.value.trim(),
  });

  openAiModelSelect.innerHTML = "";

  if (!result.success) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = browser.i18n.getMessage("cannotLoadModels");
    openAiModelSelect.appendChild(opt);
    if (selectedModel) {
      const saved = document.createElement("option");
      saved.value = selectedModel;
      saved.textContent = selectedModel + " " + browser.i18n.getMessage("saved");
      saved.selected = true;
      openAiModelSelect.appendChild(saved);
    }
    return;
  }

  if (result.models.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = browser.i18n.getMessage("noModelsFound");
    openAiModelSelect.appendChild(opt);
    return;
  }

  for (const name of result.models) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    if (name === selectedModel) opt.selected = true;
    openAiModelSelect.appendChild(opt);
  }

  if (selectedModel && !result.models.includes(selectedModel)) {
    const saved = document.createElement("option");
    saved.value = selectedModel;
    saved.textContent = selectedModel + " " + browser.i18n.getMessage("notFound");
    saved.selected = true;
    openAiModelSelect.prepend(saved);
  }
}

async function loadOpenAiDetectionModels(selectedModel, openAiUrl) {
  const result = await browser.runtime.sendMessage({
    command: "getModels",
    service: "openai",
    url: openAiUrl,
    apiKey: openAiApiKeyInput.value.trim(),
  });

  openAiDetectionModelSelect.innerHTML = '<option value="">Same as Translate Model</option>';

  if (!result.success) {
    if (selectedModel) {
      const saved = document.createElement("option");
      saved.value = selectedModel;
      saved.textContent = selectedModel + " " + browser.i18n.getMessage("saved");
      saved.selected = true;
      openAiDetectionModelSelect.appendChild(saved);
    }
    return;
  }

  for (const name of result.models) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    if (name === selectedModel) opt.selected = true;
    openAiDetectionModelSelect.appendChild(opt);
  }

  if (selectedModel && !result.models.includes(selectedModel) && selectedModel !== "") {
    const saved = document.createElement("option");
    saved.value = selectedModel;
    saved.textContent = selectedModel + " " + browser.i18n.getMessage("notFound");
    saved.selected = true;
    openAiDetectionModelSelect.prepend(saved);
  }
}

refreshBtn.addEventListener("click", async () => {
  clearStatus();
  await loadModels(modelSelect.value, urlInput.value.trim());
  showStatus("modelsRefreshed", false);
});

refreshDetectionBtn.addEventListener("click", async () => {
  clearStatus();
  await loadDetectionModels(detectionModelSelect.value, urlInput.value.trim());
  showStatus("modelsRefreshed", false);
});

function showInlineStatus(el, text, isError) {
  el.textContent = text;
  el.className = "status " + (isError ? "error" : "success");
}

refreshOpenAiBtn.addEventListener("click", async () => {
  clearStatus();
  await loadOpenAiModels(openAiModelSelect.value, openAiUrlInput.value.trim());
  showStatus("modelsRefreshed", false);
});

refreshOpenAiDetectionBtn.addEventListener("click", async () => {
  clearStatus();
  await loadOpenAiDetectionModels(openAiDetectionModelSelect.value, openAiUrlInput.value.trim());
  showStatus("modelsRefreshed", false);
});

testBtn.addEventListener("click", async () => {
  const url = urlInput.value.trim();
  if (!url) {
    showInlineStatus(ollamaTestStatus, getUrlRequiredMessage(), true);
    return;
  }
  const result = await browser.runtime.sendMessage({ command: "testConnection", service: "ollama", url });
  if (result.success) {
    showInlineStatus(ollamaTestStatus, (browser.i18n.getMessage("connectionSuccess", [result.models.length]) || `Connected. ${result.models.length} models available.`), false);
    await loadModels(modelSelect.value, url);
    await loadDetectionModels(detectionModelSelect.value, url);
  } else {
    showInlineStatus(ollamaTestStatus, (browser.i18n.getMessage("connectionFailed", [result.error]) || `Connection failed: ${result.error}`), true);
  }
});

testOpenAiBtn.addEventListener("click", async () => {
  const url = openAiUrlInput.value.trim();
  if (!url) {
    showInlineStatus(openAiTestStatus, getUrlRequiredMessage(), true);
    return;
  }
  const result = await browser.runtime.sendMessage({
    command: "testConnection",
    service: "openai",
    url,
    apiKey: openAiApiKeyInput.value.trim(),
  });
  if (result.success) {
    showInlineStatus(openAiTestStatus, (browser.i18n.getMessage("connectionSuccess", [result.models.length]) || `Connected. ${result.models.length} models available.`), false);
    await loadOpenAiModels(openAiModelSelect.value, url);
    await loadOpenAiDetectionModels(openAiDetectionModelSelect.value, url);
  } else {
    showInlineStatus(openAiTestStatus, (browser.i18n.getMessage("connectionFailed", [result.error]) || `Connection failed: ${result.error}`), true);
  }
});

testLibreBtn.addEventListener("click", async () => {
  const url = libreUrlInput.value.trim();
  if (!url) {
    showInlineStatus(libreTestStatus, getUrlRequiredMessage(), true);
    return;
  }
  try {
    const base = url.replace(/\/+$/, "").replace(/\/translate$/, "");
    const apiKey = libreApiKeyInput.value.trim();
    const endpoint = base + "/languages" + (apiKey ? "?api_key=" + encodeURIComponent(apiKey) : "");
    const resp = await fetch(endpoint);
    if (!resp.ok) throw new Error("HTTP " + resp.status + " " + resp.statusText);
    const langs = await resp.json();
    if (!Array.isArray(langs)) throw new Error("Unexpected response format");
    showInlineStatus(libreTestStatus, "Connected. " + langs.length + " languages available.", false);
  } catch (e) {
    showInlineStatus(libreTestStatus, "Connection failed: " + e.message, true);
  }
});

saveBtn.addEventListener("click", async () => {
  clearStatus();

  const service = getSelectedService();
  const ollamaUrl = urlInput.value.trim();
  const model = modelSelect.value;
  const detectionModel = detectionModelSelect.value;
  const ollamaApiKey = ollamaApiKeyInput.value.trim();
  const libreUrl = libreUrlInput.value.trim();
  const libreApiKey = libreApiKeyInput.value.trim();
  const ollamaTranslatePrompt = ollamaTranslatePromptTA.value.trim();
  const ollamaDetectPrompt = ollamaDetectPromptTA.value.trim();
  const openAiUrl = openAiUrlInput.value.trim();
  const openAiModel = openAiModelSelect.value;
  const openAiDetectionModel = openAiDetectionModelSelect.value;
  const openAiApiKey = openAiApiKeyInput.value.trim();
  const openAiTranslatePrompt = openAiTranslatePromptTA.value.trim();
  const openAiDetectPrompt = openAiDetectPromptTA.value.trim();

  if (service === "ollama" && !ollamaUrl) {
    showStatus("urlRequired", true); return;
  }
  if (service === "ollama" && !model) {
    showStatus("modelRequired", true); return;
  }
  if (service === "openai" && !openAiUrl) {
    showStatus("serverUrlRequired", true); return;
  }
  if (service === "openai" && !openAiModel) {
    showStatus("modelRequired", true); return;
  }
  if (service === "libretranslate" && !libreUrl) {
    showStatus("urlRequired", true); return;
  }

  await browser.runtime.sendMessage({
    command: "saveSettings",
    ollamaUrl, model, detectionModel, ollamaApiKey,
    openAiUrl, openAiModel, openAiDetectionModel, openAiApiKey,
    libreUrl, libreApiKey, service,
    ollamaTranslatePrompt, ollamaDetectPrompt,
    openAiTranslatePrompt, openAiDetectPrompt,
  });

  showStatus("settingsSaved", false);
});

translatePage();
loadSettings();

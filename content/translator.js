"use strict";

(() => {
  if (window.__ollamaTranslatorLoaded) return;
  window.__ollamaTranslatorLoaded = true;

  console.log("[Translator] Content script loaded");

  const SKIP_TAGS = new Set([
    "SCRIPT", "STYLE", "NOSCRIPT", "IFRAME", "OBJECT", "EMBED",
    "SVG", "MATH", "CODE", "TEXTAREA", "INPUT",
  ]);

  const BLOCK_TAGS = new Set([
    "P", "DIV", "TD", "TH", "LI", "H1", "H2", "H3", "H4", "H5", "H6",
    "BLOCKQUOTE", "CAPTION", "DT", "DD", "FIGCAPTION", "ARTICLE", "SECTION",
    "HEADER", "FOOTER", "TR", "PRE",
  ]);

  const MIN_TEXT_LENGTH = 3;

  const nodeMap = new Map();
  let isTranslated = false;
  let isTranslating = false;
  let translationCached = false;
  let cachedLang = null;
  let translatedSubject = null;
  let subjectBar = null;

  // --- Port to background ---

  const port = browser.runtime.connect({ name: "translator" });
  const pendingRequests        = new Map(); // text translate requests
  const subjectPendingRequests = new Map(); // subject translate requests
  const exemptionPendingRequests = new Map(); // exemption check requests
  let nextRequestId = 0;

  port.onMessage.addListener(async (message) => {
    // Exemption check response
    if (message.id != null && exemptionPendingRequests.has(message.id)) {
      const { resolve, reject } = exemptionPendingRequests.get(message.id);
      exemptionPendingRequests.delete(message.id);
      if (message.success) resolve({ shouldRevert: message.shouldRevert });
      else reject(new Error(message.error));
      return;
    }
    // Subject translate response
    if (message.id != null && subjectPendingRequests.has(message.id)) {
      const { resolve, reject } = subjectPendingRequests.get(message.id);
      subjectPendingRequests.delete(message.id);
      if (message.success) resolve({ translated: message.translated, serviceLabel: message.serviceLabel, serviceUrl: message.serviceUrl });
      else reject(new Error(message.error));
      return;
    }
    // Text translate response
    if (message.id != null && pendingRequests.has(message.id)) {
      const { resolve, reject } = pendingRequests.get(message.id);
      pendingRequests.delete(message.id);
      if (message.success) resolve(message.translated);
      else reject(new Error(message.error));
      return;
    }

    // Commands from popup (via background)
    if (message.command === "doTranslate") {
      const result = await startTranslation(message.targetLang || null);
      port.postMessage({ command: "translateDone", reqId: message.reqId, isTranslated, ...result });
      return;
    }
    if (message.command === "doRevert") {
      reloadPage();
      port.postMessage({ command: "revertDone", reqId: message.reqId, isTranslated: false, success: true });
      return;
    }
    if (message.command === "getState") {
      port.postMessage({ command: "stateDone", reqId: message.reqId, isTranslated, success: true });
      return;
    }
  });

  function sendTranslateRequest(text) {
    return new Promise((resolve, reject) => {
      const id = nextRequestId++;
      pendingRequests.set(id, { resolve, reject });
      port.postMessage({ command: "translate", id, text });
    });
  }

  function sendSubjectTranslateRequest() {
    return new Promise((resolve, reject) => {
      const id = nextRequestId++;
      subjectPendingRequests.set(id, { resolve, reject });
      port.postMessage({ command: "getTranslatedSubject", id });
    });
  }

  function sendCheckExemptionRequest() {
    return new Promise((resolve, reject) => {
      const id = nextRequestId++;
      exemptionPendingRequests.set(id, { resolve, reject });
      port.postMessage({ command: "checkExemption", id });
    });
  }

  // --- Subject bar ---

  function createSubjectBarStyle() {
    if (document.getElementById("__translator_subject_bar_style__")) return;
    const style = document.createElement("style");
    style.id = "__translator_subject_bar_style__";
    style.textContent = `
      #__translator_subject_bar__ {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: 9999;
        padding: 5px 12px 6px;
        background: Canvas;
        color: CanvasText;
        border-bottom: 1px solid GrayText;
        box-sizing: border-box;
        color-scheme: light dark;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      #__translator_service_info__ {
        font-size: 11px;
        font-weight: normal;
        color: GrayText;
        margin-bottom: 2px;
      }
      #__translator_subject_text__ {
        font-size: 16px;
        font-weight: 600;
      }
    `;
    document.head.appendChild(style);
  }

  function injectSubjectBar({ translated, serviceLabel, serviceUrl }) {
    removeSubjectBar();
    createSubjectBarStyle();
    const bar = document.createElement("div");
    bar.id = "__translator_subject_bar__";

    const infoLine = document.createElement("div");
    infoLine.id = "__translator_service_info__";
    infoLine.textContent = serviceUrl
      ? `🌐 Translated via ${serviceLabel} (${serviceUrl})`
      : `🌐 Translated via ${serviceLabel}`;

    const subjectLine = document.createElement("div");
    subjectLine.id = "__translator_subject_text__";
    subjectLine.textContent = "📧 " + translated;

    bar.appendChild(infoLine);
    bar.appendChild(subjectLine);
    document.body.insertBefore(bar, document.body.firstChild);
    subjectBar = bar;
    requestAnimationFrame(() => {
      const height = bar.getBoundingClientRect().height || 52;
      document.body.style.setProperty("padding-top", height + "px", "important");
      document.body.style.setProperty("margin-top", "0", "important");
    });
  }

  function removeSubjectBar() {
    const existing = document.getElementById("__translator_subject_bar__");
    if (existing) existing.remove();
    document.body.style.removeProperty("padding-top");
    document.body.style.removeProperty("margin-top");
    subjectBar = null;
  }

  // --- DOM Text Extraction ---

  function getBlockParent(node) {
    let el = node.parentElement;
    while (el && el !== document.body) {
      if (BLOCK_TAGS.has(el.tagName)) return el;
      el = el.parentElement;
    }
    return document.body;
  }

  function isVisible(node) {
    const el = node.parentElement;
    if (!el) return false;
    const style = window.getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden";
  }

  function extractTextBlocks() {
    const blocks = new Map();
    let blockId = 0;

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          let parent = node.parentElement;
          while (parent) {
            if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
            parent = parent.parentElement;
          }
          const text = node.textContent.trim();
          if (text.length < MIN_TEXT_LENGTH) return NodeFilter.FILTER_REJECT;
          if (!isVisible(node)) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      }
    );

    while (walker.nextNode()) {
      const textNode = walker.currentNode;
      const blockParent = getBlockParent(textNode);
      if (!blocks.has(blockParent)) {
        blocks.set(blockParent, { id: blockId++, text: "", nodes: [] });
      }
      const block = blocks.get(blockParent);
      block.nodes.push(textNode);
      const nodeData = nodeMap.get(textNode);
      const textToUse = nodeData?.original ?? textNode.textContent.trim();
      block.text += (block.text ? "\n" : "") + textToUse;
    }

    return Array.from(blocks.values());
  }

  // --- Translation Logic ---

  function applyTranslation(block, translatedText) {
    if (block.nodes.length === 1) {
      const node = block.nodes[0];
      const existing = nodeMap.get(node);
      nodeMap.set(node, {
        original: existing?.original ?? node.textContent,
        translated: translatedText,
      });
      node.textContent = translatedText;
    } else {
      const translatedLines = translatedText.split("\n").filter(l => l.trim().length > 0);
      for (let i = 0; i < block.nodes.length; i++) {
        const node = block.nodes[i];
        const existing = nodeMap.get(node);
        let nodeTranslation;
        if (i < translatedLines.length) {
          nodeTranslation = translatedLines[i];
        } else if (translatedLines.length > 0) {
          nodeTranslation = translatedLines[translatedLines.length - 1];
        } else {
          nodeTranslation = existing?.original ?? node.textContent;
        }
        if (i === block.nodes.length - 1 && translatedLines.length > block.nodes.length) {
          nodeTranslation += "\n" + translatedLines.slice(block.nodes.length).join("\n");
        }
        nodeMap.set(node, {
          original: existing?.original ?? node.textContent,
          translated: nodeTranslation,
        });
        node.textContent = nodeTranslation;
      }
    }
  }

  function isURL(text) {
    return /^https?:\/\/[^\s]+$/.test(text.trim());
  }

  async function translateNodeByNode(block) {
    for (let i = 0; i < block.nodes.length; i++) {
      const node = block.nodes[i];
      const existing = nodeMap.get(node);
      const originalText = existing?.original ?? node.textContent.trim();
      if (node.parentElement?.tagName === "A" || isURL(originalText)) continue;
      if (originalText.length < MIN_TEXT_LENGTH) continue;
      const translatedText = await sendTranslateRequest(originalText);
      nodeMap.set(node, { original: originalText, translated: translatedText });
      node.textContent = translatedText;
    }
  }

  async function translateByBlocks(blocks) {
    const allText = blocks.map(b => b.text).join("\n\n");
    const fullTranslation = await sendTranslateRequest(allText);
    const translatedParts = fullTranslation.split("\n\n");
    for (let i = 0; i < blocks.length; i++) {
      applyTranslation(blocks[i], translatedParts[i]?.trim() || blocks[i].text);
    }
  }

  async function startTranslation(targetLang) {
    if (isTranslating) return { success: false, error: "Translation already in progress" };
    isTranslating = true;
    try {
      // Invalidate cache if language changed
      if (targetLang && targetLang !== cachedLang) {
        translationCached = false;
        translatedSubject = null;
        for (const [node, data] of nodeMap.entries()) {
          nodeMap.set(node, { original: data.original, translated: null });
        }
      }

      // Use cache if available
      if (translationCached && nodeMap.size > 0) {
        for (const [node, data] of nodeMap.entries()) {
          if (document.body.contains(node) && data.translated) {
            node.textContent = data.translated;
          }
        }
        if (translatedSubject) injectSubjectBar(translatedSubject);
        isTranslated = true;
        return { success: true };
      }

      const blocks = extractTextBlocks();
      if (blocks.length === 0) return { success: false, error: "No text to translate" };

      const preBlocks    = blocks.filter(b => b.nodes[0]?.parentElement?.tagName === "PRE");
      const nonPreBlocks = blocks.filter(b => !preBlocks.includes(b));

      // Translate body and subject in parallel
      const bodyPromise = (async () => {
        for (const block of preBlocks) await translateNodeByNode(block);
        if (nonPreBlocks.length > 0) await translateByBlocks(nonPreBlocks);
      })();
      const subjectPromise = sendSubjectTranslateRequest();

      await bodyPromise;
      translatedSubject = await subjectPromise;

      isTranslated = true;
      translationCached = true;
      if (targetLang) cachedLang = targetLang;

      if (translatedSubject?.translated) injectSubjectBar(translatedSubject);

      return { success: true };
    } catch (e) {
      const msg = (e.message.includes("Failed to fetch") || e.message.includes("NetworkError"))
        ? "Server unreachable"
        : e.message;
      return { success: false, error: msg };
    } finally {
      isTranslating = false;
    }
  }

  function reloadPage() {
    removeSubjectBar();
    for (const [node, data] of nodeMap.entries()) {
      try {
        if (document.body.contains(node)) node.textContent = data.original;
      } catch (e) {
        console.error("[Translator] Error restoring node:", e);
      }
    }
    isTranslated = false;
  }

  // Auto-translate on load if setting is enabled
  browser.storage.local.get({ autoTranslate: false, service: "disabled" }).then(async (s) => {
    if (!s.autoTranslate || s.service === "disabled") return;

    port.postMessage({ command: "setBadge" });
    const result = await startTranslation();

    if (result.success) {
      // After translation, check if the detected source language is in the never-translate list.
      // The detected lang is cached in background from the translation API response.
      try {
        const { shouldRevert } = await sendCheckExemptionRequest();
        if (shouldRevert) {
          reloadPage();
          port.postMessage({ command: "clearBadge", success: true });
          return;
        }
      } catch (e) {
        console.warn("[Translator] Exemption check failed, keeping translation:", e.message);
      }
    }

    port.postMessage({ command: "clearBadge", success: result.success, error: result.error });
  });

  console.log("[Translator] Ready");
})();

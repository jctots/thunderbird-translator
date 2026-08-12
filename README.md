# Privacy Translator for Thunderbird
**Privacy-first email translation — Ollama (local/self-hosted), LibreTranslate (self-hosted or public), or Google Translate as a fallback**

> **Fork of [zoott28354/thunderbird-translator](https://github.com/zoott28354/thunderbird-translator)**
> Extended with compose translation, auto-translate, local LibreTranslate support, and a native toolbar UI.

<p align="center">
  <img src="_docs/demo.gif" alt="Privacy Translator for Thunderbird demo">
</p>

## ✨ Features

- 🔒 **Privacy-first** — translate on your own machine or private network; your emails stay under your control
- 🏠 **Ollama** — local or self-hosted; zero external connections, works fully offline
- 🖥️ **LibreTranslate** — self-hosted on your own server, or use a public instance
- 🌐 **Google Translate** — zero-config fallback only; email text is sent to Google's servers. **Not suitable for private or sensitive emails** — use Ollama or LibreTranslate instead
- 🤖 **Supports all Ollama models** — translategemma, Llama, Mistral, and more
- 📨 **Translate received emails** — inline replacement with one-click restore
- ✍️ **Translate while composing** — select text in the compose window and translate it in place
- ⚡ **Auto-translate** — optionally translate every email automatically when opened
- 🌍 **15 target languages** — English, Dutch, German, French, Spanish, Italian, Portuguese, Russian, Japanese, Chinese, Korean, Arabic, Turkish, Polish, Filipino
- 💾 **Persistent settings** — service and language remembered per-service
- 🌐 **Multilingual interface** — 7 UI languages: 🇬🇧 English, 🇮🇹 Italian, 🇩🇪 German, 🇫🇷 French, 🇪🇸 Spanish, 🇵🇹 Portuguese, 🇷🇺 Russian

## 📋 Requirements

- **Thunderbird** 128 or later (ESR and non-ESR)
- **Ollama** — must be installed and running (local machine or private server); see [setup](#ollama-1)
- **LibreTranslate** — must be reachable (local machine, private server, or public instance); see [setup](#libretranslate-1)

## 📦 Installation

### From XPI file
1. Download `thunderbird-translator.xpi` from [Releases](../../releases)
2. In Thunderbird: **Menu → Tools → Add-ons**
3. Click the gear icon ⚙️ → **Install Add-on from file…**
4. Select the `.xpi` file and confirm

### Development / temporary load
1. In Thunderbird: **Ctrl+Shift+A → gear icon → Debug Add-ons**
2. Click **Load Temporary Add-on…**
3. Select `manifest.json` from the project folder

## ⚙️ Configuration

> **Default service is Google Translate.** On a fresh install, email text is sent to Google's servers until you configure Ollama or LibreTranslate. If you are translating private or sensitive emails, set up one of those services first and switch the active service in Preferences.

Open **Menu → Tools → Add-ons → Privacy Translator for Thunderbird → Preferences**.

<p align="center">
  <img src="_docs/options.png" alt="Options page">
</p>

### Ollama

| Field | Default | Notes |
|---|---|---|
| Server URL | `http://localhost:11434` | Change if Ollama runs on another machine |
| Model | — | Select from installed models; click ↻ to refresh |
| API Key | *(blank)* | Required only if Ollama is behind an auth proxy |

**Test Connection** — verifies reachability and lists available models.

#### Setup

**Local machine** — install from [ollama.ai](https://ollama.ai), then pull a model:
```
ollama pull translategemma
```

**Private server** — see the [Ollama Docker documentation](https://hub.docker.com/r/ollama/ollama).

### LibreTranslate

| Field | Default | Notes |
|---|---|---|
| Server URL | `https://libretranslate.com` | Replace with your own instance URL |
| API Key | *(blank)* | Required by some instances; leave blank for open ones |

**Test Connection** — calls `/languages` on the configured URL to verify reachability.

#### Setup

**Self-hosted** — see [LibreTranslate on GitHub](https://github.com/LibreTranslate/LibreTranslate) for installation options (local or server).

**Public instances** — use `https://libretranslate.com` or any other public instance. Some require an API key.

## 🎯 How to Use

### Reading emails

A **Translate** button appears in the message toolbar (next to Reply, Forward, etc.).

1. Open an email
2. **Right-click** the Translate button to select your target language (once set, it is remembered per service)
3. **Click** the Translate button — the email body is replaced inline
4. Click again to restore the original

#### Auto-translate
Enable **Auto-translate** via the right-click context menu to translate every email automatically when opened. A badge on the toolbar button shows progress:

<p align="center">
  <img src="_docs/loading.png" alt="Translating…">&nbsp;&nbsp;
  <img src="_docs/success.png" alt="Done">&nbsp;&nbsp;
  <img src="_docs/fail.png" alt="Error">
</p>

### Composing emails

A **Translate** button appears in the compose toolbar.

1. Write or paste text in the compose body
2. **Select** the text you want to translate
3. **Right-click** the Translate button to set the target language if needed
4. **Click** the Translate button — selected text is replaced in place (undo works)

## 🔒 Security

| Mode | Data sent externally |
|---|---|
| Ollama (local) | Nothing — 100% on your machine |
| Ollama (self-hosted) | Nothing — stays on your private network |
| LibreTranslate (self-hosted) | Nothing — stays on your private network |
| LibreTranslate (public) | Email text only, to the configured instance |
| Google Translate | Email text only, to Google servers |

No tracking, no analytics. API keys and settings are stored locally in Thunderbird's own storage — never transmitted.

### Permissions

Granted at install:

- `messagesRead` — reads email content for translation
- `messagesModify` — replaces displayed text with translation
- `compose` — injects translation script into compose windows
- `storage` — saves your settings locally
- `menus` — adds the right-click language and auto-translate menu

Requested on demand, never at install:

- `*://*/*` — declared as an *optional* permission because Ollama and LibreTranslate URLs are user-configurable and cannot be known in advance. Thunderbird asks you to approve a single host the first time you press **Save** or **Test Connection** in Preferences, and the extension only ever contacts the server you configured. Decline it and translation for that service simply will not run.

## 🔍 Verifying privacy

When using Ollama or LibreTranslate, you can confirm no email text leaves your network:

1. In Thunderbird, right-click the toolbar and open **Developer Tools**, or go to **Tools → Developer Tools**
2. Select the **Network** tab
3. Translate an email
4. Inspect the requests — you should see only traffic to your configured URL (e.g. `http://localhost:11434` or your homelab IP); nothing to `google.com` or any external service

The extension's full source is on GitHub. All translation calls are in [`background.js`](background.js) — three `fetch()` call sites: `translateWithOllama()`, `translateWithGoogle()`, and `translateWithLibreTranslate()`, routed by a single `switch` in `translateText()`. There are no background network calls, analytics, or telemetry.

> **Note:** this only applies when Ollama or LibreTranslate is the active service. Google Translate always contacts Google's servers — see the [Security](#-security) table.

## 🚨 Troubleshooting

### "Error: Ollama error: 403 Forbidden"
Some Ollama versions or configurations block requests from browser extensions. Set `OLLAMA_ORIGINS=moz-extension://*` before starting Ollama and restart it.

### "Ollama model not found"
Run `ollama pull translategemma` (or whichever model is selected in settings).

### LibreTranslate: connection fails
- Verify the URL in settings matches your instance (e.g. `http://192.168.1.10:5000`)
- If your instance requires an API key, enter it in the API Key field
- Click **Test Connection** to confirm reachability before translating

### Compose: "No text selected"
Highlight text in the compose body *before* clicking the Translate button in the popup.

## 📜 Changelog

### v1.9.0 (fork — jctots)
- **Renamed to "Privacy Translator for Thunderbird"** — Mozilla's trademark policy allows "Thunderbird" in an add-on name only in the form `NAME for Thunderbird`
- **Host access is now an optional permission** — `*://*/*` moved from `permissions` to `optional_permissions`, so nothing is granted at install. Thunderbird asks you to approve a single host the first time you press Save or Test Connection, and translation reports a clear error if access was declined
- **`tabs` permission dropped** — the only tabs API in use is `tabs.onRemoved`, which does not require it; one less item on the install prompt
- **`runtime.onMessage` listener made synchronous** — an async listener returns a Promise for every message including ones it does not handle, which can swallow responses belonging to other listeners
- **XPI no longer ships `_docs/`** — README and listing screenshots were being packaged into the add-on, taking the download from 2.6 MB to 28 KB

### v1.8.3 (fork — jctots)
- **Prompt injection mitigation** — Ollama translate and detect prompts now XML-escape email content before substitution; default prompts wrap the text in `<text>` tags to separate instruction from data
- **Badge lifecycle fix** — `...` badge now correctly cleared when navigating to a new email before translation completes
- **Race condition guard** — concurrent translate calls (double-click, rapid button press) are now blocked until the current translation finishes
- **Port cleanup** — pending requests reject immediately on content script disconnect instead of waiting for the 30-second timeout

### v1.8.2 (fork — jctots)
- **Never/Always auto-translate toggle** — context menu item shows the detected source language and lets you toggle it into the exemption list; updates dynamically per email; shows "Detecting language…" while translation is in progress
- **Language exemptions for auto-translate** — emails in excluded languages are translated first, source language is detected, then the translation is silently reverted if the language is on the never-translate list
- **Separate detection model** — Ollama uses a dedicated detection model and prompt (defaults to the translation model); configurable separately in Options
- **Custom translation and detection prompts** — both prompts are editable in the Advanced section of Options; support `{TEXT}`, `{TARGET_LANG}`, `{TARGET_CODE}`, `{SOURCE_LANG}`, `{SOURCE_CODE}` variables; clear to restore built-in defaults
- **Translate Model / Detection Model labels** — renamed "Model" field to "Translate Model" to distinguish from the new Detection Model field
- **Toggle disabled during translation** — Never/Always auto-translate button is grayed out while auto-translate is running; re-enables once detection is complete

### v1.8.1 (fork — jctots)
- Per-service language menus (read and compose independently)
- Translation cache invalidated when target language changes
- Inline status messages on Options page (replaces alert popups)
- Dead popup code removed

### v1.8.0 (fork — jctots)
- Right-click context menu on toolbar button (read and compose)
- Direct toggle UX — translate/restore without a popup
- Per-service target language — each service remembers its own language choice
- SVG icons (dark and light variants)
- Target language shown in toolbar button title

### v1.7.1 (fork — jctots)
- **Translated subject bar** — sticky bar at the top of the email body showing the translated subject; respects dark mode; removed on revert

### v1.7.0 (fork — jctots)
- **Compose translation** — select text in compose window and translate in place
- **Native toolbar UI** — action buttons in read and compose toolbars replace injected toolbar
- **Auto-translate** — optional per-email auto-translation with badge progress indicator
- **Self-hosted LibreTranslate** — configurable URL + optional API key; test connection button
- **Ollama API key** support for proxied/remote instances

### v1.6.0 (fork — jctots)
- **Injected toolbar** in message view — service selector, language selector, Translate/Restore buttons
- **Dark mode** support
- Source language detection and translation cache
- Dynamic Ollama URL; service dropdown in toolbar
- Simplified options page; fork authorship

### v1.5.0 (zoott28354)
- Deterministic tab/preview routing
- `messageDisplayScripts` programmatic registration (Thunderbird 128–147+)

### v1.0.0 (zoott28354)
- Initial release: Ollama, Google Translate, LibreTranslate; context menu UI; 7 UI locales

## 📝 License

MIT — free to use, modify, and distribute.
Original work by [zoott28354](https://github.com/zoott28354/thunderbird-translator).

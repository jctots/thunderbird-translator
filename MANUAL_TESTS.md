# Manual test plan

`npm test` covers the logic that can run without Thunderbird. This plan covers the rest: menus,
content-script injection and the Preferences page. Run the sections that touch what you changed;
run all of it before a release.

## Setup

1. `npm run build` → `thunderbird-translator-v<version>.xpi`.
2. Thunderbird → Tools → Add-ons → ⚙ → Install Add-on From File. (Don't use "Load Temporary Add-on" on `manifest.json`; it fails in sandboxed installs because `_locales` isn't reachable.)
3. Open the console: Tools → Developer Tools → Debug Add-ons → Inspect. Watch it for errors during every step.
4. Have ready: one German or French email, one English email, two emails from different senders, a LibreTranslate instance (it reports the source language) and, for the Ollama steps, an Ollama server with a translation model.
5. Optional: Developer Tools → Network, to confirm what is (not) sent.

Before blaming the add-on for a failed translation, open the failing request in the Network tab (Inspect console → Network). An HTTP 4xx/5xx from your own server (for example 500 from LibreTranslate when a language model isn't loaded) is a server problem; the Response tab says why. Check the compose language too: reading and composing keep separate target languages.

Mark each step pass/fail. A failure is a bug unless it is listed under *Known limits*.

## A. Regression (nothing broken)
1. Upgrade from the previous release with a service saved: Preferences keeps the service, URLs and models.
2. Click Translate on a foreign email → body and subject bar translate; click again → original restored.
3. Right-click the button → *Translate to* → another language → click Translate → new language, button title shows it.
4. Compose: select text, click Translate → replaced in place; Ctrl+Z undoes it.
5. Service = Disabled: clicking Translate opens Preferences and sends no network traffic.

## B. Preferences
1. The Ollama and LibreTranslate API key fields are masked.
2. Enter a key, Save, reopen Preferences → still populated; Test Connection works with it.
3. The "Privacy: what is sent where" section expands and collapses, and its text matches `PRIVACY.md`.
4. The `PRIVACY.md` link in it opens the file on GitHub.
5. Save with a service chosen → Thunderbird asks for access to that one host; declining shows a clear error.

## C. Source language in the subject bar
1. LibreTranslate, German email → "🌐 Translated from German via LibreTranslate (url)".
2. Google, same email → "from German via Google Translate".
3. Ollama → no "from …" (expected).
4. Revert, then translate again (cache path) → "from German" still shown.
5. Change the target language and translate again → still correct.

## D. Translate selection
1. Select one sentence in a foreign email, right-click → *Translate selection* is offered.
2. Click it → bottom panel "Selection translated from … to … via …" with the text.
3. Esc and ✕ both close it; the message body is unchanged.
4. No selection → item not offered. Selection in a compose window → item not offered.
5. Service Disabled → opens Preferences. Server unreachable → red "Translation failed: …" in the panel.
6. Selection inside an already translated message → translates the visible text, no error.
7. Network tab: one request, to the configured server.

## E. Never auto-translate (language and sender)
1. Auto-translate off: the sender item in the button's right-click menu is greyed out.
2. Auto-translate on; open an email from sender A → translated automatically.
3. Right-click → "Never auto-translate a@x.com" → click. Reopen that email → not translated, no request in the Network tab.
4. A manual Translate click for sender A still works.
5. An email from sender B still auto-translates.
6. "Always auto-translate a@x.com" → click → auto-translate resumes for A.
7. "Name <addr>" and bare author formats both work; letter case doesn't matter.
8. The per-language "Never auto-translate <language>" item still works alongside it.

## F. Install and upgrade
1. Fresh profile → service is Disabled.
2. Profile that never saved a service, upgraded → Google (so existing users keep working).

## Known limits (not bugs)
- Source language is shown only when the service reports it (Google, LibreTranslate).
- Sender exclusion matches the exact address, not the domain.
- The checked language in the *Translate to* radio menus sits slightly left of the others on GNOME; this is native rendering.

## Found something the plan missed?
Add the step that would have caught it to the right section, in the same PR as the fix.

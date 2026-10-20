## What and why

<!-- What does this change, and what problem does it solve? Link the issue: Fixes #123 -->

## Checklist

- [ ] `npm test` passes
- [ ] I ran the relevant sections of `MANUAL_TESTS.md` in Thunderbird (built `.xpi`) — say which below
- [ ] New user-visible text is in `_locales/en/messages.json` (other locales may follow)
- [ ] If this changes **what data is sent, or to where**: `PRIVACY.md` and the Preferences privacy text are updated, and the allowlist in `tests/network.test.js` is deliberate
- [ ] If this adds a file that must ship: `scripts/files.js` and `make_xpi.ps1` both list it
- [ ] README changelog entry added (version bumps are done by the maintainer)

## How I tested

<!-- Thunderbird version, OS, which service (Ollama / LibreTranslate / Google), steps -->

# Contributing

Thanks for helping. This is a small Thunderbird WebExtension with no runtime dependencies, so setup is short.

## Principles

1. **Privacy first.** Message text goes only to the service the user selected, and only when they translate. Anything that sends data elsewhere, adds telemetry, or loads remote code will not be merged. `tests/network.test.js` fails on new hosts or `fetch()` calls on purpose; if you change what is sent, update `PRIVACY.md` and the Preferences privacy text in the same PR.
2. **ATN-compatible.** The add-on is reviewed by the Thunderbird add-on team. No remote code, no `eval`, no unneeded permissions, and nothing packaged that is not used (the `_docs/` folder is deliberately left out of the XPI).
3. **Don't override the host.** Only fix what the add-on itself causes; don't restyle Thunderbird or the email.

## Layout

| Path | What |
|---|---|
| `background.js` | Translation services, menus, ports to the content scripts |
| `content/translator.js` | Runs in each opened message: DOM extraction, subject bar, selection panel |
| `content/composer.js` | Runs in the compose window |
| `options/` | Preferences page |
| `_locales/` | UI strings; `en` is the source of truth |
| `scripts/files.js` | The list of files that ship in the XPI |
| `tests/` | Automated checks, see below |

## Setup

Requires Node 22+ and, for building, the `zip` command. There is nothing to `npm install`.

```bash
git clone https://github.com/jctots/thunderbird-translator.git
cd thunderbird-translator
npm test
```

## Running the tests

```bash
npm test
```

It runs in a few seconds, needs no Thunderbird and no network, and also runs on every push and pull request via GitHub Actions. What it covers:

| File | Checks |
|---|---|
| `syntax.test.js` | Every shipped JS file parses |
| `manifest.test.js` | Manifest references exist and are packaged; host access stays optional; the version has a README changelog entry |
| `locales.test.js` | All locales have the same keys as `en`; every i18n key the Preferences page uses exists |
| `package.test.js` | The XPI file list is consistent with `make_xpi.ps1` and excludes docs/tests |
| `network.test.js` | Network call sites and hardcoded hosts are exactly the known, documented ones |
| `background.test.js` | The translation services, URL handling, permission gating, language detection and sender parsing, run against a stubbed WebExtension API and fake `fetch` |

To run one file: `node --test tests/background.test.js`.

Behaviour that needs real Thunderbird (menus, content-script injection, the Preferences page) is covered by the checklist in [MANUAL_TESTS.md](MANUAL_TESTS.md), which also explains how to build and install the XPI. Run the sections that touch your change before opening a PR, and say what you ran in the PR description.

## Adding a test

Pure or service-level logic belongs in `tests/background.test.js`. `tests/helpers.js` loads `background.js` into a sandbox with a fake `messenger`/`browser` and exposes the functions listed at the bottom of `loadBackground()`. To test another function, add its name there. Pass a fake `fetch` to assert on the exact request and response handling. When you fix a bug, add the test that would have caught it.

## Pull requests

- Branch from `main`, keep a PR to one change, and fill in the PR template.
- Run `npm test` first; CI will run it again.
- If you found a bug that the manual plan missed, add the step that would have caught it to `MANUAL_TESTS.md`. Add a README changelog entry under the next version. The maintainer bumps `manifest.json` and `package.json` when releasing.
- New UI text goes in `_locales/en/messages.json`. Translations are welcome but not required; missing keys in other locales fail `npm test`, so copy the English text if you can't translate.
- Don't reformat unrelated code.

## Reporting bugs

Use the issue templates. Never paste email content, API keys or private server addresses.

## Releasing (maintainer)

1. Bump the version in `manifest.json` and `package.json`; add the README changelog entry.
2. `npm test && npm run build`.
3. Tag `v<version>`, create the GitHub release with the XPI, and submit it to addons.thunderbird.net.

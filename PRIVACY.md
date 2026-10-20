# Privacy Policy — Privacy Translator for Thunderbird

This policy covers the add-on only. Last updated for v1.9.3.

## What the add-on does with your data

- **Message text.** When you translate a message (the toolbar button, or automatically if you turned on auto-translate), the add-on reads that message's visible text and its subject and sends them to the translation service you selected. With auto-translate on, this happens for every message you open (except senders and languages you excluded). The text of a selection you choose to translate, in a message or in the compose window, is sent the same way.
- **Language detection.** With Ollama, a sample of up to 500 characters of a message may be sent to your Ollama server to detect its language, only if you use the Never/Always auto-translate feature.
- **Nothing else.** Attachments, addresses, headers other than the subject, and your contacts are not sent. The sender's address is read locally only to apply your "never auto-translate this sender" list.

## Where the data goes

Only to the one service selected in Preferences. With **Disabled** (the default on a new install), nothing is sent anywhere.

| Service | Receives | Operated by |
|---|---|---|
| Ollama | message text, and your API key if you set one | you, at the URL you entered |
| LibreTranslate | message text, and your API key if you set one | you at the URL you entered; if you use the public server (libretranslate.com, the prefilled URL), its operator |
| Google Translate | message text | Google, via translate.google.com |

The add-on has no server of its own and sends nothing to its developer. There is no analytics, telemetry, advertising or crash reporting. Operators of the service you choose see the text, your IP address and normal request metadata, and handle them under their own policies (for Google and libretranslate.com, that means a third party receives your email text). If you need email text to stay on your own network, choose Ollama or a self-hosted LibreTranslate.

## What is stored

Settings (service, URLs, selected models, target languages, custom prompts, the language and sender exclusion lists, and any API keys you enter) are kept in Thunderbird's local extension storage in your profile. API keys are stored unencrypted there. They are sent only to the service they belong to. Translations are cached in memory while a message is open and are not written to disk.

## Disclosure to websites

The add-on does not load web pages and does not add content to messages that a remote site could observe, so it does not make its presence known to websites. The only network requests it makes are the translation requests above and the "Test Connection"/model-list requests to your configured server.

## Permissions

Host access is optional and requested for the single host of the service you save. See the README for the full permission list.

## Contact

https://github.com/jctots/thunderbird-translator/issues

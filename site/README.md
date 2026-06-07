# Static Site

This folder is the static proofmark.dev deploy surface.

Use it for:

- public landing-page HTML and CSS
- static product images used by the landing page
- durable review screenshots under `assets/screenshots/`

Do not use it for internal strategy, customer discovery notes, pricing drafts,
or stakeholder decks. Those belong in the Proofmark vault.

## Local Preview

```sh
cd site
python3 -m http.server 4173 --bind 127.0.0.1
```

Then open `http://127.0.0.1:4173/`.

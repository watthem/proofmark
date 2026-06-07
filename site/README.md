# Static Site

This folder is the static proofmark.dev deploy surface.

Use it for:

- public landing-page HTML and CSS
- generated VitePress docs under `docs/`
- static product images used by the landing page
- durable review screenshots under `assets/screenshots/`

`site/docs/` is generated output, but it is intentionally checked in because the
current Cloudflare deploy serves `site/` directly and does not run a build step.
After editing source docs in `../docs`, run `npm run docs:build` from the repo
root and commit the generated `site/docs/` changes.

Do not use this folder for internal strategy, customer discovery notes, pricing
drafts, or private stakeholder decks. Those belong in the Proofmark vault.

## Local Preview

```sh
cd site
python3 -m http.server 4173 --bind 127.0.0.1
```

Then open `http://127.0.0.1:4173/`.

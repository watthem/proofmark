# Deploying `proofmark.dev`

This repo serves the static marketing site from `site/`.

Deploys are **Git-based** — push to `main` and Cloudflare builds and deploys automatically via the unified Workers & Pages platform.

## How it works

The repo contains a `wrangler.toml` that configures the Worker to serve `site/` as static assets. On each push, Cloudflare runs `npx wrangler deploy`, which reads that config and publishes the site.

## Prerequisites

1. Cloudflare Worker project `proofmark-site` exists under **Workers & Pages**
2. The project is **connected to the GitHub repo** `watthem/proofmark`
3. Custom domain `proofmark.dev` is attached to the Worker

### Build configuration (in Cloudflare dashboard)

| Setting | Value |
|---|---|
| Build command | *(leave blank)* |
| Deploy command | `npx wrangler deploy` |
| Non-production branch deploy command | `npx wrangler deploy` |
| Path | `site` |
| Production branch | `main` |

### `wrangler.toml` (in repo root)

```toml
name = "proofmark-site"
compatibility_date = "2026-02-21"

[assets]
directory = "./site"
```

## Setup (one-time)

1. Go to **Cloudflare Dashboard > Workers & Pages > Create**
2. Connect to Git and authorize the Cloudflare GitHub App for the `watthem` account
3. Select the `proofmark` repository
4. Set build configuration per the table above
5. Attach custom domain `proofmark.dev` to the Worker project

**Permissions**: The GitHub App needs read access to the `proofmark` repo. Grant access to selected repositories only (not all repos).

> If a previous project already claims `proofmark.dev`, delete it or disconnect the custom domain first — Cloudflare won't let two projects share a domain.

## Deploy

Push to `main`:

```bash
git push origin main
```

Cloudflare picks up the commit and deploys automatically.

Branch pushes create preview deployments at `<branch>.proofmark-site.matchstick.workers.dev`.

## Verify

1. Open:
   - `https://proofmark.dev`
   - `https://proofmark-site.matchstick.workers.dev` (workers.dev fallback)

2. Confirm page content is the Proofmark marketing site (not Cloudflare hello world).

3. If needed, inspect headers:

```bash
curl -I https://proofmark.dev
```

## Troubleshooting "Hello World"

If `proofmark.dev` still shows a hello world page:

1. Check **Workers routes**: remove any Worker route on `proofmark.dev/*` that may conflict.
2. Check **Build configuration**: ensure deploy command is `npx wrangler deploy` (not `echo "required"`).
3. Check **`wrangler.toml`**: `[assets] directory` must be `"./site"` and `name` must match the project.
4. Check **Custom domain mapping**: `proofmark.dev` must point to the `proofmark-site` Worker.
5. Verify the **GitHub connection** is active in project settings.
6. Trigger a redeploy from the Cloudflare dashboard or push a new commit.

## Fallback: manual deploy with Wrangler

If Git-based deploys are unavailable, use `deploy.sh` for direct upload:

```bash
export CLOUDFLARE_API_TOKEN=your_token_here
./deploy.sh
```

Optional overrides:

```bash
./deploy.sh --project proofmark --branch main --dir site
```

Token scope: Pages deploy/edit for the account that owns the project. Run `./deploy.sh --help` for details.

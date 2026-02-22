#!/usr/bin/env bash
set -euo pipefail

PROJECT_NAME="${PROJECT_NAME:-proofmark}"
BRANCH="${BRANCH:-main}"
SITE_DIR="${SITE_DIR:-site}"
SKIP_GIT_CHECK="false"

usage() {
  cat <<'USAGE'
Deploy proofmark.dev static site to Cloudflare Pages.

Usage:
  ./deploy.sh [options]

Options:
  --project <name>       Pages project name (default: proofmark)
  --branch <name>        Deploy branch label (default: main)
  --dir <path>           Static output directory (default: site)
  --skip-git-check       Skip dirty working tree warning
  -h, --help             Show this help

Environment:
  CLOUDFLARE_API_TOKEN   Required. API token for Cloudflare Pages deploy.
  PROJECT_NAME           Optional default for --project
  BRANCH                 Optional default for --branch
  SITE_DIR               Optional default for --dir
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project)
      PROJECT_NAME="$2"
      shift 2
      ;;
    --branch)
      BRANCH="$2"
      shift 2
      ;;
    --dir)
      SITE_DIR="$2"
      shift 2
      ;;
    --skip-git-check)
      SKIP_GIT_CHECK="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "Error: CLOUDFLARE_API_TOKEN is not set." >&2
  echo "Create a token with Pages edit permissions and export it before deploy." >&2
  exit 1
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ ! -d "$SITE_DIR" ]]; then
  echo "Error: static directory not found: $SITE_DIR" >&2
  exit 1
fi

if [[ ! -f "$SITE_DIR/index.html" ]]; then
  echo "Error: expected $SITE_DIR/index.html" >&2
  exit 1
fi

if ! command -v npx >/dev/null 2>&1; then
  echo "Error: npx is required but not installed." >&2
  exit 1
fi

if [[ "$SKIP_GIT_CHECK" != "true" ]] && command -v git >/dev/null 2>&1; then
  if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "Warning: working tree has uncommitted changes." >&2
    echo "Deploying anyway. Commit first if you want a fully traceable release." >&2
  fi
fi

echo "Deploying Cloudflare Pages project..."
echo "  project: $PROJECT_NAME"
echo "  branch:  $BRANCH"
echo "  dir:     $SITE_DIR"

npx --yes wrangler pages deploy "$SITE_DIR" \
  --project-name "$PROJECT_NAME" \
  --branch "$BRANCH"

echo "Deploy complete."
echo "Verify: https://$PROJECT_NAME.pages.dev and https://proofmark.dev"

#!/usr/bin/env bash
set -euo pipefail

DEPLOY_TARGET="${DEPLOY_TARGET:-worker}"
PROJECT_NAME="${CF_PROJECT_NAME:-$(basename "$PWD")}"
BUILD_DIR="${BUILD_DIR:-dist}"
BUILD_CMD="${BUILD_CMD:-}"
BRANCH="${CLOUDFLARE_BRANCH:-main}"
SCOPE="${CLOUDFLARE_ACCOUNT_SCOPE:-oss}"
DRY_RUN="false"

usage() {
  cat <<'USAGE'
Deploy repository with Cloudflare tooling.

Usage:
  ./DEPLOY.sh [options]

Options:
  --target <pages|worker>   Deployment target (default: repo preset)
  --project <name>          Pages project name (default: current directory name)
  --dir <path>              Pages build directory (default: dist)
  --build-cmd <command>     Build command before pages deploy
  --branch <name>           Pages branch label (default: main)
  --scope <oss|consulting>  Cloudflare account scope (default: oss)
  --dry-run                 Print commands only
  -h, --help                Show help
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      DEPLOY_TARGET="$2"
      shift 2
      ;;
    --project)
      PROJECT_NAME="$2"
      shift 2
      ;;
    --dir)
      BUILD_DIR="$2"
      shift 2
      ;;
    --build-cmd)
      BUILD_CMD="$2"
      shift 2
      ;;
    --branch)
      BRANCH="$2"
      shift 2
      ;;
    --scope)
      SCOPE="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN="true"
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

resolve_scope() {
  case "$SCOPE" in
    oss)
      export CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN_OSS:-${CLOUDFLARE_API_TOKEN:-}}"
      export CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID_OSS:-${CLOUDFLARE_ACCOUNT_ID:-}}"
      ;;
    consulting)
      export CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN_CONSULTING:-${CLOUDFLARE_API_TOKEN:-}}"
      export CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID_CONSULTING:-${CLOUDFLARE_ACCOUNT_ID:-}}"
      ;;
    *)
      echo "Invalid scope: $SCOPE" >&2
      exit 1
      ;;
  esac
}

run_cmd() {
  if [[ "$DRY_RUN" == "true" ]]; then
    printf '+ '
    printf '%q ' "$@"
    printf '\\n'
  else
    "$@"
  fi
}

if [[ "$DRY_RUN" != "true" ]]; then
  resolve_scope
  if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
    echo "Error: missing Cloudflare API token for scope '$SCOPE'" >&2
    exit 1
  fi
fi

case "$DEPLOY_TARGET" in
  pages)
    if [[ -n "$BUILD_CMD" ]]; then
      if [[ "$DRY_RUN" == "true" ]]; then
        printf '+ %s\\n' "$BUILD_CMD"
      else
        bash -lc "$BUILD_CMD"
      fi
    fi

    if [[ ! -d "$BUILD_DIR" ]]; then
      echo "Error: build directory not found: $BUILD_DIR" >&2
      echo "Hint: pass --build-cmd 'npm run build' and --dir <output>" >&2
      exit 1
    fi

    run_cmd npx --yes wrangler pages deploy "$BUILD_DIR" \\
      --project-name "$PROJECT_NAME" \\
      --branch "$BRANCH" \\
      --commit-dirty=true
    ;;
  worker)
    run_cmd npx --yes wrangler deploy
    ;;
  *)
    echo "Invalid target: $DEPLOY_TARGET (expected pages or worker)" >&2
    exit 1
    ;;
esac

echo "Deployment flow complete."

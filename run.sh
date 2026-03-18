#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

usage() {
  cat <<'EOF'
Usage:
  ./run.sh <test|prod> <command> [args...]

Examples:
  ./run.sh test pnpm agora ask "Hello"
  ./run.sh test pnpm test
  ./run.sh prod pnpm build

Notes:
  - "dev" is accepted as an alias of "test".
  - The script loads .env.test or .env.prod from the repository root.
  - If nvm is installed, the script also switches to the Node version in .nvmrc.
EOF
}

if [ "$#" -lt 2 ]; then
  usage
  exit 1
fi

target_env="$1"
shift

case "$target_env" in
  dev|test)
    env_name="test"
    ;;
  prod)
    env_name="prod"
    ;;
  *)
    echo "Unsupported environment: $target_env" >&2
    usage
    exit 1
    ;;
esac

env_file="$SCRIPT_DIR/.env.$env_name"
nvm_dir="${NVM_DIR:-$HOME/.nvm}"

if [ ! -f "$env_file" ]; then
  echo "Missing environment file: $env_file" >&2
  echo "Create it from $SCRIPT_DIR/.env.$env_name.example first." >&2
  exit 1
fi

if [ -f "$SCRIPT_DIR/.nvmrc" ] && [ -s "$nvm_dir/nvm.sh" ]; then
  # shellcheck disable=SC1090
  . "$nvm_dir/nvm.sh"
  nvm use "$(cat "$SCRIPT_DIR/.nvmrc")" >/dev/null
fi

set -a
. "$env_file"
AGORA_RUNTIME_ENV="$env_name"
set +a

cd "$SCRIPT_DIR"
exec "$@"

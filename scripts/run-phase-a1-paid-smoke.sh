#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
ROOT_DIR="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"

CLI_TEST_USER_ID="${CLI_TEST_USER_ID:-00000000-0000-4000-8000-000000000001}"
PHASE_A1_PAID_ALLOWED_MODELS="${PHASE_A1_PAID_ALLOWED_MODELS:-deepseek/deepseek-chat,qwen/qwen3.5-9b,moonshotai/kimi-k2,z-ai/glm-4.5-air,minimax/minimax-m1}"
PHASE_A1_PAID_DEFAULT_COUNCIL_MODELS="${PHASE_A1_PAID_DEFAULT_COUNCIL_MODELS:-qwen/qwen3.5-9b,z-ai/glm-4.5-air,deepseek/deepseek-chat}"
PHASE_A1_PAID_SECRETARY_MODEL="${PHASE_A1_PAID_SECRETARY_MODEL:-qwen/qwen3.5-9b}"
PHASE_A1_PAID_ASK_MODEL="${PHASE_A1_PAID_ASK_MODEL:-qwen/qwen3.5-9b}"
PHASE_A1_PAID_ASK_QUESTION="${PHASE_A1_PAID_ASK_QUESTION:-hello from phase a1 paid smoke test}"
RUN_SUFFIX="${PHASE_A1_PAID_RUN_SUFFIX:-$(date -u +%Y%m%dT%H%M%SZ)}"
PHASE_A1_PAID_COUNCIL_TOPIC="${PHASE_A1_PAID_COUNCIL_TOPIC:-phase a1 paid smoke test ${RUN_SUFFIX}}"
PHASE_A1_PAID_MAX_ATTEMPTS="${PHASE_A1_PAID_MAX_ATTEMPTS:-3}"
PHASE_A1_PAID_RETRY_DELAY_SECONDS="${PHASE_A1_PAID_RETRY_DELAY_SECONDS:-3}"

cd "$ROOT_DIR"

run_with_retry() {
  local label="$1"
  shift

  local attempt=1
  while true; do
    echo "[phase-a1-paid-smoke] ${label} (attempt ${attempt}/${PHASE_A1_PAID_MAX_ATTEMPTS})"
    if "$@"; then
      return 0
    fi

    if [[ "${attempt}" -ge "${PHASE_A1_PAID_MAX_ATTEMPTS}" ]]; then
      echo "[phase-a1-paid-smoke] ${label} failed after ${attempt} attempts" >&2
      return 1
    fi

    attempt=$((attempt + 1))
    sleep "${PHASE_A1_PAID_RETRY_DELAY_SECONDS}"
  done
}

run_with_retry \
  "seeding Phase A1 prerequisites" \
  env CLI_TEST_USER_ID="$CLI_TEST_USER_ID" ./run.sh test pnpm seed

run_with_retry \
  "running ask with env default secretary model ${PHASE_A1_PAID_ASK_MODEL}" \
  ./run.sh test env \
    CLI_TEST_USER_ID="$CLI_TEST_USER_ID" \
    AGORA_ALLOWED_MODELS="$PHASE_A1_PAID_ALLOWED_MODELS" \
    AGORA_DEFAULT_COUNCIL_MODELS="$PHASE_A1_PAID_DEFAULT_COUNCIL_MODELS" \
    AGORA_SECRETARY_MODEL="$PHASE_A1_PAID_ASK_MODEL" \
    node bin/agora.mjs ask -q "$PHASE_A1_PAID_ASK_QUESTION"

run_with_retry \
  "running council with env default models ${PHASE_A1_PAID_DEFAULT_COUNCIL_MODELS}" \
  ./run.sh test env \
    CLI_TEST_USER_ID="$CLI_TEST_USER_ID" \
    AGORA_ALLOWED_MODELS="$PHASE_A1_PAID_ALLOWED_MODELS" \
    AGORA_DEFAULT_COUNCIL_MODELS="$PHASE_A1_PAID_DEFAULT_COUNCIL_MODELS" \
    AGORA_SECRETARY_MODEL="$PHASE_A1_PAID_SECRETARY_MODEL" \
    node bin/agora.mjs council run -t "$PHASE_A1_PAID_COUNCIL_TOPIC"

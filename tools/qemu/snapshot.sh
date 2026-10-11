#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Save or restore a VM snapshot through the monitor (savevm/loadvm).
# Usage: snapshot.sh save|restore <tag> [--name N]
set -euo pipefail
. "$(dirname "$0")/common.sh"

ACTION="${1:-}"
TAG="${2:-}"
NAME="nuci"
[ "${3:-}" = "--name" ] && NAME="$4"
[ -n "$TAG" ] || die "usage: snapshot.sh save|restore <tag> [--name N]"
MON="$RUN_DIR/$NAME.mon"
[ -S "$MON" ] || die "$NAME is not running"

case "$ACTION" in
	save) cmd="savevm $TAG" ;;
	restore) cmd="loadvm $TAG" ;;
	*) die "unknown action $ACTION" ;;
esac
out="$(printf '%s\n' "$cmd" | socat -t 120 - "UNIX-CONNECT:$MON" | tr -d '\r')"
if printf '%s' "$out" | grep -qiE 'error|not found|does not'; then
	die "$cmd failed: $out"
fi
log "$cmd ok"

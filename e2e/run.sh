#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# pnpm e2e: boot the QEMU lab if needed, provision it once, push the current
# build, then run Playwright (natively, or in the official container where
# Playwright ships no browser build, e.g. Ubuntu 20.04 arm64).
# Env: NUCI_E2E_SYNC=0 to test what is installed instead of the working tree.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
. "$REPO/tools/qemu/common.sh"

"$REPO/tools/qemu/start.sh"
if [ ! -f "$RUN_DIR/nuci.provisioned" ]; then
	"$REPO/tools/qemu/provision.sh" --wireless
	. "$QEMU_DIR/.env"
fi
if [ "${NUCI_E2E_SYNC:-1}" = 1 ]; then
	(cd "$REPO" && pnpm -s build >/dev/null)
	"$REPO/tools/sync.sh"
fi

# Test-only nuci-app proving the extension path (AGENTS.md §9 Phase 1).
HELLO="$REPO/e2e/fixtures/nuci-app-hello"
(cd "$REPO/e2e" && pnpm exec vite build -c fixtures/nuci-app-hello/vite.config.ts --logLevel error)
cp "$HELLO/manifest.json" "$HELLO/dist/hello.json"
lab_put /usr/share/nuci/apps "$HELLO/dist/hello.json"
lab_put /www/nuci/apps/hello "$HELLO/dist/index.js"

export NUCI_ROOT_PASSWORD NUCI_HTTP_PORT
cd "$REPO/e2e"

# Realtime transports to test (Phase 2 exit: the suite passes with SSE and,
# with the handler disabled, with ubus polling).
TRANSPORTS="${NUCI_E2E_TRANSPORTS:-sse poll}"
EVENTS_PREFIX='/nuci/events=/usr/share/nuci/events.uc'

set_handler() {
	if [ "$1" = on ]; then
		lab_ssh "uci -q get uhttpd.main.ucode_prefix | grep -qF '$EVENTS_PREFIX' || uci add_list uhttpd.main.ucode_prefix='$EVENTS_PREFIX'; uci commit uhttpd; /etc/init.d/uhttpd restart"
	else
		lab_ssh "uci -q del_list uhttpd.main.ucode_prefix='$EVENTS_PREFIX'; uci commit uhttpd; /etc/init.d/uhttpd restart"
	fi
	sleep 1
}

if [ "${NUCI_E2E_DOCKER:-auto}" != 1 ] && pnpm exec playwright install chromium >/dev/null 2>&1; then
	RUN=(pnpm exec playwright test)
else
	[ "${NUCI_E2E_DOCKER:-auto}" != 0 ] || { echo "playwright browsers unavailable" >&2; exit 1; }
	PW_VERSION="$(node -p "require('@playwright/test/package.json').version")"
	echo "[e2e] running Playwright $PW_VERSION in its container" >&2
	RUN=(docker run --rm --network host --ipc host --init
		--user "$(id -u):$(id -g)" -e HOME=/tmp -e CI="${CI:-}"
		-e NUCI_ROOT_PASSWORD -e NUCI_HTTP_PORT -e NUCI_E2E_TRANSPORT
		-v "$REPO:$REPO" -w "$REPO/e2e"
		"mcr.microsoft.com/playwright:v$PW_VERSION-noble"
		node "$REPO/e2e/node_modules/@playwright/test/cli.js" test)
fi

trap 'set_handler on' EXIT
rc=0
for NUCI_E2E_TRANSPORT in $TRANSPORTS; do
	export NUCI_E2E_TRANSPORT
	echo "[e2e] transport: $NUCI_E2E_TRANSPORT" >&2
	if [ "$NUCI_E2E_TRANSPORT" = poll ]; then set_handler off; else set_handler on; fi
	"${RUN[@]}" --output "test-results/$NUCI_E2E_TRANSPORT" "$@" || rc=1
done
exit "$rc"

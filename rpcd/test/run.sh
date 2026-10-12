#!/bin/sh
# SPDX-License-Identifier: Apache-2.0
# Runs every rpcd/test/*.test.uc with the shared libs and stubs on the module path.
set -eu
cd "$(dirname "$0")"
command -v ucode >/dev/null || { echo "ucode not found (see AGENTS.md §6)" >&2; exit 1; }
NUCI_TEST_DIR="$(pwd)"
export NUCI_TEST_DIR
LIB="$(cd ../lib && pwd)"
# First-party apps keep their libs in apps/nuci-app-*/rpcd/lib/nuci/app/ (nuci.app.<name>).
APPS="$(cd ../../apps && pwd)"
PATHS="-L $LIB"
for d in "$APPS"/nuci-app-*/rpcd/lib; do [ -d "$d" ] && PATHS="$PATHS -L $d"; done
rc=0
for t in "$NUCI_TEST_DIR"/*.test.uc "$APPS"/nuci-app-*/rpcd/test/*.test.uc; do
	[ -f "$t" ] || continue
	echo "${t#"$APPS/"}" | sed "s#^$NUCI_TEST_DIR/##"
	# shellcheck disable=SC2086
	ucode $PATHS -L "$NUCI_TEST_DIR/stubs" -L "$NUCI_TEST_DIR" "$t" || rc=1
done
exit "$rc"

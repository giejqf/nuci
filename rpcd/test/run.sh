#!/bin/sh
# SPDX-License-Identifier: Apache-2.0
# Runs every rpcd/test/*.test.uc with the shared libs and stubs on the module path.
set -eu
cd "$(dirname "$0")"
command -v ucode >/dev/null || { echo "ucode not found (see AGENTS.md §6)" >&2; exit 1; }
NUCI_TEST_DIR="$(pwd)"
export NUCI_TEST_DIR
LIB="$(cd ../lib && pwd)"
rc=0
for t in *.test.uc; do
	echo "$t"
	ucode -L "$LIB" -L "$NUCI_TEST_DIR/stubs" -L "$NUCI_TEST_DIR" "$NUCI_TEST_DIR/$t" || rc=1
done
exit "$rc"

#!/bin/sh
# SPDX-License-Identifier: Apache-2.0
# Syntax-check every ucode file. Native modules (ubus, uci, uloop) only exist
# on the router, so they are linked dynamically instead of resolved here.
set -eu
cd "$(dirname "$0")/.."
command -v ucode >/dev/null || { echo "ucode not found (see AGENTS.md §6)" >&2; exit 1; }
DYN="dynlink=ubus,dynlink=uci,dynlink=uloop"
rc=0
for f in rpcd/ucode/*.uc rpcd/test/*.test.uc; do
	[ -f "$f" ] || continue
	ucode -L "$PWD/rpcd/lib" -L "$PWD/rpcd/test" -c"$DYN" -o /dev/null "$f" || { echo "syntax error: $f" >&2; rc=1; }
done
# Shared libraries are modules: compile an importer for each one.
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
for f in rpcd/lib/nuci/*.uc rpcd/test/harness.uc; do
	[ -f "$f" ] || continue
	case "$f" in
		rpcd/lib/*) mod="nuci.$(basename "$f" .uc)" ;;
		*) mod="$(basename "$f" .uc)" ;;
	esac
	printf "import * as m from '%s';\n" "$mod" > "$tmp/check.uc"
	ucode -L "$PWD/rpcd/lib" -L "$PWD/rpcd/test" -c"$DYN" -o /dev/null "$tmp/check.uc" ||
		{ echo "syntax error: $f" >&2; rc=1; }
done
# uhttpd-mod-ucode compiles handlers in template mode.
for f in server/*.uc; do
	[ -f "$f" ] || continue
	ucode -L "$PWD/rpcd/lib" -T -c"$DYN" -o /dev/null "$f" || { echo "syntax error: $f" >&2; rc=1; }
done
[ "$rc" -eq 0 ] && echo "ucode syntax ok"
exit "$rc"

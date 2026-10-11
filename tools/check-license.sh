#!/bin/sh
# SPDX-License-Identifier: Apache-2.0
# Every .ts, .svelte, .uc and Makefile must carry an SPDX header (AGENTS.md §5).
set -eu
cd "$(dirname "$0")/.."
missing=$(git ls-files --cached --others --exclude-standard \
	'*.ts' '*.svelte' '*.uc' '*Makefile' '*.mjs' '*.js' '*.sh' |
	while read -r f; do
		[ -f "$f" ] || continue
		head -n 5 "$f" | grep -q 'SPDX-License-Identifier: Apache-2.0' || echo "$f"
	done)
if [ -n "$missing" ]; then
	echo "Missing SPDX-License-Identifier header:" >&2
	echo "$missing" >&2
	exit 1
fi
echo "license headers ok"

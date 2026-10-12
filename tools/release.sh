#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Build the NuCI package feed for a release: dist/release/ holds the .apk
# files, a signed apk v3 index (packages.adb) and the public key users add
# to /etc/apk/keys. The private key never enters the repository (AGENTS.md
# rule 10): pass it with NUCI_FEED_KEY=/path/to/key.pem.
#
# Usage: NUCI_FEED_KEY=... tools/release.sh [--no-build]
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$REPO/dist/release"
KEY="${NUCI_FEED_KEY:?set NUCI_FEED_KEY to the feed signing key (EC P-256, PEM)}"

if [ "${1:-}" != "--no-build" ]; then
	(cd "$REPO" && pnpm build)
	"$REPO/tools/sdk/build.sh"
fi

rm -rf "$OUT"
mkdir -p "$OUT"
cp "$REPO"/dist/feed/*.apk "$OUT/"
openssl ec -in "$KEY" -pubout -out "$OUT/nuci-feed.pem" 2>/dev/null
"$REPO/tools/sdk/mkndx.sh" "$OUT" "$KEY"
(cd "$OUT" && sha256sum ./*.apk packages.adb nuci-feed.pem > sha256sums)
echo "release feed in $OUT:"
ls -l "$OUT"

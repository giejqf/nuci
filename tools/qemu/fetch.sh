#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Download and verify the OpenWrt x86/64 combined image.
# Usage: fetch.sh [version]
set -euo pipefail
. "$(dirname "$0")/common.sh"

VERSION="${1:-$DEFAULT_VERSION}"
TARGET="${NUCI_TARGET:-x86/64}"
case "$TARGET" in
	x86/64) FILE="openwrt-$VERSION-x86-64-generic-squashfs-combined.img.gz"; SUFFIX="" ;;
	armsr/armv8) FILE="openwrt-$VERSION-armsr-armv8-generic-squashfs-combined.img.gz"; SUFFIX="-armv8" ;;
	*) die "unsupported target $TARGET" ;;
esac
OUT="$IMAGES_DIR/base-$VERSION$SUFFIX.img"
BASE_URL="${OPENWRT_MIRROR:-https://downloads.openwrt.org}/releases/$VERSION/targets/$TARGET"

mkdir -p "$IMAGES_DIR"
if [ -s "$OUT" ]; then
	log "$OUT already present"
	exit 0
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
log "downloading $BASE_URL/$FILE"
curl -fsSL --retry 3 -o "$tmp/$FILE" "$BASE_URL/$FILE"
curl -fsSL --retry 3 -o "$tmp/sha256sums" "$BASE_URL/sha256sums"
expected="$(awk -v f="$FILE" '$2 == f || $2 == "*" f { print $1 }' "$tmp/sha256sums")"
[ -n "$expected" ] || die "$FILE not listed in sha256sums"
actual="$(sha256sum "$tmp/$FILE" | awk '{print $1}')"
[ "$expected" = "$actual" ] || die "sha256 mismatch for $FILE"
log "sha256 ok"
# The combined image has trailing padding that makes gzip exit 2; that is expected.
rc=0
gzip -dc "$tmp/$FILE" > "$tmp/base.img" 2>/dev/null || rc=$?
[ "$rc" -eq 0 ] || [ "$rc" -eq 2 ] || die "gzip failed ($rc)"
mv "$tmp/base.img" "$OUT"
log "wrote $OUT"

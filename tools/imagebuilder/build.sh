#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Build a lab image with NuCI preinstalled using the OpenWrt Image Builder
# (AGENTS.md §7 "CI image"), so e2e does not depend on network installs.
# Needs the .apk files from tools/sdk/build.sh in dist/feed/.
# Output: tools/qemu/images/nuci-<version>[-armv8].img
#
# Env: NUCI_IB_VERSION (default 25.12.0), NUCI_TARGET (x86/64 | armsr/armv8)
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
VERSION="${NUCI_IB_VERSION:-25.12.0}"
TARGET="${NUCI_TARGET:-x86/64}"
CACHE="$REPO/tools/imagebuilder/cache"
WORK="$REPO/tools/imagebuilder/work"
IMAGES="$REPO/tools/qemu/images"
# NuCI plus what the lab needs; LuCI is left out on purpose.
PACKAGES="nuci kmod-mac80211-hwsim wpad-basic-mbedtls iw -luci -luci-light -luci-ssl -wpad-basic -wpad-mini"

log() { printf '[ib] %s\n' "$*" >&2; }
die() { printf '[ib] error: %s\n' "$*" >&2; exit 1; }

ls "$REPO"/dist/feed/*.apk >/dev/null 2>&1 || die "no packages in dist/feed (run tools/sdk/build.sh)"

if [ "$(uname -m)" != "x86_64" ] && [ "${NUCI_SDK_DOCKER:-1}" = 1 ] && [ -z "${NUCI_SDK_IN_DOCKER:-}" ]; then
	log "non-x86_64 host: running the Image Builder in an amd64 container"
	docker build -q --platform linux/amd64 -t nuci-sdk-builder "$REPO/tools/sdk" >/dev/null
	exec docker run --rm --platform linux/amd64 --user "$(id -u):$(id -g)" -e HOME=/tmp -e NUCI_SDK_IN_DOCKER=1 \
		-e NUCI_IB_VERSION="$VERSION" -e NUCI_TARGET="$TARGET" \
		-v "$REPO:$REPO" -w "$REPO" nuci-sdk-builder "$REPO/tools/imagebuilder/build.sh"
fi

BASE_URL="${OPENWRT_MIRROR:-https://downloads.openwrt.org}/releases/$VERSION/targets/$TARGET"
mkdir -p "$CACHE" "$WORK" "$IMAGES"
curl -fsSL --retry 3 -o "$CACHE/sha256sums.$VERSION.${TARGET//\//-}" "$BASE_URL/sha256sums"
SUMS="$CACHE/sha256sums.$VERSION.${TARGET//\//-}"
IB_FILE="$(awk '{sub(/^\*/, "", $2)} $2 ~ /^openwrt-imagebuilder-.*\.tar\.zst$/ {print $2}' "$SUMS")"
[ -n "$IB_FILE" ] || die "no Image Builder for $VERSION $TARGET"
IB_SUM="$(awk -v f="$IB_FILE" '{sub(/^\*/, "", $2)} $2 == f {print $1}' "$SUMS")"

if [ ! -f "$CACHE/$IB_FILE" ] || [ "$(sha256sum "$CACHE/$IB_FILE" | cut -d' ' -f1)" != "$IB_SUM" ]; then
	log "downloading $IB_FILE"
	curl -fsSL --retry 3 -o "$CACHE/$IB_FILE.part" "$BASE_URL/$IB_FILE"
	[ "$(sha256sum "$CACHE/$IB_FILE.part" | cut -d' ' -f1)" = "$IB_SUM" ] || die "Image Builder sha256 mismatch"
	mv "$CACHE/$IB_FILE.part" "$CACHE/$IB_FILE"
fi

IB="$WORK/${IB_FILE%.tar.zst}"
[ -d "$IB" ] || { log "extracting Image Builder"; tar -C "$WORK" --zstd -xf "$CACHE/$IB_FILE"; }

rm -f "$IB"/packages/nuci*.apk "$IB"/packages/rpcd-mod-nuci*.apk
cp "$REPO"/dist/feed/*.apk "$IB/packages/"

log "make image PACKAGES=\"$PACKAGES\""
make -C "$IB" image PROFILE=generic PACKAGES="$PACKAGES" FILES="$REPO/tools/qemu/files" \
	BIN_DIR="$WORK/bin" > "$WORK/image.log" 2>&1 || { tail -40 "$WORK/image.log" >&2; die "make image failed"; }

SUFFIX=""
[ "$TARGET" = "x86/64" ] || SUFFIX="-armv8"
IMG="$(ls "$WORK"/bin/*-squashfs-combined*.img.gz | head -1)"
[ -n "$IMG" ] || die "no combined image produced"
rc=0
gzip -dc "$IMG" > "$IMAGES/nuci-$VERSION$SUFFIX.img" 2>/dev/null || rc=$?
[ "$rc" -eq 0 ] || [ "$rc" -eq 2 ] || die "gzip failed ($rc)"
log "wrote $IMAGES/nuci-$VERSION$SUFFIX.img"

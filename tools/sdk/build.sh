#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Build the NuCI .apk packages from feed/ with the OpenWrt 25.12 SDK.
# Output: dist/feed/*.apk. Requires `pnpm build` first (nuci-base ships the SPA).
#
# Env: NUCI_SDK_VERSION (default 25.12.0), NUCI_SDK_TARGET (default x86/64),
#      NUCI_SDK_DOCKER=0 to force running the SDK natively.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
VERSION="${NUCI_SDK_VERSION:-25.12.0}"
TARGET="${NUCI_SDK_TARGET:-x86/64}"
CACHE="$REPO/tools/sdk/cache"
WORK="$REPO/tools/sdk/work"
OUT="$REPO/dist/feed"
PACKAGES=(rpcd-mod-nuci nuci-base nuci)

log() { printf '[sdk] %s\n' "$*" >&2; }
die() { printf '[sdk] error: %s\n' "$*" >&2; exit 1; }

[ -f "$REPO/apps/web/dist/index.html" ] || die "run 'pnpm build' first"

# The SDK's prebuilt host tools are x86_64 Linux binaries.
if [ "$(uname -m)" != "x86_64" ] && [ "${NUCI_SDK_DOCKER:-1}" = 1 ] && [ -z "${NUCI_SDK_IN_DOCKER:-}" ]; then
	command -v docker >/dev/null || die "non-x86_64 host needs docker (with binfmt qemu-x86_64)"
	log "non-x86_64 host: running the SDK in an amd64 container"
	docker build -q --platform linux/amd64 -t nuci-sdk-builder "$REPO/tools/sdk" >/dev/null
	exec docker run --rm --platform linux/amd64 \
		--user "$(id -u):$(id -g)" -e HOME=/tmp -e NUCI_SDK_IN_DOCKER=1 \
		-e NUCI_SDK_VERSION="$VERSION" -e NUCI_SDK_TARGET="$TARGET" \
		-v "$REPO:$REPO" -w "$REPO" nuci-sdk-builder "$REPO/tools/sdk/build.sh"
fi

BASE_URL="${OPENWRT_MIRROR:-https://downloads.openwrt.org}/releases/$VERSION/targets/$TARGET"
mkdir -p "$CACHE" "$WORK" "$OUT"

curl -fsSL --retry 3 -o "$CACHE/sha256sums.$VERSION" "$BASE_URL/sha256sums"
SDK_FILE="$(awk '{sub(/^\*/, "", $2)} $2 ~ /^openwrt-sdk-.*\.tar\.zst$/ {print $2}' "$CACHE/sha256sums.$VERSION")"
[ -n "$SDK_FILE" ] || die "no SDK listed for $VERSION $TARGET"
SDK_SUM="$(awk -v f="$SDK_FILE" '{sub(/^\*/, "", $2)} $2 == f {print $1}' "$CACHE/sha256sums.$VERSION")"

if [ ! -f "$CACHE/$SDK_FILE" ] || [ "$(sha256sum "$CACHE/$SDK_FILE" | cut -d' ' -f1)" != "$SDK_SUM" ]; then
	log "downloading $SDK_FILE"
	curl -fsSL --retry 3 -o "$CACHE/$SDK_FILE.part" "$BASE_URL/$SDK_FILE"
	[ "$(sha256sum "$CACHE/$SDK_FILE.part" | cut -d' ' -f1)" = "$SDK_SUM" ] || die "SDK sha256 mismatch"
	mv "$CACHE/$SDK_FILE.part" "$CACHE/$SDK_FILE"
fi

SDK="$WORK/${SDK_FILE%.tar.zst}"
if [ ! -d "$SDK" ]; then
	log "extracting SDK"
	tar -C "$WORK" --zstd -xf "$CACHE/$SDK_FILE"
fi

cd "$SDK"
printf 'src-link nuci %s/feed\n' "$REPO" > feeds.conf
./scripts/feeds update nuci >/dev/null
./scripts/feeds install -a -p nuci >/dev/null

{
	for p in "${PACKAGES[@]}"; do echo "CONFIG_PACKAGE_$p=m"; done
} >> .config
make defconfig >/dev/null

# One make invocation: the metadata scan dominates, especially under emulation.
targets=()
for p in "${PACKAGES[@]}"; do targets+=("package/$p/clean" "package/$p/compile"); done
log "building ${PACKAGES[*]}"
make "${targets[@]}" NUCI_SRC="$REPO" -j1 V=s > "$WORK/build.log" 2>&1 ||
	{ tail -40 "$WORK/build.log" >&2; die "build failed (log: $WORK/build.log)"; }

rm -f "$OUT"/*.apk
find bin/packages -path '*/nuci/*.apk' -exec cp {} "$OUT/" \;
ls -1 "$OUT"/*.apk >/dev/null 2>&1 || die "no packages produced"
log "packages:"
ls -l "$OUT"/*.apk >&2

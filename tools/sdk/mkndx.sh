#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Write a signed apk v3 index (packages.adb) for the .apk files in DIR, using
# the SDK's host apk-tools. Runs in the amd64 container on other hosts.
# Usage: tools/sdk/mkndx.sh DIR KEY.pem
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="$(cd "$1" && pwd)"
KEY="$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"

if [ "$(uname -m)" != "x86_64" ] && [ "${NUCI_SDK_DOCKER:-1}" = 1 ] && [ -z "${NUCI_SDK_IN_DOCKER:-}" ]; then
	docker build -q --platform linux/amd64 -t nuci-sdk-builder "$REPO/tools/sdk" >/dev/null
	exec docker run --rm --platform linux/amd64 --user "$(id -u):$(id -g)" -e HOME=/tmp -e NUCI_SDK_IN_DOCKER=1 \
		-v "$REPO:$REPO" -v "$DIR:$DIR" -v "$(dirname "$KEY"):$(dirname "$KEY")" -w "$REPO" \
		nuci-sdk-builder "$REPO/tools/sdk/mkndx.sh" "$DIR" "$KEY"
fi

SDK="$(ls -d "$REPO"/tools/sdk/work/openwrt-sdk-* 2>/dev/null | head -1)"
[ -n "$SDK" ] || { echo "run tools/sdk/build.sh first (it unpacks the SDK)" >&2; exit 1; }
APK="$SDK/staging_dir/host/bin/apk"

cd "$DIR"
"$APK" mkndx --allow-untrusted --sign "$KEY" --output packages.adb ./*.apk
"$APK" adbdump --format json packages.adb > /dev/null
echo "signed index: $DIR/packages.adb"

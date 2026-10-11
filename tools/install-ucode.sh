#!/bin/sh
# SPDX-License-Identifier: Apache-2.0
# Build the host `ucode` at the revision OpenWrt 25.12 ships, so host syntax
# checks and tests match the router (AGENTS.md §5).
# Usage: tools/install-ucode.sh [PREFIX]   (default: ~/.local)
set -eu
UCODE_REV=85922056 # ucode 2026.01.16~85922056 in the 25.12.0 feed
PREFIX="${1:-$HOME/.local}"
SRC="$(mktemp -d)"
trap 'rm -rf "$SRC"' EXIT
git clone -q https://github.com/jow-/ucode.git "$SRC/ucode"
git -C "$SRC/ucode" checkout -q "$UCODE_REV"
cmake -S "$SRC/ucode" -B "$SRC/build" -DCMAKE_INSTALL_PREFIX="$PREFIX" \
	-DCMAKE_INSTALL_RPATH="$PREFIX/lib" -DUBUS_SUPPORT=OFF -DUCI_SUPPORT=OFF \
	-DULOOP_SUPPORT=OFF -DRTNL_SUPPORT=OFF -DNL80211_SUPPORT=OFF \
	-DDEBUG_SUPPORT=OFF -DLOG_SUPPORT=OFF -DDIGEST_SUPPORT=OFF \
	-DSOCKET_SUPPORT=OFF -DZLIB_SUPPORT=OFF >/dev/null
cmake --build "$SRC/build" -j"$(nproc)" >/dev/null
cmake --install "$SRC/build" >/dev/null
echo "ucode $UCODE_REV installed to $PREFIX"

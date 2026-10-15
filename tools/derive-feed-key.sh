#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Derive the feed signing key (EC P-256, PEM) from a secret string, so a
# repository secret that is a passphrase can sign the feed. The same secret
# always gives the same key; the secret should carry at least 128 bits of
# entropy (the public key is published, so a weak one could be guessed).
#
# Usage: NUCI_FEED_SECRET=... tools/derive-feed-key.sh OUT.pem
set -euo pipefail
OUT="${1:?usage: derive-feed-key.sh OUT.pem}"
SECRET="${NUCI_FEED_SECRET:?set NUCI_FEED_SECRET}"
umask 077
# scalar = HMAC-SHA256(secret, label), a single HKDF-expand block
hex="$(printf 'nuci-feed-signing-v1\001' | openssl dgst -sha256 -hmac "$SECRET" -binary |
	od -An -v -tx1 | tr -d ' \n')"
# DER ECPrivateKey: version 1, 32-byte scalar, prime256v1 parameters.
der="30310201010420${hex}a00a06082a8648ce3d030107"
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
printf '%s' "$der" | sed 's/../\\x&/g' | xargs -0 printf > "$tmp"
openssl ec -inform DER -in "$tmp" -out "$OUT" 2>/dev/null ||
	{ echo "derive-feed-key: derived scalar rejected" >&2; exit 1; }

# SPDX-License-Identifier: Apache-2.0
# Shared settings for the QEMU lab scripts. Sourced, not executed.

QEMU_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$QEMU_DIR/../.." && pwd)"
IMAGES_DIR="$QEMU_DIR/images"
RUN_DIR="$QEMU_DIR/run"
DEFAULT_VERSION="25.12.0"

# Lab secrets / overrides (gitignored).
if [ -f "$QEMU_DIR/.env" ]; then
	# shellcheck disable=SC1091
	. "$QEMU_DIR/.env"
fi

NUCI_ROOT_PASSWORD="${NUCI_ROOT_PASSWORD:-}"
NUCI_HTTP_PORT="${NUCI_HTTP_PORT:-8080}"
NUCI_SSH_PORT="${NUCI_SSH_PORT:-2222}"
# UPnP control point port of the router (nuci-app-upnp e2e).
NUCI_UPNP_PORT="${NUCI_UPNP_PORT:-8085}"

log() { printf '[qemu] %s\n' "$*" >&2; }
die() { printf '[qemu] error: %s\n' "$*" >&2; exit 1; }

lab_ssh() {
	ssh -p "$NUCI_SSH_PORT" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
		-o LogLevel=ERROR -o ConnectTimeout=5 -o BatchMode=yes \
		-i "$RUN_DIR/id_ed25519" root@127.0.0.1 "$@"
}

# Copy files to a directory on the VM with tar over ssh (dropbear has no sftp,
# and scp flags differ between OpenSSH versions).
# Usage: lab_put DEST_DIR FILE...
lab_put() {
	local dest="$1"
	shift
	local args=() f
	for f in "$@"; do
		args+=(-C "$(cd "$(dirname "$f")" && pwd)" "$(basename "$f")")
	done
	tar --owner=0 --group=0 -cf - "${args[@]}" | lab_ssh "mkdir -p '$dest' && tar -C '$dest' -xf -"
}

#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Provision a running lab VM: SSH key, root password, rpcd/uhttpd deps,
# locally built nuci packages, LuCI removal. Idempotent.
# Usage: provision.sh [--keep-luci] [--packages DIR] [--extra "pkg pkg"]
set -euo pipefail
. "$(dirname "$0")/common.sh"

KEEP_LUCI=0
PKG_DIR="${NUCI_PKG_DIR:-$REPO_ROOT/dist/feed}"
EXTRA=""
while [ $# -gt 0 ]; do
	case "$1" in
		--keep-luci) KEEP_LUCI=1; shift ;;
		--packages) PKG_DIR="$2"; shift 2 ;;
		--extra) EXTRA="$2"; shift 2 ;;
		*) die "unknown argument $1" ;;
	esac
done

mkdir -p "$RUN_DIR"
[ -f "$RUN_DIR/id_ed25519" ] || ssh-keygen -q -t ed25519 -N '' -f "$RUN_DIR/id_ed25519" -C nuci-lab

# Generate the lab password once; it lives only in the gitignored .env.
if [ -z "$NUCI_ROOT_PASSWORD" ]; then
	NUCI_ROOT_PASSWORD="$(head -c 18 /dev/urandom | base64 | tr -d '/+=' | head -c 20)"
	printf 'NUCI_ROOT_PASSWORD=%s\n' "$NUCI_ROOT_PASSWORD" >> "$QEMU_DIR/.env"
	log "generated lab root password in tools/qemu/.env"
fi

ssh_try() {
	# Fresh images accept root with an empty password; provisioned ones need the key.
	ssh -p "$NUCI_SSH_PORT" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
		-o LogLevel=ERROR -o ConnectTimeout=5 -o BatchMode=yes \
		-i "$RUN_DIR/id_ed25519" root@127.0.0.1 "$@"
}

log "waiting for ssh on :$NUCI_SSH_PORT"
for i in $(seq 1 120); do
	ssh_try true 2>/dev/null && break
	[ "$i" -eq 120 ] && die "ssh did not come up"
	sleep 2
done

log "installing ssh key and root password"
ssh_try "mkdir -p /etc/dropbear && cat > /etc/dropbear/authorized_keys && chmod 600 /etc/dropbear/authorized_keys" \
	< "$RUN_DIR/id_ed25519.pub"
printf '%s\n%s\n' "$NUCI_ROOT_PASSWORD" "$NUCI_ROOT_PASSWORD" | lab_ssh "passwd root >/dev/null 2>&1"

log "waiting for WAN connectivity"
for i in $(seq 1 60); do
	lab_ssh "ping -c1 -W2 downloads.openwrt.org >/dev/null 2>&1" && break
	[ "$i" -eq 60 ] && die "guest has no internet via wan"
	sleep 2
done

PKGS="$(grep -vE '^\s*(#|$)' "$QEMU_DIR/packages.txt" | tr '\n' ' ') $EXTRA"
log "apk add $PKGS"
lab_ssh "apk update >/dev/null && apk add $PKGS"

if [ "$KEEP_LUCI" -eq 0 ]; then
	log "removing LuCI (NuCI must not depend on it)"
	lab_ssh 'pkgs="$(apk info 2>/dev/null | grep -E "^(luci|rpcd-mod-luci$|liblucihttp)" | tr "\n" " ")"; [ -z "$pkgs" ] || apk del $pkgs >/dev/null'
fi

if ls "$PKG_DIR"/*.apk >/dev/null 2>&1; then
	log "installing nuci packages from $PKG_DIR"
	lab_ssh "rm -rf /tmp/nuci-pkgs"
	lab_put /tmp/nuci-pkgs "$PKG_DIR"/*.apk
	lab_ssh "apk add --allow-untrusted /tmp/nuci-pkgs/*.apk"
else
	log "no nuci packages in $PKG_DIR (run tools/sdk/build.sh); skipping"
fi

log "restarting rpcd and uhttpd"
lab_ssh "/etc/init.d/rpcd restart; /etc/init.d/uhttpd restart"
sleep 2

log "checking /ubus with the null session"
out="$(curl -fsS -m 10 -d '{"jsonrpc":"2.0","id":1,"method":"call","params":["00000000000000000000000000000000","session","login",{"username":"root","password":"'"$NUCI_ROOT_PASSWORD"'"}]}' "http://127.0.0.1:$NUCI_HTTP_PORT/ubus")"
case "$out" in
	*ubus_rpc_session*) log "login via /ubus ok" ;;
	*) die "unexpected /ubus answer: $out" ;;
esac
touch "$RUN_DIR/${NUCI_LAB_NAME:-nuci}.provisioned"
log "provisioned"

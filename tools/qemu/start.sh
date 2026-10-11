#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Boot a disposable OpenWrt VM on a qcow2 overlay of the base image.
# Usage: start.sh [--version V] [--name N] [--fresh]
set -euo pipefail
. "$(dirname "$0")/common.sh"

VERSION="$DEFAULT_VERSION"
NAME="nuci"
FRESH=0
while [ $# -gt 0 ]; do
	case "$1" in
		--version) VERSION="$2"; shift 2 ;;
		--name) NAME="$2"; shift 2 ;;
		--fresh) FRESH=1; shift ;;
		*) die "unknown argument $1" ;;
	esac
done

TARGET="${NUCI_TARGET:-x86/64}"
SUFFIX=""
[ "$TARGET" = "x86/64" ] || SUFFIX="-armv8"
BASE="$IMAGES_DIR/base-$VERSION$SUFFIX.img"
OVERLAY="$RUN_DIR/$NAME.qcow2"
PIDFILE="$RUN_DIR/$NAME.pid"
MON="$RUN_DIR/$NAME.mon"
SERIAL="$RUN_DIR/$NAME.serial.log"

mkdir -p "$RUN_DIR"
[ -s "$BASE" ] || "$QEMU_DIR/fetch.sh" "$VERSION"

if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
	if [ "$FRESH" -eq 0 ]; then
		log "$NAME already running (pid $(cat "$PIDFILE"))"
		exit 0
	fi
	"$QEMU_DIR/stop.sh" --name "$NAME"
fi

if [ "$FRESH" -eq 1 ] || [ ! -f "$OVERLAY" ]; then
	rm -f "$OVERLAY" "$RUN_DIR/$NAME.provisioned"
	qemu-img create -q -f qcow2 -F raw -b "$BASE" "$OVERLAY"
fi
rm -f "$MON"
: > "$SERIAL"

LAN_NIC="user,model=virtio-net-pci,net=192.168.1.0/24,host=192.168.1.2,dhcpstart=192.168.1.100"
LAN_NIC="$LAN_NIC,hostfwd=tcp:127.0.0.1:$NUCI_HTTP_PORT-192.168.1.1:80"
LAN_NIC="$LAN_NIC,hostfwd=tcp:127.0.0.1:$NUCI_SSH_PORT-192.168.1.1:22"
WAN_NIC="user,model=virtio-net-pci"

COMMON=(
	-m 512 -display none
	-drive "file=$OVERLAY,format=qcow2,if=virtio"
	-nic "$LAN_NIC" -nic "$WAN_NIC"
	-monitor "unix:$MON,server,nowait"
	-serial "file:$SERIAL"
	-pidfile "$PIDFILE" -daemonize
)

case "$TARGET" in
	x86/64)
		ACCEL=(-accel tcg)
		if [ -w /dev/kvm ] && [ "$(uname -m)" = "x86_64" ]; then ACCEL=(-accel kvm -cpu host); fi
		qemu-system-x86_64 -M q35 "${ACCEL[@]}" "${COMMON[@]}"
		;;
	armsr/armv8)
		ACCEL=(-cpu cortex-a57)
		if [ -w /dev/kvm ] && [ "$(uname -m)" = "aarch64" ]; then ACCEL=(-accel kvm -cpu host); fi
		FW="${NUCI_AARCH64_FW:-/usr/share/qemu-efi-aarch64/QEMU_EFI.fd}"
		qemu-system-aarch64 -M virt "${ACCEL[@]}" -bios "$FW" "${COMMON[@]}"
		;;
esac
log "started $NAME (pid $(cat "$PIDFILE")), http://127.0.0.1:$NUCI_HTTP_PORT ssh :$NUCI_SSH_PORT"

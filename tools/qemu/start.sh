#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Boot a disposable OpenWrt VM on a qcow2 overlay of the base image.
# Usage: start.sh [--version V] [--name N] [--fresh] [--image FILE]
#   --image  boot this raw image instead of the stock base image (e.g. the
#            Image Builder image from tools/imagebuilder/build.sh)
set -euo pipefail
. "$(dirname "$0")/common.sh"

VERSION="$DEFAULT_VERSION"
NAME="nuci"
FRESH=0
IMAGE=""
while [ $# -gt 0 ]; do
	case "$1" in
		--version) VERSION="$2"; shift 2 ;;
		--name) NAME="$2"; shift 2 ;;
		--fresh) FRESH=1; shift ;;
		--image) IMAGE="$2"; shift 2 ;;
		*) die "unknown argument $1" ;;
	esac
done

TARGET="${NUCI_TARGET:-x86/64}"
SUFFIX=""
[ "$TARGET" = "x86/64" ] || SUFFIX="-armv8"
BASE="${IMAGE:-$IMAGES_DIR/base-$VERSION$SUFFIX.img}"
OVERLAY="$RUN_DIR/$NAME.qcow2"
PIDFILE="$RUN_DIR/$NAME.pid"
MON="$RUN_DIR/$NAME.mon"
SERIAL="$RUN_DIR/$NAME.serial.log"
STOPFILE="$RUN_DIR/$NAME.stop"

mkdir -p "$RUN_DIR"
[ -n "$IMAGE" ] || [ -s "$BASE" ] || "$QEMU_DIR/fetch.sh" "$VERSION"
[ -s "$BASE" ] || die "image $BASE not found"
BASE="$(cd "$(dirname "$BASE")" && pwd)/$(basename "$BASE")"

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
: > "$RUN_DIR/$NAME.qemu.log"

LAN_NIC="user,model=virtio-net-pci,net=192.168.1.0/24,host=192.168.1.2,dhcpstart=192.168.1.100"
LAN_NIC="$LAN_NIC,hostfwd=tcp:127.0.0.1:$NUCI_HTTP_PORT-192.168.1.1:80"
LAN_NIC="$LAN_NIC,hostfwd=tcp:127.0.0.1:$NUCI_SSH_PORT-192.168.1.1:22"
LAN_NIC="$LAN_NIC,hostfwd=tcp:127.0.0.1:$NUCI_UPNP_PORT-192.168.1.1:5000"
WAN_NIC="user,model=virtio-net-pci"

COMMON=(
	-m 512 -display none
	-drive "file=$OVERLAY,format=qcow2,if=virtio"
	-nic "$LAN_NIC" -nic "$WAN_NIC"
	-monitor "unix:$MON,server,nowait"
	-chardev "file,id=serial0,path=$SERIAL,append=on" -serial chardev:serial0
	-pidfile "$PIDFILE" -no-reboot
)

# NUCI_QEMU_ACCEL=tcg forces full emulation (what CI gets without /dev/kvm).
KVM_OK=0
if [ -w /dev/kvm ] && [ "${NUCI_QEMU_ACCEL:-}" != tcg ]; then KVM_OK=1; fi

case "$TARGET" in
	x86/64)
		ACCEL=(-accel tcg)
		if [ "$KVM_OK" = 1 ] && [ "$(uname -m)" = "x86_64" ]; then ACCEL=(-accel kvm -cpu host); fi
		CMD=(qemu-system-x86_64 -M q35 "${ACCEL[@]}" "${COMMON[@]}")
		;;
	armsr/armv8)
		ACCEL=(-cpu cortex-a57)
		if [ "$KVM_OK" = 1 ] && [ "$(uname -m)" = "aarch64" ]; then ACCEL=(-accel kvm -cpu host); fi
		FW="${NUCI_AARCH64_FW:-/usr/share/qemu-efi-aarch64/QEMU_EFI.fd}"
		CMD=(qemu-system-aarch64 -M virt "${ACCEL[@]}" -bios "$FW" "${COMMON[@]}")
		;;
esac

# A guest reboot exits QEMU (-no-reboot) and this loop boots the same overlay
# again from a cold start. Under TCG (aarch64, QEMU 8.2) the boot after a warm
# reset stalls in the kernel's EFI stub for minutes, longer the longer the
# guest was up (4 min after 6 min, 15 min after 35); a cold start does not.
# stop.sh leaves $STOPFILE to end the loop.
rm -f "$STOPFILE" "$PIDFILE"
setsid bash -c '
	stopfile="$1"; shift
	while [ ! -e "$stopfile" ] && "$@"; do :; done
	rm -f "$stopfile"
' supervise "$STOPFILE" "${CMD[@]}" </dev/null >>"$RUN_DIR/$NAME.qemu.log" 2>&1 &
for _ in $(seq 1 50); do
	[ -s "$PIDFILE" ] && break
	sleep 0.2
done
[ -s "$PIDFILE" ] || die "qemu did not start, see $RUN_DIR/$NAME.qemu.log"
log "started $NAME (pid $(cat "$PIDFILE")), http://127.0.0.1:$NUCI_HTTP_PORT ssh :$NUCI_SSH_PORT"

#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Push the working tree to the running lab router without building packages.
# Usage: tools/sync.sh [--web] [--rpcd] [--server] [--apps]   (default: all)
set -euo pipefail
. "$(dirname "$0")/qemu/common.sh"

WEB=0 RPCD=0 SERVER=0 APPS=0
[ $# -eq 0 ] && WEB=1 RPCD=1 SERVER=1 APPS=1
for a in "$@"; do
	case "$a" in
		--web) WEB=1 ;;
		--rpcd) RPCD=1 ;;
		--server) SERVER=1 ;;
		--apps) APPS=1 ;;
		*) die "unknown argument $a" ;;
	esac
done

if [ "$WEB" = 1 ]; then
	DIST="$REPO_ROOT/apps/web/dist"
	[ -f "$DIST/index.html" ] || die "run 'pnpm build' first"
	log "web: dist/ -> /www/nuci"
	tar --owner=0 --group=0 --exclude=.vite -C "$DIST" -cf - . |
		lab_ssh 'rm -rf /www/nuci.new && mkdir -p /www/nuci.new && tar -C /www/nuci.new -xf - &&
			{ [ ! -d /www/nuci/apps ] || mv /www/nuci/apps /www/nuci.new/apps; } &&
			rm -rf /www/nuci && mv /www/nuci.new /www/nuci'
fi

# rpcd first: events.uc imports the shared libs, and uhttpd exits if it cannot compile it.
if [ "$RPCD" = 1 ]; then
	log "rpcd: plugins, libs, ACLs"
	lab_put /usr/share/rpcd/ucode "$REPO_ROOT"/rpcd/ucode/nuci-*.uc
	lab_put /usr/share/ucode/nuci "$REPO_ROOT"/rpcd/lib/nuci/*.uc
	lab_put /usr/share/rpcd/acl.d "$REPO_ROOT"/rpcd/acl.d/nuci-*.json
	lab_put /usr/libexec/nuci "$REPO_ROOT"/rpcd/libexec/run-job
	lab_ssh '/etc/init.d/rpcd restart'
fi
# First-party apps (apps/nuci-app-*): same layout as feed/nuci-app.mk installs.
if [ "$APPS" = 1 ]; then
	found=0
	for dir in "$REPO_ROOT"/apps/nuci-app-*/; do
		[ -d "$dir" ] || continue
		found=1
		id="$(basename "$dir")"; id="${id#nuci-app-}"
		[ -f "$dir/dist/index.js" ] || die "app $id not built (pnpm build)"
		log "app: $id"
		cp "$dir/manifest.json" "/tmp/nuci-app-$id.json"
		lab_put /usr/share/nuci/apps "/tmp/nuci-app-$id.json"
		rm -f "/tmp/nuci-app-$id.json"
		lab_ssh "mv /usr/share/nuci/apps/nuci-app-$id.json /usr/share/nuci/apps/$id.json"
		lab_put "/www/nuci/apps/$id" "$dir/dist/index.js"
		[ ! -d "$dir/rpcd/ucode" ] || lab_put /usr/share/rpcd/ucode "$dir"/rpcd/ucode/*.uc
		[ ! -d "$dir/rpcd/lib/nuci/app" ] || lab_put /usr/share/ucode/nuci/app "$dir"/rpcd/lib/nuci/app/*.uc
		[ ! -d "$dir/rpcd/acl.d" ] || lab_put /usr/share/rpcd/acl.d "$dir"/rpcd/acl.d/*.json
		if [ -d "$dir/root" ]; then
			tar --owner=0 --group=0 -C "$dir/root" -cf - . | lab_ssh 'tar -C / -xf -'
			# Like default_postinst: enable and start the app's init scripts.
			for s in "$dir"/root/etc/init.d/*; do
				[ -f "$s" ] && lab_ssh "/etc/init.d/$(basename "$s") enable; /etc/init.d/$(basename "$s") start"
			done
		fi
	done
	# After the apps' ACLs and plugins are in place (also when --rpcd ran above).
	[ "$found" = 0 ] || lab_ssh '/etc/init.d/rpcd restart'
fi
if [ "$SERVER" = 1 ]; then
	log "server: events.uc, probe.uc, transfer.uc, nuci-base files, uhttpd integration"
	FILES="$REPO_ROOT/feed/nuci-base/files"
	lab_put /usr/share/nuci "$REPO_ROOT/server/events.uc" "$REPO_ROOT/server/probe.uc" "$REPO_ROOT/server/transfer.uc"
	lab_put /usr/libexec/nuci "$FILES/root-redirect.sh"
	lab_put /tmp/nuci-sync "$FILES/nuci.config" "$FILES/nuci.init" "$FILES/nuci.uci-defaults"
	lab_ssh 'set -e
		mkdir -p /usr/share/nuci/apps
		mv /usr/libexec/nuci/root-redirect.sh /usr/libexec/nuci/root-redirect
		chmod 755 /usr/libexec/nuci/root-redirect
		[ -f /etc/config/nuci ] || cp /tmp/nuci-sync/nuci.config /etc/config/nuci
		cp /tmp/nuci-sync/nuci.init /etc/init.d/nuci && chmod 755 /etc/init.d/nuci
		sh /tmp/nuci-sync/nuci.uci-defaults
		rm -rf /tmp/nuci-sync
		/etc/init.d/uhttpd restart'
fi

log "synced"

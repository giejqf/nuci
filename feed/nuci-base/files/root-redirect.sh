#!/bin/sh
# SPDX-License-Identifier: Apache-2.0
# Install or remove the / -> /nuci/ redirect (D16). Only ever touches a
# /www/index.html that we created (marked nuci-root-redirect).

INDEX=/www/index.html
MARK='nuci-root-redirect'

luci_present() {
	[ -e /www/cgi-bin/luci ] || [ -d /www/luci-static ]
}

ours() {
	[ -f "$INDEX" ] && grep -q "$MARK" "$INDEX"
}

enabled="$(uci -q get nuci.main.root_redirect)"
[ -n "$enabled" ] || enabled=1

if [ "$enabled" = 1 ] && ! luci_present; then
	if [ ! -e "$INDEX" ] || ours; then
		cat > "$INDEX.tmp" <<'HTML'
<!doctype html>
<!-- nuci-root-redirect: managed by nuci-base, see uci nuci.main.root_redirect -->
<html><head><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=/nuci/">
<title>NuCI</title></head><body><a href="/nuci/">NuCI</a></body></html>
HTML
		mv "$INDEX.tmp" "$INDEX"
	fi
elif ours; then
	rm -f "$INDEX"
fi
exit 0

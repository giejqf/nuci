# SPDX-License-Identifier: Apache-2.0
#
# NuCI core: SPA static files, SSE handler, uhttpd integration, ACLs, root redirect.
# The SPA must be built first (`pnpm build`); NUCI_SRC points at the repo root.

include $(TOPDIR)/rules.mk

PKG_NAME:=nuci-base
PKG_VERSION:=0.1.0
PKG_RELEASE:=1
PKG_LICENSE:=Apache-2.0
PKG_LICENSE_FILES:=LICENSE

NUCI_SRC ?= $(CURDIR)/../..

include $(INCLUDE_DIR)/package.mk

define Package/nuci-base
  SECTION:=nuci
  CATEGORY:=NuCI
  TITLE:=NuCI web interface (core)
  URL:=https://github.com/nuci/nuci
  DEPENDS:=+uhttpd +uhttpd-mod-ubus +uhttpd-mod-ucode +rpcd +rpcd-mod-ucode \
	+rpcd-mod-file +rpcd-mod-rpcsys +rpcd-mod-iwinfo \
	+ucode +ucode-mod-fs +ucode-mod-ubus +ucode-mod-uci +rpcd-mod-nuci
  PKGARCH:=all
endef

define Package/nuci-base/description
  Static files of the NuCI single-page application served at /nuci/,
  the /nuci/events Server-Sent Events handler, the /nuci/probe apply
  probe, rpcd ACLs and the
  optional / redirect.
endef

define Package/nuci-base/conffiles
/etc/config/nuci
endef

define Build/Prepare
	@if [ ! -f "$(NUCI_SRC)/apps/web/dist/index.html" ]; then \
		echo "NuCI SPA not built: run 'pnpm build' in $(NUCI_SRC)" >&2; exit 1; fi
	$(INSTALL_DIR) $(PKG_BUILD_DIR)
	$(CP) $(NUCI_SRC)/apps/web/dist $(PKG_BUILD_DIR)/www
	rm -rf $(PKG_BUILD_DIR)/www/.vite
	$(CP) $(NUCI_SRC)/server/events.uc $(NUCI_SRC)/server/probe.uc $(PKG_BUILD_DIR)/
	$(CP) $(NUCI_SRC)/rpcd/acl.d/nuci-base.json $(PKG_BUILD_DIR)/
endef

define Build/Compile
endef

define Package/nuci-base/install
	$(INSTALL_DIR) $(1)/www/nuci
	$(CP) $(PKG_BUILD_DIR)/www/* $(1)/www/nuci/
	$(INSTALL_DIR) $(1)/usr/share/nuci/apps
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/events.uc $(1)/usr/share/nuci/events.uc
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/probe.uc $(1)/usr/share/nuci/probe.uc
	$(INSTALL_DIR) $(1)/usr/share/rpcd/acl.d
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/nuci-base.json $(1)/usr/share/rpcd/acl.d/
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) ./files/nuci.config $(1)/etc/config/nuci
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./files/nuci.init $(1)/etc/init.d/nuci
	$(INSTALL_DIR) $(1)/etc/uci-defaults
	$(INSTALL_BIN) ./files/nuci.uci-defaults $(1)/etc/uci-defaults/90-nuci-base
	$(INSTALL_DIR) $(1)/usr/libexec/nuci
	$(INSTALL_BIN) ./files/root-redirect.sh $(1)/usr/libexec/nuci/root-redirect
endef

define Package/nuci-base/postrm
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] && exit 0
# Drop our redirect and uhttpd hook; leave everything else untouched.
grep -q 'nuci-root-redirect' /www/index.html 2>/dev/null && rm -f /www/index.html
uci -q del_list uhttpd.main.ucode_prefix='/nuci/events=/usr/share/nuci/events.uc'
uci -q del_list uhttpd.main.ucode_prefix='/nuci/probe=/usr/share/nuci/probe.uc'
uci commit uhttpd
/etc/init.d/uhttpd reload 2>/dev/null
/etc/init.d/rpcd reload 2>/dev/null
exit 0
endef

$(eval $(call BuildPackage,nuci-base))

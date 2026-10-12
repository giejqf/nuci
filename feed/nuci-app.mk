# SPDX-License-Identifier: Apache-2.0
#
# Shared rules for first-party nuci-app-* packages (ADR-0004). An app's
# Makefile sets NUCI_APP_ID, NUCI_APP_TITLE, PKG_VERSION, PKG_RELEASE and
# optionally NUCI_APP_DEPENDS, includes this file, then calls BuildPackage.
# Sources come from apps/nuci-app-<id>/ in the checkout (built first with `pnpm build`):
#   manifest.json         -> /usr/share/nuci/apps/<id>.json
#   dist/index.js         -> /www/nuci/apps/<id>/index.js
#   rpcd/ucode/*.uc       -> /usr/share/rpcd/ucode/      (optional)
#   rpcd/lib/nuci/app/*.uc -> /usr/share/ucode/nuci/app/ (optional, nuci.app.<name>)
#   rpcd/acl.d/*.json     -> /usr/share/rpcd/acl.d/      (optional)
#   root/...              -> / as is (optional: init scripts, helpers)

PKG_NAME:=nuci-app-$(NUCI_APP_ID)
PKG_LICENSE:=Apache-2.0

NUCI_SRC ?= $(CURDIR)/../..
NUCI_APP_SRC = $(NUCI_SRC)/apps/nuci-app-$(NUCI_APP_ID)

include $(INCLUDE_DIR)/package.mk

define Package/$(PKG_NAME)
  SECTION:=nuci
  CATEGORY:=NuCI
  SUBMENU:=Applications
  TITLE:=$(NUCI_APP_TITLE)
  DEPENDS:=+nuci-base +rpcd-mod-nuci $(NUCI_APP_DEPENDS)
  PKGARCH:=all
endef

define Build/Prepare
	[ -f $(NUCI_APP_SRC)/dist/index.js ] || { echo "run 'pnpm build' first" >&2; exit 1; }
	$(INSTALL_DIR) $(PKG_BUILD_DIR)
	$(CP) $(NUCI_APP_SRC)/manifest.json $(NUCI_APP_SRC)/dist/index.js $(PKG_BUILD_DIR)/
	[ ! -d $(NUCI_APP_SRC)/rpcd ] || $(CP) $(NUCI_APP_SRC)/rpcd $(PKG_BUILD_DIR)/
	[ ! -d $(NUCI_APP_SRC)/root ] || $(CP) $(NUCI_APP_SRC)/root $(PKG_BUILD_DIR)/
endef

define Build/Compile
endef

define Package/$(PKG_NAME)/install
	$(INSTALL_DIR) $(1)/usr/share/nuci/apps $(1)/www/nuci/apps/$(NUCI_APP_ID)
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/manifest.json $(1)/usr/share/nuci/apps/$(NUCI_APP_ID).json
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/index.js $(1)/www/nuci/apps/$(NUCI_APP_ID)/index.js
	if [ -d $(PKG_BUILD_DIR)/rpcd/ucode ]; then \
		$(INSTALL_DIR) $(1)/usr/share/rpcd/ucode; \
		$(INSTALL_DATA) $(PKG_BUILD_DIR)/rpcd/ucode/*.uc $(1)/usr/share/rpcd/ucode/; \
	fi
	if [ -d $(PKG_BUILD_DIR)/rpcd/lib/nuci/app ]; then \
		$(INSTALL_DIR) $(1)/usr/share/ucode/nuci/app; \
		$(INSTALL_DATA) $(PKG_BUILD_DIR)/rpcd/lib/nuci/app/*.uc $(1)/usr/share/ucode/nuci/app/; \
	fi
	if [ -d $(PKG_BUILD_DIR)/root ]; then \
		$(CP) $(PKG_BUILD_DIR)/root/. $(1)/; \
	fi
	if [ -d $(PKG_BUILD_DIR)/rpcd/acl.d ]; then \
		$(INSTALL_DIR) $(1)/usr/share/rpcd/acl.d; \
		$(INSTALL_DATA) $(PKG_BUILD_DIR)/rpcd/acl.d/*.json $(1)/usr/share/rpcd/acl.d/; \
	fi
endef

define Package/$(PKG_NAME)/postinst
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || /etc/init.d/rpcd reload
exit 0
endef

define Package/$(PKG_NAME)/postrm
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || /etc/init.d/rpcd reload
exit 0
endef

# The app Makefile ends with $(eval $(call BuildPackage,$(PKG_NAME))): OpenWrt's
# feed scanner only indexes Makefiles that contain that call themselves.

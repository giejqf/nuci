# SPDX-License-Identifier: Apache-2.0
#
# NuCI rpcd ucode plugins (nuci.* ubus objects) and their shared libraries.

include $(TOPDIR)/rules.mk

PKG_NAME:=rpcd-mod-nuci
PKG_VERSION:=0.1.0
PKG_RELEASE:=1
PKG_LICENSE:=Apache-2.0

NUCI_SRC ?= $(CURDIR)/../..

include $(INCLUDE_DIR)/package.mk

define Package/rpcd-mod-nuci
  SECTION:=nuci
  CATEGORY:=NuCI
  TITLE:=NuCI rpcd ucode plugins
  DEPENDS:=+rpcd +rpcd-mod-ucode +ucode +ucode-mod-fs +ucode-mod-ubus +ucode-mod-uci
  PKGARCH:=all
endef

define Package/rpcd-mod-nuci/description
  ucode plugins for rpcd exposing the nuci.* ubus objects used by NuCI.
endef

define Build/Prepare
	$(INSTALL_DIR) $(PKG_BUILD_DIR)
	$(CP) $(NUCI_SRC)/rpcd/ucode $(NUCI_SRC)/rpcd/lib $(NUCI_SRC)/rpcd/libexec $(PKG_BUILD_DIR)/
endef

define Build/Compile
endef

define Package/rpcd-mod-nuci/install
	$(INSTALL_DIR) $(1)/usr/share/rpcd/ucode
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/ucode/nuci-*.uc $(1)/usr/share/rpcd/ucode/
	$(INSTALL_DIR) $(1)/usr/share/ucode/nuci
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/lib/nuci/*.uc $(1)/usr/share/ucode/nuci/
	$(INSTALL_DIR) $(1)/usr/libexec/nuci
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/libexec/run-job $(1)/usr/libexec/nuci/run-job
endef

define Package/rpcd-mod-nuci/postinst
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || /etc/init.d/rpcd reload
exit 0
endef

define Package/rpcd-mod-nuci/postrm
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || /etc/init.d/rpcd reload
exit 0
endef

$(eval $(call BuildPackage,rpcd-mod-nuci))

# SPDX-License-Identifier: Apache-2.0
#
# Meta package: `apk add nuci` installs the complete NuCI web interface.

include $(TOPDIR)/rules.mk

PKG_NAME:=nuci
PKG_VERSION:=0.5.0
PKG_RELEASE:=1
PKG_LICENSE:=Apache-2.0

include $(INCLUDE_DIR)/package.mk

define Package/nuci
  SECTION:=nuci
  CATEGORY:=NuCI
  TITLE:=NuCI web interface for OpenWrt
  DEPENDS:=+nuci-base +rpcd-mod-nuci
  PKGARCH:=all
endef

define Package/nuci/description
  A fast, modern admin UI for OpenWrt. Installs all NuCI components.
endef

define Build/Compile
endef

define Package/nuci/install
	$(INSTALL_DIR) $(1)/usr/share/nuci
	echo "$(PKG_VERSION)-r$(PKG_RELEASE)" > $(1)/usr/share/nuci/VERSION
endef

$(eval $(call BuildPackage,nuci))

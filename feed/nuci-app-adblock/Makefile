# SPDX-License-Identifier: Apache-2.0
#
# NuCI app: DNS blocklists (apps/nuci-app-adblock).

include $(TOPDIR)/rules.mk

NUCI_APP_ID:=adblock
NUCI_APP_TITLE:=NuCI app: DNS blocklists (adblock)
NUCI_APP_DEPENDS:=+adblock
PKG_VERSION:=0.4.0
PKG_RELEASE:=1

include ../nuci-app.mk

$(eval $(call BuildPackage,$(PKG_NAME)))

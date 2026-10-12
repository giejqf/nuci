# SPDX-License-Identifier: Apache-2.0
#
# NuCI app: Dynamic DNS (apps/nuci-app-ddns).

include $(TOPDIR)/rules.mk

NUCI_APP_ID:=ddns
NUCI_APP_TITLE:=NuCI app: Dynamic DNS
NUCI_APP_DEPENDS:=+ddns-scripts
PKG_VERSION:=0.2.0
PKG_RELEASE:=1

include ../nuci-app.mk

$(eval $(call BuildPackage,$(PKG_NAME)))

# SPDX-License-Identifier: Apache-2.0
#
# NuCI app: Wake on LAN (apps/nuci-app-wol).

include $(TOPDIR)/rules.mk

NUCI_APP_ID:=wol
NUCI_APP_TITLE:=NuCI app: Wake on LAN
NUCI_APP_DEPENDS:=+etherwake
PKG_VERSION:=0.5.0
PKG_RELEASE:=1

include ../nuci-app.mk

$(eval $(call BuildPackage,$(PKG_NAME)))

# SPDX-License-Identifier: Apache-2.0
#
# NuCI app: attended sysupgrade through owut (apps/nuci-app-asu, ADR-0007).

include $(TOPDIR)/rules.mk

NUCI_APP_ID:=asu
NUCI_APP_TITLE:=NuCI app: firmware upgrade (attended sysupgrade)
NUCI_APP_DEPENDS:=+owut
PKG_VERSION:=0.4.0
PKG_RELEASE:=1

include ../nuci-app.mk

$(eval $(call BuildPackage,$(PKG_NAME)))

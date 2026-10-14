# SPDX-License-Identifier: Apache-2.0
#
# NuCI app: frp client (apps/nuci-app-frpc).

include $(TOPDIR)/rules.mk

NUCI_APP_ID:=frpc
NUCI_APP_TITLE:=NuCI app: frp client
NUCI_APP_DEPENDS:=+frpc
PKG_VERSION:=0.5.0
PKG_RELEASE:=1

include ../nuci-app.mk

$(eval $(call BuildPackage,$(PKG_NAME)))

# SPDX-License-Identifier: Apache-2.0
#
# NuCI app: WireGuard tunnels (apps/nuci-app-wireguard).

include $(TOPDIR)/rules.mk

NUCI_APP_ID:=wireguard
NUCI_APP_TITLE:=NuCI app: WireGuard tunnels
NUCI_APP_DEPENDS:=+wireguard-tools +kmod-wireguard
PKG_VERSION:=0.2.0
PKG_RELEASE:=1

include ../nuci-app.mk

$(eval $(call BuildPackage,$(PKG_NAME)))

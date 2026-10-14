# SPDX-License-Identifier: Apache-2.0
#
# NuCI app: DNS over HTTPS (apps/nuci-app-https-dns-proxy).

include $(TOPDIR)/rules.mk

NUCI_APP_ID:=https-dns-proxy
NUCI_APP_TITLE:=NuCI app: DNS over HTTPS
NUCI_APP_DEPENDS:=+https-dns-proxy
PKG_VERSION:=0.5.0
PKG_RELEASE:=1

include ../nuci-app.mk

$(eval $(call BuildPackage,$(PKG_NAME)))

# SPDX-License-Identifier: Apache-2.0
#
# NuCI app: web server settings and certificate (apps/nuci-app-uhttpd).

include $(TOPDIR)/rules.mk

NUCI_APP_ID:=uhttpd
NUCI_APP_TITLE:=NuCI app: web server settings and certificate
NUCI_APP_DEPENDS:=+uhttpd +px5g-mbedtls
PKG_VERSION:=0.5.0
PKG_RELEASE:=1

include ../nuci-app.mk

$(eval $(call BuildPackage,$(PKG_NAME)))

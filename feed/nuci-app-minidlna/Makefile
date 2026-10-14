# SPDX-License-Identifier: Apache-2.0
#
# NuCI app: DLNA media server (apps/nuci-app-minidlna).

include $(TOPDIR)/rules.mk

NUCI_APP_ID:=minidlna
NUCI_APP_TITLE:=NuCI app: DLNA media server
NUCI_APP_DEPENDS:=+minidlna
PKG_VERSION:=0.5.0
PKG_RELEASE:=1

include ../nuci-app.mk

$(eval $(call BuildPackage,$(PKG_NAME)))

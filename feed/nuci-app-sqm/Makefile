# SPDX-License-Identifier: Apache-2.0
#
# NuCI app: Smart queue management (apps/nuci-app-sqm).

include $(TOPDIR)/rules.mk

NUCI_APP_ID:=sqm
NUCI_APP_TITLE:=NuCI app: Smart queue management
NUCI_APP_DEPENDS:=+sqm-scripts +kmod-sched-cake
PKG_VERSION:=0.2.0
PKG_RELEASE:=1

include ../nuci-app.mk

$(eval $(call BuildPackage,$(PKG_NAME)))

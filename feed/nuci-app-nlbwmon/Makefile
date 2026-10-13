# SPDX-License-Identifier: Apache-2.0
#
# NuCI app: traffic usage per client (apps/nuci-app-nlbwmon).

include $(TOPDIR)/rules.mk

NUCI_APP_ID:=nlbwmon
NUCI_APP_TITLE:=NuCI app: traffic usage per client (nlbwmon)
NUCI_APP_DEPENDS:=+nlbwmon
PKG_VERSION:=0.4.0
PKG_RELEASE:=1

include ../nuci-app.mk

$(eval $(call BuildPackage,$(PKG_NAME)))

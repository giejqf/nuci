#!/bin/sh
# SPDX-License-Identifier: Apache-2.0
# Record ubus contract fixtures from the lab router (see tools/record-ubus.mjs).
set -eu
cd "$(dirname "$0")/.."
# shellcheck disable=SC1091
. tools/qemu/.env
export NUCI_ROOT_PASSWORD
exec node tools/record-ubus.mjs "$@"

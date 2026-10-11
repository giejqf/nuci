# SPDX-License-Identifier: Apache-2.0
# Minimal x86_64 environment for the OpenWrt SDK (used on non-x86_64 hosts).
FROM debian:bookworm-slim
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
	build-essential ca-certificates curl file gawk git libncurses-dev python3 \
	python3-setuptools rsync unzip wget xz-utils zstd bzip2 \
	&& rm -rf /var/lib/apt/lists/*

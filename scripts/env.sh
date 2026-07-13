#!/usr/bin/env bash
# Source this before using cargo/rustc. The Rust toolchain + headless-browser deps
# live OUTSIDE the repo, on a persistent mount (NOT ~/.cargo, which is wiped on
# container rebuild) — by default a `.toolchain/` dir alongside the repo.
#
# Override the location by exporting TINE_TOOLCHAIN before sourcing, e.g.
#   TINE_TOOLCHAIN=$HOME/.tine-toolchain source scripts/env.sh

# Resolve the repo root from this script's own path (works when sourced), then
# default the toolchain to a sibling `.toolchain/` of the repo.
_env_sh_dir="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
_repo_root="$(cd "$_env_sh_dir/.." && pwd)"
: "${TINE_TOOLCHAIN:=$(cd "$_repo_root/.." && pwd)/.toolchain}"

export CARGO_HOME="$TINE_TOOLCHAIN/cargo"
export RUSTUP_HOME="$TINE_TOOLCHAIN/rustup"
export PATH="$CARGO_HOME/bin:$PATH"

# Keep Cargo's build cache on the persistent toolchain mount, not in the repo, so
# `git clean` and container rebuilds don't force a cold recompile (a full cold
# build is ~9 min on this host; a warm incremental one is seconds). ./target is a
# symlink into $TINE_TOOLCHAIN/target, so the scripts that read ./target/release/…
# keep working unchanged.
export CARGO_TARGET_DIR="$TINE_TOOLCHAIN/target"
# Migrate a real in-repo target/ onto the persistent mount once (a fresh checkout,
# or cargo ran before this was sourced): rename when the cache doesn't exist yet
# (instant on the same fs), else merge without clobbering. Then keep ./target as a
# symlink so scripts that read target/release/… work unchanged.
if [ -e "$_repo_root/target" ] && [ ! -L "$_repo_root/target" ]; then
  if [ ! -e "$CARGO_TARGET_DIR" ]; then
    mkdir -p "$(dirname "$CARGO_TARGET_DIR")" && mv "$_repo_root/target" "$CARGO_TARGET_DIR"
  else
    cp -an "$_repo_root/target/." "$CARGO_TARGET_DIR/" 2>/dev/null || true
    rm -rf "$_repo_root/target"
  fi
fi
mkdir -p "$CARGO_TARGET_DIR"
[ -L "$_repo_root/target" ] || ln -s "$CARGO_TARGET_DIR" "$_repo_root/target"

# Playwright browser + the few shared libs we extracted locally (no root), so
# headless Chromium screenshots work in this sandbox.
export PLAYWRIGHT_BROWSERS_PATH="$TINE_TOOLCHAIN/ms-playwright"
export LD_LIBRARY_PATH="$TINE_TOOLCHAIN/extralibs/root/usr/lib/x86_64-linux-gnu:$LD_LIBRARY_PATH"

# The extracted WebKitGTK/GTK development bundle carries both libraries and its
# pkg-config metadata. Point native builds at that sysroot explicitly; relying on
# a caller's PKG_CONFIG_PATH made clean release builds fail even though the
# bundled .pc files were present alongside the libraries.
export PKG_CONFIG_SYSROOT_DIR="$TINE_TOOLCHAIN/extralibs/root"
export PKG_CONFIG_PATH="$TINE_TOOLCHAIN/extralibs/root/usr/lib/x86_64-linux-gnu/pkgconfig:$TINE_TOOLCHAIN/extralibs/root/usr/share/pkgconfig${PKG_CONFIG_PATH:+:$PKG_CONFIG_PATH}"

# Some host sessions inherit a half-active Conda toolchain (CC points at a
# compiler that is no longer on PATH, while flags still point into Conda's
# sysroot). Native Rust crates such as ring obey those variables and then fail
# before rustc runs. Drop only stale/Conda-specific overrides; valid caller
# toolchain choices remain intact.
_drop_missing_tool_override() {
  local var="$1"
  local value="${!var:-}"
  if [ -n "$value" ] && ! command -v "${value%% *}" >/dev/null 2>&1; then
    unset "$var"
  fi
}
for _tool_var in CC CXX AR RANLIB NM LD STRIP; do
  _drop_missing_tool_override "$_tool_var"
done
unset -f _drop_missing_tool_override
unset _tool_var
case "${CFLAGS:-}" in *conda*) unset CFLAGS ;; esac
case "${CXXFLAGS:-}" in *conda*) unset CXXFLAGS ;; esac
case "${CPPFLAGS:-}" in *conda*) unset CPPFLAGS ;; esac
case "${LDFLAGS:-}" in *conda*) unset LDFLAGS ;; esac

unset _env_sh_dir _repo_root

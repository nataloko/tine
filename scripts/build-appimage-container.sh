#!/usr/bin/env bash
# Build a NON-NixOS-portable Tine AppImage in an ubuntu:22.04 container.
#
# Why: a Tauri AppImage built directly on the NixOS dev host links the /nix/store
# loader + glibc 2.42 and won't start on a stock distro. Building on Ubuntu 22.04
# (glibc 2.35) — the same base the release CI uses (.github/workflows/release.yml)
# — makes the artifact portable. See docs/diagram-editors-spec.md.
#
# One self-contained `podman run` provisions the CI's Linux deps + Node 20 + a
# rustup toolchain and builds, over a clean copy of the working tree. We do NOT
# use `podman build`: inside a rootless/nested sandbox its RUN steps can't mount a
# fresh procfs. Two flags make a container start in that sandbox:
#   --network=host     pasta/slirp can't open /dev/net/tun; share the host netns.
#   -v /proc:/proc     the kernel forbids mounting a fresh proc in a nested userns;
#                      bind the host's so crun doesn't try. (Both are harmless on a
#                      normal machine, so this script is portable.)
#
# Usage:   nix shell nixpkgs#podman -c scripts/build-appimage-container.sh
# Output:  ./Tine_<ver>_amd64.AppImage (copied to the repo root).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

ENGINE="${ENGINE:-}"
if [ -z "$ENGINE" ]; then
  if command -v podman >/dev/null 2>&1; then ENGINE=podman
  elif command -v docker >/dev/null 2>&1; then ENGINE=docker
  else echo "error: need podman or docker (e.g. 'nix shell nixpkgs#podman -c $0')" >&2; exit 1
  fi
fi
echo ">> engine: $ENGINE ($($ENGINE --version 2>/dev/null | head -1))"

# Rootless podman needs a signature policy + registry config; create the standard
# permissive defaults if a host without system-wide podman lacks them.
if [ "$ENGINE" = podman ]; then
  cfg="${XDG_CONFIG_HOME:-$HOME/.config}/containers"
  [ -f "$cfg/policy.json" ] || { mkdir -p "$cfg"; printf '%s\n' '{"default":[{"type":"insecureAcceptAnything"}]}' > "$cfg/policy.json"; echo ">> wrote $cfg/policy.json"; }
  [ -f "$cfg/registries.conf" ] || { mkdir -p "$cfg"; printf '%s\n' 'unqualified-search-registries = ["docker.io"]' > "$cfg/registries.conf"; echo ">> wrote $cfg/registries.conf"; }
fi

IMAGE=docker.io/library/ubuntu:22.04

# Persistent caches (crate registry, rust toolchain, cargo target, apt archives)
# so re-runs skip most of the download + recompile. Sibling of the repo, like the
# nix .toolchain/ (override with TINE_APPIMAGE_CACHE).
CACHE="${TINE_APPIMAGE_CACHE:-$(cd "$REPO_ROOT/.." && pwd)/.tine-appimage-cache}"
mkdir -p "$CACHE"/{cargo,rustup,target,apt}
echo ">> cache: $CACHE"

# Clean copy of the WORKING TREE (uncommitted changes included; not
# .git/node_modules/target/.toolchain/dist) — isolates the container build from
# the host's nix-built node_modules/target and toolchain.
STAGE="$(mktemp -d "${TMPDIR:-/tmp}/tine-appimage-src.XXXXXX")"
trap 'rm -rf "$STAGE"' EXIT
echo ">> staging source at $STAGE"
tar --exclude=./.git --exclude=./node_modules --exclude=./target \
    --exclude=./.toolchain --exclude=./dist \
    -cf - -C "$REPO_ROOT" . | tar -xf - -C "$STAGE"
mkdir -p "$STAGE/out"

echo ">> provisioning + building in $IMAGE (full Rust + WebKitGTK compile — slow on a cold cache)"
$ENGINE run --rm \
  --network=host -v /proc:/proc \
  -v "$STAGE":/work:Z \
  -v "$CACHE/cargo":/opt/cargo:Z \
  -v "$CACHE/rustup":/opt/rustup:Z \
  -v "$CACHE/target":/work/target:Z \
  -v "$CACHE/apt":/var/cache/apt/archives:Z \
  -e DEBIAN_FRONTEND=noninteractive \
  -e RUSTUP_HOME=/opt/rustup -e CARGO_HOME=/opt/cargo \
  -e APPIMAGE_EXTRACT_AND_RUN=1 -e NO_STRIP=1 \
  "$IMAGE" \
  bash -c '
    set -euo pipefail
    # Keep downloaded .debs (the archives dir is a cache mount).
    rm -f /etc/apt/apt.conf.d/docker-clean
    apt-get update
    apt-get install -y --no-install-recommends \
      build-essential curl wget file ca-certificates git pkg-config \
      libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev \
      libssl-dev libxdo-dev libayatana-appindicator3-dev \
      patchelf desktop-file-utils libfuse2 zsync
    if ! command -v node >/dev/null; then
      curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
      apt-get install -y nodejs
    fi
    export PATH=/opt/cargo/bin:$PATH
    if ! command -v cargo >/dev/null; then
      curl -fsSL https://sh.rustup.rs | sh -s -- -y --default-toolchain stable --profile minimal
    fi
    rustc --version && node --version
    cd /work
    npm ci
    # beforeBuildCommand (tauri.conf.json) runs `npm run build` (wasm-pin + vite).
    # appimage only; updater artifacts off (they need a signing key).
    npx tauri build --bundles appimage --config "{\"bundle\":{\"createUpdaterArtifacts\":false}}"
    cp -v target/release/bundle/appimage/*.AppImage /work/out/
  '

shopt -s nullglob
built=("$STAGE"/out/*.AppImage)
if [ ${#built[@]} -eq 0 ]; then echo "error: no AppImage produced" >&2; exit 1; fi
for f in "${built[@]}"; do
  dest="$REPO_ROOT/$(basename "$f")"
  cp -f "$f" "$dest"
  echo ">> built: $dest ($(du -h "$dest" | cut -f1))"
done
echo ">> done. Test on a NON-NixOS machine: chmod +x *.AppImage && ./Tine_*.AppImage"

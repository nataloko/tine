#!/usr/bin/env bash
# Build a portable (non-NixOS) Tine AppImage in a rootless-podman ubuntu:22.04
# container. Tine's own toolchain lives on the NixOS host, whose glibc/loader an
# AppImage can't assume on other machines — so we build against Ubuntu's glibc
# (2.35) and the Ubuntu libwebkit2gtk-4.1 stack instead. Run it with:
#
#   nix shell nixpkgs#podman -c scripts/build-appimage-container.sh
#
# Caches (apt debs, cargo, rustup, target, node_modules) persist in a sibling
# ../.tine-appimage-cache/ so re-runs are fast (cold ≈ 20 min, dominated by the
# Rust/WebKitGTK compile; a warm frontend-only change is a few minutes). The
# container gets its OWN node_modules cache so it never clobbers the host's
# NixOS-built one. The finished AppImage is copied to the repo root.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CACHE="$(cd "$REPO/.." && pwd)/.tine-appimage-cache"
mkdir -p "$CACHE"/{apt,cargo,rustup,target,node_modules}

# Rootless podman needs a policy + registries file; podman isn't installed
# system-wide here, so create them if absent (harmless if they already exist).
mkdir -p "$HOME/.config/containers"
[ -s "$HOME/.config/containers/policy.json" ] || \
  printf '%s\n' '{"default":[{"type":"insecureAcceptAnything"}]}' > "$HOME/.config/containers/policy.json"
[ -s "$HOME/.config/containers/registries.conf" ] || \
  printf '%s\n' 'unqualified-search-registries = ["docker.io"]' > "$HOME/.config/containers/registries.conf"

# --network=host: rootless pasta/slirp can't open /dev/net/tun here.
# -v /proc:/proc: the kernel forbids mounting a fresh procfs in a nested userns;
#                 bind-mounting the host /proc makes crun skip it so the container starts.
podman run --rm \
  --network=host \
  -v /proc:/proc \
  -v "$REPO":/work \
  -v "$CACHE/apt":/var/cache/apt/archives \
  -v "$CACHE/cargo":/root/.cargo \
  -v "$CACHE/rustup":/root/.rustup \
  -v "$CACHE/target":/work/target \
  -v "$CACHE/node_modules":/work/node_modules \
  -w /work \
  ubuntu:22.04 \
  bash -euo pipefail -c '
    export DEBIAN_FRONTEND=noninteractive
    # Keep downloaded .debs (the default docker image auto-deletes them) so the
    # apt cache mount actually speeds up the next run.
    rm -f /etc/apt/apt.conf.d/docker-clean
    printf "Binary::apt::APT::Keep-Downloaded-Packages \"true\";\n" > /etc/apt/apt.conf.d/keep-debs
    apt-get update
    apt-get install -y --no-install-recommends \
      libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev libayatana-appindicator3-dev \
      patchelf build-essential curl wget file libssl-dev libxdo-dev \
      ca-certificates pkg-config git xz-utils libfuse2

    # Node 20 (NodeSource) — skip if a cached layer already provided it.
    if ! command -v node >/dev/null 2>&1; then
      curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
      apt-get install -y nodejs
    fi
    node --version

    # Rust via rustup, cached in /root/.rustup + /root/.cargo.
    export RUSTUP_HOME=/root/.rustup CARGO_HOME=/root/.cargo
    export PATH="$CARGO_HOME/bin:$PATH"
    if ! command -v cargo >/dev/null 2>&1; then
      curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable --profile minimal
    fi
    rustc --version

    npm ci
    # createUpdaterArtifacts is already false in tauri.conf.json (no signing key
    # needed); pass it again defensively so a stray true never blocks the build.
    npx tauri build --bundles appimage --config "{\"bundle\":{\"createUpdaterArtifacts\":false}}"

    echo "--- built bundle ---"
    ls -la /work/target/release/bundle/appimage/

    # Prove portability from INSIDE the container (patchelf/objdump live here, not
    # on the NixOS host): the packaged binary must use the standard loader, cap out
    # at glibc <= 2.34, and carry no /nix/store references.
    tinebin=/work/target/release/bundle/appimage/Tine.AppDir/usr/bin/tine
    if [ -x "$tinebin" ]; then
      echo "--- portability check ---"
      echo -n "interpreter: "; patchelf --print-interpreter "$tinebin"
      echo -n "max GLIBC symbol: "; objdump -T "$tinebin" 2>/dev/null | grep -oE "GLIBC_[0-9.]+" | sort -V | tail -1
      echo -n "nix-store refs: "; ( patchelf --print-rpath "$tinebin"; objdump -p "$tinebin" 2>/dev/null | grep -iE "rpath|runpath" ) | grep -c "/nix/store" || true
    fi
  '

# Copy the finished AppImage out to the repo root for testing.
cp "$CACHE"/target/release/bundle/appimage/*.AppImage "$REPO"/
echo "=== copied to repo root: ==="
ls -la "$REPO"/*.AppImage

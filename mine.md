# mine — my Tine

A personal, parallel build of [Tine](https://github.com/martinkoutecky/tine) (the fast,
local, Logseq-compatible outliner) that carries a few extra features upstream doesn't have.
It reads and writes the *same* Logseq graph as stock Tine — no import/export, no lock-in — so
switching between this and upstream (or Logseq) is just opening the same folder.

The name is a small pun: it rhymes with **Tine**, and it's **mine**.

**What's added** is listed and explained in **[extras.md](extras.md)**. In short: bullet
threading, a readable formula query-filter, and a dedicated **"mine (extras)"** Settings tab
where the fork's toggles live.

## Branches

- **`mine`** — the integration branch: upstream `master` **plus every extra feature**. This is
  the branch releases are built from. New features get merged in here.
- **`feat/*`** — one clean branch per feature (`feat/bullet-threading`, `feat/query-filter`, …),
  kept isolated so any one could be handed to upstream as a written spec if the maintainer ever
  wants it. They merge into `mine`; `mine` never merges back into them.
- **`master`** — tracks **upstream** `martinkoutecky/tine`, untouched. Merge it into `mine`
  periodically to stay current:

  ```bash
  git fetch origin
  git checkout mine
  git merge master        # bring in upstream changes
  ```

## Releases

Push a **`mine-v*`** tag on `mine` and GitHub Actions
(`.github/workflows/personal-build.yml`) builds a portable Linux **AppImage** + a **Windows**
installer and publishes a Release titled **"Tine — nataloko extras"**:

```bash
git tag mine-v0.4.8 && git push fork mine-v0.4.8
```

The AppImage embeds update-information, so [GearLever](https://mijorus.it/projects/gearlever/)
auto-detects new versions. The built-in Tauri auto-updater is **off** (this fork never silently
updates itself to an upstream, feature-less release).

## Build locally (non-NixOS AppImage)

The host here is NixOS, whose glibc/loader an AppImage can't assume elsewhere, so the AppImage is
built inside an Ubuntu container:

```bash
nix shell nixpkgs#podman -c scripts/build-appimage-container.sh
```

The result lands in the repo root and runs on any glibc ≥ 2.34 Linux. **It won't launch on the
NixOS host itself** — to try features locally without a second machine, use `npm run dev`
(the whole UI against a mock graph, no build needed).

# Workspace Reset Guide

This document explains how to bring the repository back to a working state when local dependencies or build artifacts have been removed.

## 1. Toolchain prerequisites

- Node.js 20.x (matching the `.nvmrc` / Firebase functions runtime).
- Corepack enabled so the declared package managers can be used:
  ```bash
  corepack enable
  corepack prepare pnpm@10.17.0 --activate
  ```
- Firebase CLI (`npm install -g firebase-tools`) when deployment or emulators are needed.

> **Tip**: When running inside a sandbox or restricted network, confirm that `registry.npmjs.org` is reachable. Package installation will hang or throw `EAI_AGAIN` if DNS/egress is blocked.

## 2. Restore backend (Firebase Functions)

```bash
cd functions
npm install
npm run build           # TypeScript compile check
npm run lint            # Optional but recommended
```

Artifacts are emitted under `functions/lib`. The build must finish cleanly before deploying functions.

## 3. Restore frontend (Vite + React)

The frontend repo is configured for pnpm via the `packageManager` field. Using npm can work, but pnpm avoids optional binary mismatches (for Rollup, esbuild, etc.).

```bash
cd web
pnpm install            # or: npm install
pnpm run build          # runs tsc + vite build
pnpm run dev            # start local dev server
```

If `pnpm install` fails with `EAI_AGAIN`, network access to the npm registry is unavailable. Options:

1. Retry after fixing DNS/proxy settings so `registry.npmjs.org` resolves.
2. Perform `pnpm install` on another machine, then copy the resulting `node_modules` folder into `web/` as a stop-gap (not ideal long term).
3. Download tarballs manually via a machine with network access, cache them under `~/.pnpm-store`, and rerun `pnpm install --offline`.

## 4. Verification checklist

- `functions`: `npm run build` and (optionally) `npm run lint` succeed.
- `web`: `pnpm run build` emits `dist/` without errors.
- Firebase security rules: `firebase deploy --only firestore:rules` (optional) to ensure syntax validity.
- Emulator workflow: `firebase emulators:start` from the repo root should start Functions + Firestore using the installed dependencies.

## 5. Common issues

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `Cannot find module '@rollup/rollup-linux-x64-gnu'` | Incomplete install, optional binary skipped by npm | Use pnpm (preferred) or delete `web/node_modules` and reinstall with working network. |
| `Exit handler never called!` during `npm install` | npm 10 bug triggered when install is interrupted | Remove `node_modules` and lock file, retry with stable network or pnpm. |
| `EAI_AGAIN` errors | DNS/egress blocked | Configure DNS/proxy or run install where network is allowed. |

## 6. Suggested workflow

1. Ensure dependencies install cleanly on both `functions/` and `web/`.
2. Run `pnpm run dev` (frontend) and `npm run serve` (backend) for local validation.
3. Commit only source changes; keep generated assets (`dist/`, `lib/`) out of version control.
4. Before deployment, run `npm run build && pnpm run build` to validate both sides.

Keeping this checklist nearby will help recover the workspace quickly when dependencies are cleared or the environment moves to a new machine.

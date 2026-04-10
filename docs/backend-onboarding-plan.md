# Backend Onboarding UX — Implementation Plan

## Problem (with file references)

A user who installs only the browser extension hits a wall. Concretely:

- `defaultConfig.backend.isInstalled` defaults to `false` — `browser-ext/contexts/AppConfig.tsx:135`
- The flag is flipped by a manual button labeled **"Simulate Install"** — `browser-ext/components/SettingsTab.tsx:260`
- The "Test" button next to the URL field is a no-op (no `onClick`) — `browser-ext/components/SettingsTab.tsx:278`
- `backend.isInstalled` is a hard gate on PromptsTab, ComposeTab AI, SettingsTab AI/Sync sections, StatusBar, and the background sync alarm
- Meanwhile, the backend already exposes a perfectly good `GET /api/v1/health` — `api/app/routes/health.py:8` — that nothing in the extension actually calls
- CORS already allows `chrome-extension://*` and `moz-extension://*` — `api/app/main.py:46` — so reachability isn't the blocker

The wiring exists on both sides; the extension just never makes the call.

## Goal

Replace the manual flag with live detection so anyone running the backend gets connected with zero clicks, and anyone without it sees a clear, actionable setup path instead of a "Not Found" dead end.

## Out of Scope (deliberately)

- Fully degraded IndexedDB-only mode (large design change, deserves its own plan)
- Code signing for Windows/Mac binaries
- The Phase 6 cloud-AI fallback already in flight on this branch
- An installer/.dmg/.msi — releases-page binaries are enough for v1

## Phases

### Phase A — Live `/health` detection (HIGH leverage, LOW risk) ⭐ THIS ROUND

The biggest single win. Eliminates step 3 of current onboarding entirely.

1. Add `pingBackend(url): Promise<boolean>` to `browser-ext/lib/api.ts`
   - `GET ${url}/api/v1/health` with `AbortSignal.timeout(2000)`
   - Returns `boolean`; never throws (network failure is the negative result)
2. Add `useBackendHealth()` hook in `browser-ext/hooks/`
   - Pings on mount, on `config.backend.url` change, every ~30s while sidebar open, and on `window.online` event
   - Updates `config.backend.isInstalled` via `updateConfig`
   - Debounces: only flips `true→false` after 2 consecutive failures (prevents flapping on a slow machine)
3. Mount the hook once at the `Sidebar` root
4. One-shot ping in `browser-ext/entrypoints/background.ts` on `runtime.onStartup` so the flag is correct before the sidebar opens
5. Remove the "Simulate Install" button (`SettingsTab.tsx:254-261`); leave the indicator dot/label as a read-only status
6. Wire the existing "Test" button (`SettingsTab.tsx:278`) to call `pingBackend()` and surface the result inline

**Files touched:** ~5 (api.ts, new hook file, Sidebar.tsx, SettingsTab.tsx, background.ts). ~150 LoC.

### Phase B — Useful empty state (MEDIUM, follow-up)

Today, no-backend looks like a bug. Make it look like a setup task.

1. New `BackendSetupCard` component:
   - Detect platform via `navigator.userAgent` → show only the relevant install command
   - Tabs: "Download binary" (link to GH releases), "uv quickstart", "git clone (dev)"
   - Copy-to-clipboard buttons
   - Big "Retry connection" button calling `pingBackend()`
2. Render it in PromptsTab and at the top of SettingsTab when `!isInstalled`
3. Soften the "Requires Backend" lock overlays in SettingsTab to link back to the setup card

### Phase C — Ship actual release artifacts (MEDIUM, follow-up)

`api/l1br3.spec` and `api/build.sh` already exist, but nothing produces release binaries.

1. Verify `l1br3.spec` builds cleanly on Linux today (smoke test before CI work)
2. Add `.github/workflows/release.yml`
   - Trigger: tag push `v*`
   - Matrix: macos-latest, windows-latest, ubuntu-latest
   - Runs `just build-api`, uploads `dist/l1br3*` to a GitHub Release
3. Update README + `BackendSetupCard` to link to the latest release
4. Smoke-test the produced binary on at least one OS

### Phase D — Optional auto-start (LOW priority, defer)

- `--install-service` / `--uninstall-service` flags on `app.main`
- macOS LaunchAgent plist, Linux systemd user unit, Windows Task Scheduler
- Strictly opt-in, never default-on

## Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Health ping flaps on slow machines | LOW-MED | 2s timeout + 2-failure debounce before flipping `true→false` |
| Removing "Simulate Install" breaks dev/demo workflow | LOW | Keep it behind `import.meta.env.DEV` if needed |
| Stored config has stale `isInstalled: true` for existing users | LOW | Live check always wins on hydration; no migration needed |
| Polling localhost from an extension looks like port-scan to defenders | LOW | Single fixed path on the user's own machine, no enumeration |
| PyInstaller binary AV false-positives on Windows | MED (Phase C only) | Document as known caveat for v1; code signing later |

## Decisions for Phase A (defaults chosen)

1. **Scope**: Phase A only this round.
2. **Background polling**: only on `runtime.onStartup` — no periodic ping when the sidebar is closed (battery).
3. **Phase 6 messaging**: ignored for Phase A. Revisit in Phase B copy work.
4. **Field name**: keep `backend.isInstalled` to minimize churn. It's now a derived signal but the name still reads sensibly.

## Estimated Complexity

- **Phase A**: LOW — small, mechanical, well-bounded
- **Phase B**: MEDIUM — design + copy + multi-tab integration
- **Phase C**: MEDIUM — CI matrix work + cross-platform smoke testing
- **Phase D**: HIGH — service registration is a tarpit on every OS

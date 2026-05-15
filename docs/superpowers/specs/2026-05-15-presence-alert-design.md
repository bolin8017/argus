# Presence alert — design spec

**Status:** Approved (2026-05-15)  
**Product:** Argus — tell the user when someone is behind them (webcam / rear-facing use).  
**Repo:** https://github.com/bolin8017/argus · deployed at https://argus-bnl.pages.dev/

## Goals

- Alert when a **person** is detected (Phase 1 only; do not wait for Phase 2 face).
- **User-configurable channels** via UI: in-page sound, system notification, in-page visual indicator.
- **Shared thresholds** so all enabled channels fire on the same logic.
- No external apps (LINE, Telegram, desktop agents). v1: no Service Worker.
- Minimal or no notification text; user understands thresholds from UI settings.
- Do not show person count.

## Non-goals (v1)

- Service Worker / push when tab is closed.
- Long notification copy or localization beyond existing zh-Hant UI.
- Using face detection as alert gate.
- Changing COOP/COEP/CORP in `server.mjs` or `public/_headers`.

## Architecture

```
src/presence/
  settings.js       — defaults, localStorage load/save, validation
  state.js          — absent ↔ present state machine (frame counts, hysteresis, interval timer)
  channels/
    sound.js        — Audio unlock on user gesture, play beep, test button
    notification.js — Notification permission + fire (minimal/empty body)
    visual.js       — stage class / indicator lamp (no long text)
  coordinator.js    — tick(tracks) each frame after PersonPipeline.detect
```

`src/app.js` calls `coordinator.tick(tracks)` from `onFrame` after `state.lastTracks` is updated. Stop button resets coordinator and clears visual state.

## Shared thresholds (all channels)

| Setting | Meaning | Default |
|---------|---------|---------|
| `consecutiveFrames` (N) | Frames with ≥1 person before **present** | **1** |
| `useConfirmedOnly` | If true, count only `track.confirmed`; else any person detection/track | **false** (any box at N=1) |
| `minScore` (optional, advanced) | Minimum detection score | e.g. **0.35**, hidden in advanced |
| `leaveFrames` (M) | Consecutive frames with no person before **absent** | **N** or **N+2** (advanced) |
| `repeatIntervalSec` | While **present**, re-fire every N seconds; **0** = only on absent→present edge | **0** |

**Edges:**

- **absent → present:** fire all **enabled** channels immediately (after N frames satisfied).
- **present → present:** if `repeatIntervalSec > 0`, fire again each interval while still present.
- **present → absent:** reset interval timer; no fire on absent.

## UI (index.html + CSS)

### Section: Alert settings (below controls)

**Channels (checkboxes):**

| Key | Label (zh-Hant) | Default |
|-----|-----------------|---------|
| `sound` | 頁內提示音 | on |
| `notification` | 系統通知 | off |
| `visual` | 頁內燈號 | on |

**Shared:**

- 連續幀數 (number 1–30)
- 間隔秒數 (number 0–300)

**Advanced (collapsed):**

- 僅使用已確認追蹤 (confirmed only)
- 最低信心
- 離開遲滯幀數

**Per-channel (when enabled):**

- Sound: volume slider, **測試音** button
- Notification: permission status + link hint if denied
- Visual: optional strong emphasis (e.g. stage border)

**Status (read-only):**

- Notification permission: default / granted / denied
- Audio: locked / unlocked

Persist all settings in `localStorage` under a versioned key (e.g. `argus.alertSettings.v1`).

## Channel behavior

### In-page sound

- Unlock `AudioContext` or `HTMLAudioElement` on **Start** click (user gesture).
- Short beep on trigger; respect volume slider.
- **Test** button plays once without requiring detection.

### System notification

- Request permission when user enables channel and starts session (or on first trigger if `default`).
- Body/title: empty or minimal (e.g. app name only); rely on system sound/vibration.
- If `denied`: do not spam; show inline hint to enable in browser settings.
- Skip if permission not `granted`.

### Visual

- Indicator: 無人 / 有人 (color or dot); optional `stage` class when present.
- Works even when sound/notification off (accessibility / no headphones).

## Integration with existing code

- Input: `tracks` from `PersonPipeline.detect()` (`src/pipeline/person.js`, `src/tracker/bytetrack-lite.js`).
- `confirmed` = `hits >= minHits` (default 3); `useConfirmedOnly` bypasses need for confirmed when false.
- Do not block inference loop; coordinator work must be cheap (counters + occasional audio/notification).

## Lifecycle

| Event | Action |
|-------|--------|
| Start | Unlock audio; optionally request notification permission if channel enabled |
| Each frame | `coordinator.tick(tracks)` |
| Stop | Reset state machine; clear visual; no further alerts |
| Settings change | Apply on next tick; persist to localStorage |

## Platform notes (document in README or footer)

- Requires **HTTPS** (Pages OK).
- Tab should stay open; audio may be throttled in background; notifications more reliable in background on some OSes.
- Mobile Safari: camera + background behavior stricter; set expectations in one line of copy.

## Testing (manual)

1. Defaults: sound + visual on; N=1; interval=0 → one beep + lamp on first person; lamp off when leave.
2. Interval=30 → repeat beep every 30s while person remains.
3. Disable all channels → only HUD tracks change, no beep/lamp/notification.
4. Enable notification, grant permission → system notification on edge (and on interval if set).
5. Deny notification → inline hint; sound/visual still work if enabled.
6. Stop → no further alerts.
7. `npm run build && npm run verify:pages` still passes.

## Defaults for new users

- sound: on, notification: off, visual: on  
- consecutiveFrames: 1, repeatIntervalSec: 0  

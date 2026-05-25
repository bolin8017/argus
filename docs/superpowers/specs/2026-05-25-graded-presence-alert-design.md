# Graded presence alert - design spec

**Status:** Approved (2026-05-25)  
**Product:** Argus - lightweight rear-facing presence alerts.  
**Builds on:** `docs/superpowers/specs/2026-05-15-presence-alert-design.md`

## Goals

- Keep Argus a lightweight reminder tool, not a monitoring dashboard.
- Split the current single `有人` alert into factual severity levels.
- Use different sound patterns for `有人` and `偵測到臉`.
- Let users choose simple sensitivity presets in the main UI.
- Let advanced users tune thresholds without exposing that complexity by default.
- Keep all logic browser-only and compatible with the current person and face pipelines.

## Non-goals

- True gaze or eye-contact estimation.
- Screenshots, video recording, event history, replay, or identity recognition.
- Push notifications after the browser tab is closed.
- External apps, desktop agents, or server-side processing.
- Showing person count in the main alert UI.

## Event model

The UI should name states by observed facts. It should express risk through sound, color,
and priority rather than by overclaiming what the model knows.

| Priority | State label | Meaning |
|----------|-------------|---------|
| 0 | `無人` | No person meets the configured person threshold. |
| 1 | `有人` | At least one person meets the person threshold, but no qualifying face is detected. |
| 2 | `偵測到臉` | A face is detected inside a qualifying person track. |

If more than one state qualifies in the same tick, the coordinator emits only the highest
priority state. For example, if a person enters the frame and a face is already detected,
Argus should play only the `偵測到臉` sound, not `有人` followed by `偵測到臉`.

## Sensitivity UI

The main settings panel should stay simple:

- Notification channels: `頁內提示音`, `系統通知`, `頁內燈號`.
- `提醒模式`: `安靜`, `標準`, `敏感`, `自訂`.
- Sound volume and test controls.

Advanced settings should hold detailed thresholds:

- Person consecutive frames.
- Minimum person count.
- Person minimum confidence.
- Leave hysteresis frames.
- Face sample time window.
- Required face hits in the time window.
- Shared repeat interval.

Changing any advanced value should switch `提醒模式` to `自訂`.

## Presets

Presets should map to explicit settings so the UI stays predictable:

| Mode | Person frames | Min people | Min score | Face window | Face hits | Leave frames | Repeat interval |
|------|---------------|------------|-----------|-------------|-----------|--------------|-----------------|
| `安靜` | 5 | 1 | 0.40 | 3000 ms | 2 | 8 | 30 sec |
| `標準` | 2 | 1 | 0.35 | 2000 ms | 2 | 4 | 10 sec |
| `敏感` | 1 | 1 | 0.30 | 1500 ms | 1 | 2 | 5 sec |

All presets should keep `useConfirmedOnly` off by default. The user can still enable it from
advanced settings.

## Detection architecture

Keep the existing person state machine for `有人`:

- Input: tracks from `PersonPipeline.detect()`.
- Existing controls: consecutive frames, minimum person count, minimum score, confirmed-only,
  repeat interval, and leave hysteresis.
- Output: whether person presence is currently active.

Add a face presence state for `偵測到臉`:

- Input: faces from `FacePipeline.detect()` and their `trackId`.
- Store recent face detector samples by `trackId`.
- Qualify `偵測到臉` when the configured sample window contains enough face hits.
- Expire old samples so a stale cached face does not keep the state active forever.

This should use a time window or sampled-detection window, not pure consecutive video frames.
The current face pipeline is throttled, so frame-by-frame face streaks would behave differently
on fast and slow devices. Count only fresh face detector samples, not repeated frames that reuse
cached face boxes.

## Coordinator behavior

The coordinator should produce a single alert state per tick:

1. Evaluate person presence.
2. Evaluate face presence only for qualifying person tracks.
3. Pick the highest qualifying state.
4. Update visual state.
5. Fire enabled channels only when:
   - state enters a higher alert level,
   - state changes from `無人` to an alert state, or
   - the repeat interval for the current level has elapsed.

Downgrades should update the visual state without playing a sound by default.

## Channel behavior

### Sound

Sound should distinguish severity without becoming noisy:

- `有人`: soft short single tone.
- `偵測到臉`: clearer double tone or higher-pitched pattern.

The test control should let the user test each event sound. Volume stays shared across
event sounds.

### Visual

The small status lamp should show three states:

- `無人`
- `有人`
- `偵測到臉`

Visual emphasis should remain subtle. The UI should not imply eye-contact detection.

### System notification

System notifications should stay minimal:

- Keep the notification title as `Argus`.
- Use the event label as the short notification body.
- Do not include screenshots, person counts, or long explanatory text.
- Respect browser permission and existing denied-permission behavior.

## Copy guidelines

- Use factual labels: `無人`, `有人`, `偵測到臉`.
- Avoid labels like `可能被看見`, `正在看你`, or `被注視`.
- Explain the face level with helper text when needed: `臉部進入畫面，已提高提醒等級`.
- Keep advanced setting labels concrete and short.

## Lifecycle

| Event | Behavior |
|-------|----------|
| Start | Unlock audio and load the current alert settings. |
| Each detection tick | Evaluate person and face state, update visual state, and fire one alert when trigger conditions match. |
| Settings change | Persist settings and apply them on the next tick. |
| Stop | Reset person and face alert state, clear visual state, and stop firing alerts. |

## Manual test scenarios

1. Defaults: no one in frame shows `無人` and does not fire.
2. Person enters without visible face: state becomes `有人` and plays the person sound once.
3. Person enters with visible face: state becomes `偵測到臉` and plays only the face sound.
4. Person first appears without a face, then turns toward the camera: state upgrades to `偵測到臉`.
5. Person leaves: state returns to `無人` after leave hysteresis, with no exit sound.
6. `安靜`, `標準`, and `敏感` presets produce noticeably different sensitivity.
7. Changing advanced settings switches the mode label to `自訂`.
8. Disabling sound keeps visual and notification behavior intact.
9. Stopping the session prevents further alerts.
10. `npm run build && npm run verify:pages` still passes.

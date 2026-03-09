# URL Preset Schema

## Purpose

This document defines the URL hash preset payload for user preference sharing.

## Hash format

- Prefix: `#p=`
- Body: base64url-encoded JSON bytes
- Encoding: UTF-8 JSON -> base64url (unpadded)

## Payload shape

```json
{
  "schema": 1,
  "preferences": {
    "visuals": { "backgroundColor": "#000000", "particleColor": "#ffffff" },
    "trace": { "lines": false, "numLines": 5, "lineAlpha": 0.35, "lineWidthPx": 2, "lineColorMode": "fixed" },
    "particles": { "emitPerSecond": 180, "sizeMaxPx": 6, "sizeMinPx": 1, "sizeToMinSec": 3, "ttlSec": 6, "overlapRadiusPx": 6 },
    "motion": { "angularSpeedRadPerSec": 2.356194490192345, "waveformRadialDisplaceFrac": 0.18 },
    "audio": { "fftSize": 2048, "smoothingTimeConstant": 0.5, "rmsGain": 6, "minRadiusFrac": 0.01, "maxRadiusFrac": 0.8, "loop": true, "muted": false, "volume": 1 },
    "bands": { "count": 256, "floorHz": 10, "ceilingHz": 26000, "logSpacing": true, "overlay": { "enabled": true, "connectAdjacent": true, "alpha": 0.65, "pointSizePx": 3, "lineAlpha": 0.35, "lineWidthPx": 1, "phaseMode": "orb", "ringSpeedRadPerSec": 0.35 }, "rainbow": { "hueOffsetDeg": 0, "saturation": 0.9, "value": 1 }, "particleColorSource": "dominant" },
    "orbs": [
      { "id": "ORB0", "chanId": "R", "bandIds": [], "chirality": -1, "startAngleRad": 0 },
      { "id": "ORB1", "chanId": "L", "bandIds": [], "chirality": -1, "startAngleRad": 3.141592653589793 }
    ],
    "timing": { "maxDeltaTimeSec": 0.03333333333333333 }
  }
}
```

## Rules

1. `schema` is preferred and must be an integer when present.
2. Decode supports legacy Build 111 payloads that omitted the wrapper object and migrates them before apply.
3. Unknown or unsupported schema versions are rejected.
4. Decode always sanitizes `preferences` via `sanitizePreferences` before applying.
5. Presets include user-facing preferences only.
6. Presets **must not** include runtime-only state:
   - playlist contents
   - recording session state/chunks
   - live input permissions

## UX Actions

- **Share Link**: encodes current preferences, writes hash, and attempts clipboard copy.
- **Apply URL**: decodes current hash and applies sanitized preferences.
- **Reset Prefs**: restores defaults and updates runtime settings.

## Diagnostics

`Preset Debug` line in the status panel reports success/failure of share/apply/reset actions.

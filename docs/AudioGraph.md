# Audio Graph (Build 113 scaffold with AudioEngine)

## Text graph diagram

```text
[HTMLAudioElement]
      │
      ▼
[MediaElementSourceNode]
      ├── Playback path (speaker-facing)
      │     └─> [playbackGain] ──> [AudioContext.destination]
      │
      ├── Analysis path (visualization-facing)
      │     └─> [ChannelSplitterNode(2)]
      │            ├─ ch0 -> [L Analyser]
      │            ├─ ch1 -> [R Analyser]
      │            └─ ch0/ch1 -> [0.5 gain + 0.5 gain] -> [ChannelMergerNode(1)] -> [C Analyser]
      │
      └── Recording tap path (capture-facing)
            └─> [analysisTapGain (unity)] -> [MediaStreamDestination]
```

## Playback path

- Playback uses the `HTMLAudioElement` output routed through `MediaElementSourceNode`.
- Loop, mute, and volume are implemented on the media element and are **playback-only controls**.
- Speaker output is routed to `AudioContext.destination` through `playbackGain`.

## Analysis path

- Analysis uses a channel splitter and three analyzers:
  - Left analyzer (`L`)
  - Right analyzer (`R`)
  - Center analyzer (`C`)
- For each channel sample pass, the engine exposes:
  - `waveform: Float32Array`
  - `rms`
  - `energy01 = clamp(rms * rmsGain)`

## Center mix behavior

- Center is derived from **sum of L + R** via two 0.5 gains into a single-channel merger.
- This keeps center behavior explicit and inspectable.
- When right channel is effectively absent/silent, mono-ish detection marks that condition and downstream systems can prefer center/left fallback logic.

## Mono-ish detection

Mono-ish detection is configurable and explicit:

- `rightSilenceRms` threshold
- `correlationStride` for correlation sampling step
- `monoThreshold` correlation threshold

Computed per sample update:

- `rightEffectivelySilent = rightRms <= rightSilenceRms`
- `correlation = corr(leftWaveform, rightWaveform, stride)`
- `isMonoIsh = rightEffectivelySilent || correlation >= monoThreshold`

The result is surfaced as:

```text
monoIsh: {
  isMonoIsh: boolean,
  correlation: number,
  rightEffectivelySilent: boolean
}
```

## Teardown and lifecycle notes

On file replacement/unload/dispose, the engine does all of the following:

- pauses and resets playback to prevent zombie audio
- removes `ended` listener to avoid handler accumulation
- revokes previous object URL to prevent memory leaks
- clears media `src` and reloads the element
- resets mono-ish and analysis-facing status

`dispose()` additionally closes the `AudioContext`.

## Recording tap output

- `getRecordingTapStream()` exposes a `MediaStream` from `MediaStreamDestination`.
- The recording tap sits on a unity-gain branch from the media source.
- This branch is independent of playback mute/volume so future capture/export can remain correct even if speakers are muted.

## Playback-only control note

Loop, mute, and volume are intentionally playback-facing only. They are not allowed to silently alter analysis fidelity or future recording-tap signal unless a later design explicitly introduces that behavior.

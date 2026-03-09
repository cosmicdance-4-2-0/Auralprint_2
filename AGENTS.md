# AGENTS.md

## Mission

Build and maintain **Auralprint** as a modular, offline-capable web application: an **analyzer cosplaying as a visualizer**.

The product must remain:
- technically honest about the underlying signal,
- understandable by human maintainers,
- usable offline,
- extensible across planned builds without monolithic rewrites.

This repository is for **serious product software**, not a throwaway demo.

---

## Project identity

Auralprint is a real-time audio analysis and expressive rendering system.

Current canonical product direction:
- **Build 111 / v0.1.11** is the current canonical shipped baseline.
- **Build 112 / v0.1.12** adds scrubber + playlist/queue.
- **Build 113 / v0.1.13** adds recording / capture.
- Builds **114–120** extend input sources, orb targeting, camera, workflow, and 3D features.

Follow `roadmap.md` as the authoritative milestone map.

---

## Foundational engineering rules

### 1) Interfaces are canon; modules are mutable
- Preserve module boundaries and public contracts.
- Prefer replacing or improving internals over breaking interfaces.
- If an interface must change, update the contract docs in the same change.

### 2) No hidden state, no hidden variables, no magic numbers
- Every persistent or meaningful runtime value must have an owner.
- Every important constant must be named and live in config unless it is clearly justified as code-only.
- If a knob affects behavior, it must be:
  - exposed in UX, or
  - documented as code-only with a short justification comment.

### 3) Minimal, complete, functional
- Prefer simple modules with explicit responsibilities.
- Do not be clever at the expense of readability.
- Optimize for code a tired human can understand at 3AM.

### 4) Analyzer first, visualizer second
- The rendering must remain grounded in real signal analysis.
- Do not add “pretty but dishonest” behavior without explicitly naming it as an artistic mode.

### 5) Offline runtime is non-negotiable
- Runtime must have **zero network dependencies**.
- No CDN assets.
- No remote fonts.
- No telemetry or surprise network calls.
- Hosted mode is allowed; offline mode must still work.

### 6) Modular source, portable build
- Source code should remain modular and maintainable.
- Build outputs may be bundled/minified for portability.
- The packaged app must be usable from static hosting and, where required by the repo plan, from a portable offline bundle.

---

## Delivery model

When working on this repository, prefer this execution order:

1. Read the relevant contract/docs files.
2. Read the directly affected source files.
3. Summarize scope briefly.
4. Make the smallest coherent change that solves the problem.
5. Run the relevant checks.
6. Report exactly what changed.

Do not skip straight to “big refactor” unless the task explicitly demands it.

---

## Scope discipline

### Always do
- Keep diffs small and attributable.
- Preserve existing behavior unless the task explicitly changes it.
- Update docs/contracts when public behavior or interfaces change.
- Add comments where a future maintainer would otherwise be forced to reverse-engineer intent.

### Never do
- Do not refactor unrelated areas “while you are here.”
- Do not add runtime dependencies casually.
- Do not add hidden globals.
- Do not silently change file structure without explanation.
- Do not invent roadmap scope.
- Do not replace explicit configuration with hard-coded literals.

---

## Configuration discipline

The expected configuration model is:

- `CONFIG` = canonical truth, deep-frozen
- `preferences` = mutable user preference state
- `runtime.settings` = resolved, validated settings consumed by running systems

Rules:
- Running systems should consume `runtime.settings`, not raw preferences.
- Validation must clamp and normalize.
- Invariants must be enforced centrally.
- Runtime-only state must not be mixed into presets without intentional design.

Examples of runtime-only state:
- playlist contents
- active recording session
- permission grants
- transient UI visibility state unless intentionally persisted

---

## UX and control exposure rules

If a behavior matters to users or future tuning, expose it clearly.

Preferred order:
1. UX control
2. Config/default with clear name
3. Code-only knob with explicit justification

Never bury meaningful behavior in unexplained literals.

UI should remain:
- readable,
- responsive,
- keyboard-usable where reasonable,
- touch-tolerant where practical.

---

## Audio / analysis rules

Preserve these conceptual truths:
- playback path and analysis path are related but not identical concerns,
- mono/stereo/center analysis distinctions matter,
- smoothing, FFT size, and band aggregation are meaningful engineering choices,
- dominant-band logic is useful but not absolute truth.

Do not oversimplify signal behavior just to make visuals easier.

---

## Preset / schema rules

If touching presets:
- treat schema versioning as deliberate,
- preserve backward compatibility where practical,
- migrate older schemas explicitly,
- do not store runtime-only state in presets unless the change explicitly introduces that behavior.

---

## Recording / export rules

If touching recording/capture:
- WebM is the safe default unless browser support clearly permits something else.
- Separate:
  - source audio,
  - monitored/playback audio,
  - captured/exported audio.
- Cleanup must be correct:
  - stop tracks,
  - revoke blob/object URLs,
  - avoid memory leaks,
  - do not leave playback broken after recording ends.

---

## Performance rules

This app is real-time and interactive.

Prefer:
- bounded work per frame,
- capped dt handling,
- deliberate HUD update frequency,
- avoiding unnecessary DOM churn,
- avoiding per-frame allocations when easy to avoid.

Do not trade away clarity for premature micro-optimizations, but do respect frame-time costs.

---

## File safety rules

- Do not overwrite large files blindly.
- Do not rewrite generated outputs unless the task requires it.
- Do not delete files unless the task explicitly requires deletion.
- Do not use destructive git commands.
- Do not revert unrelated user changes.

If you encounter unexpected repo changes, stop and report them.

---

## Output format for substantial tasks

For non-trivial repository work, prefer this response structure:

1. **READ RECEIPT**
   - files inspected

2. **PLAN**
   - 3–7 bullets max

3. **FILES TOUCHED**
   - exact paths

4. **CHANGES MADE**
   - concise summary

5. **VERIFICATION**
   - commands run
   - results
   - known limitations if any

Keep it brief and factual.

---

## Stop conditions

Stop and report instead of guessing if:
- a task conflicts with `roadmap.md`,
- a requested change would break the modular architecture without an approved migration,
- required files or interfaces are missing,
- a change would introduce runtime network dependence,
- existing failing tests/checks appear unrelated to your change,
- you discover conflicting instructions at different repo levels.

---

## Review guidelines

When reviewing code in this repository, prioritize:
- regressions in shipped behavior,
- hidden state or hidden constants,
- broken offline/runtime assumptions,
- schema compatibility risks,
- unsafe teardown / cleanup,
- UI controls that exist but are not actually wired to the intended config,
- accidental scope expansion,
- security/privacy regressions,
- needless complexity.

Treat the following as high severity:
- playback or analysis corruption,
- recording/export breakage,
- preset data loss,
- runtime network calls,
- object URL / media / event-handler leaks,
- breaking canonical build behavior without explicit release intent.

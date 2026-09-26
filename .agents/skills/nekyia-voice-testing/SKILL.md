---
name: nekyia-voice-runtime-testing
description: Verify recorded audio, browser TTS handoff, mute, and music ducking in Nekyia through desktop and touch gameplay.
---

# Nekyia voice runtime testing

## Devin Secrets Needed
None for offline providers. Do not configure VITE_DIALOGUE_API or start the LLM service for an offline voice check.

## Setup
- Run Vite from the intended worktree. If another checkout already uses 5173, choose an explicit alternate port with `npm run dev -- --port 5174 --strictPort`.
- Use a fresh browser context so voice settings and unlock/save state do not leak from previous runs.
- For touch assertions, use an actual touch-emulated browser context, such as Playwright's Pixel 7 descriptor in landscape. Confirm `navigator.maxTouchPoints > 0` and `(pointer: coarse)` in the game page.
- Maximize each new browser window before capturing GUI evidence.

## Observe without changing gameplay
- Recorded voices use detached `new Audio(...)` elements: `document.querySelectorAll('audio')` alone may find nothing. Install a constructor observer before navigation and retain references to created elements while forwarding native playback unchanged.
- Observe `playing`, `pause`, `ended`, `error`, `currentTime`, duration and paused state. Two samples with advancing time and paused=false establish playback; a successful HTTP request alone does not.
- Wrap `speechSynthesis.speak/cancel` only to log and forward calls. Observe utterance start/error independently: invocation is not evidence that speech actually played.
- If Chromium reports zero voices and `synthesis-failed`, report the environment limitation. Do not claim audible TTS success.
- In Vite, a read-only import of `/src/core/music.ts` exposes the existing music singleton for observing gain and ducked state. Do not change its values.

## Reliable gameplay sequence
- Use a deterministic `?seed=...&debug=1` run. Start a hero via the menu/card, then descend while its clip is active to verify a trial clip pauses/replaces it.
- FloorIntroScene auto-descends after approximately nine seconds; a late "descend" tap may actually skip the newly opened trial clip. Observe the active scene before tapping.
- Complete trial dialogue normally. The shipped B debug key reaches a boss; N reaches later floors for an unrecorded speaker. These keys are setup shortcuts, not evidence of normal combat progression.
- Check M during an actively playing clip, and voice-tag tap separately in touch mode. Require pause before duration, cancelled TTS, muted label, unchanged dialogue line; unmute should submit the current line to TTS.
- Enter/tap skips the intro before advancing dialogue. Finish lines/options/reply normally, then check no active recorded playback and music restored after its gain ramp.
- Fetch all public `/voices/*.mp3` through the browser and record HTTP status, MIME type and nonempty size; this does not prove every speaker route or audible content.
- A rapid intentional skip can interrupt a pending play promise and emit an AbortError warning. Report it separately from decode/network failures and preserve strict console-cleanliness results honestly.

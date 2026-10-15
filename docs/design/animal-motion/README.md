# Distinct animal speaking motion

Implemented on 2026-10-08 after the user requested complete deletion of the four identified unused selectors, floating motion, a slow wolf head turn, elephant trunk movement, and subtle eagle feather/beak movement.

`src/components/yama/AgentPortrait.tsx` now uses the unchanged finer PNGs inside a layered SVG. Hand-placed clipping paths identify the moving anatomy. A complementary stationary-body mask removes each part's original position so it does not leave a duplicate behind. SVG IDs are unique per portrait, including when multiple copies of an agent appear on screen. No source pixels were edited, no new images were generated, and no dependency was added. This is a 2D illustration rig; the wolf's yaw is a perspective effect, not a new 3D view.

| Animal | Speaking movement |
| --- | --- |
| Eagle / Saathi | Small lower-beak openings with pauses, separate back-feather drift and breast-feather breathing. |
| Wolf / Drishti | A slow 8.8 second head yaw and small tilt over a steadier neck. |
| Elephant / Disha | A 6.4 second lower-trunk swing, with a separately bending tip. |
| All three | A 7.2 second vertical float of up to 3% of the portrait height. The green outer boundary stays steady. |

Only speaking portraits mount the rig; idle and paused states use the intact still artwork. Existing voice playing, pause, stop, and handoff rules remain authoritative. Text reply arrival keeps its existing 2.4 second cue. These decorative movements are not phoneme-driven lip sync. Voice remains a caption preview with the microphone off. Reduced-motion CSS disables all float and part animations while retaining the static green boundary.

The following CSS selectors were deleted completely from live source, including the mobile duplicate: `.acknowledgement`, `.acknowledgement input`, `.approval-footer .small-muted`, and `.voice-speaker > svg`. The superseded `agent-speak` keyframe and portrait image rules were also removed as part of replacing the renderer. Live approval-footer styles remain.

`npm run check` passes TypeScript, lint, 49 tests across six files, and the production build. A new regression test prevents SVG image, clip, and mask references from escaping their own portrait or colliding across instances. Existing speaking-state, focus, correction, provenance, handoff, and confirmation tests pass. Browser review confirms separate animated part transforms, still body transforms, pause/handoff removal of moving layers, and the steady green boundary. At 320 px, Hindi wraps without horizontal overflow. At the normal 630 × 704 view, the larger portrait fits and the composer remains within the viewport.

Saved evidence includes `elephant-desktop.png`, `elephant-hindi-mobile.png`, `wolf-desktop.png`, and `wolf-normal.png`. `wolf-motion.png` is an animated PNG recording of approximately 8.8 seconds in the actual 630 px browser, assembled from 47 native screenshots with their capture intervals preserved. Screenshot samples do not represent the live animation's full frame rate. No production artwork was edited for the recording. Actual full-rate movement is reviewable in the open localhost preview.

The voice portrait increases from 44 px to 88 px in short, medium-width views (481–760 px), including the normal 630 px in-app browser. This makes anatomical motion easier to read without using the compact phone treatment on a wider view. The 320 px layout retains its 44 px portrait. BeautifulUI foundation, component styling, colour overrides, and fonts are unchanged. Broader visual-design approval remains outstanding. Manual screen-reader review, reduced-motion browser emulation, physical-phone review, and live Sarvam audio integration remain outstanding.

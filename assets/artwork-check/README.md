# ASCII Magic artwork check

Verified 2026-10-07 through the authenticated ASCII Magic MCP on the Free plan.

- `source.png`: original geometric sample created locally; no incident or account data.
- `dither.png`: saved 512 × 512 render using the free Dither style, original-colour palette, Atkinson algorithm, cell size 4, and no chromatic post effect.
- `recipe.json`: reusable recipe and decoded engine settings. Rendering the same source with this recipe produced a pixel-identical image, checked with Pillow.
- `editor-export.jpg`: browser evidence of Dither animation and GIF export controls.

Recipe encoding and decoding passed. This sample establishes tool access and reproducibility; it is not the final Saathi, Drishti, or Disha artwork.

In the browser editor, enabling Animation exposed GIF and MP4 animation formats without an upgrade prompt. A 512 × 512, 3-second, 15 fps GIF export was attempted, but no download event arrived within 30 seconds. The browser session was signed out. **Successful animated export remains unverified.**

The saved PNG remains available locally after the service's temporary render link expires. Future animated avatars also need a static fallback and application-controlled pause/reduced-motion behavior.

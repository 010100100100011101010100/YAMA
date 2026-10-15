# Yama animal identities

**Current display:** the latest request rejects the coarse pixelation documented below. The frontend now uses the original finer portraits with `image-rendering: auto`, a green speaking boundary, and [distinct head, trunk, beak, and feather motion](../animal-motion/README.md). The coarse outputs and recipes remain historical. See [current artwork provenance and verification](../beautifului-original-css/README.md).

The latest request replaces the emoji-like birds with a medium-pixelated eagle, wolf, and elephant. The implemented mapping is Saathi → eagle, Drishti → wolf, Disha → elephant. This mapping was stated before implementation and remains reviewable.

Original portraits were generated and edited with the built-in imagegen tool, then rendered through ASCII Magic's free Dither style: Bayer4, Grey4, contrast 110, scale 1, enhancement off. Each is a 1254 × 1254 transparent PNG. `artwork.json` records the asset paths, file hashes, and reusable recipe. The logical grid sizes below are prompt targets; no exact grid size is claimed for the generated artwork.

The frontend serves the original PNGs without lossy optimization and uses `image-rendering: pixelated`. Portraits render at 48 px in the desktop rail and 32 px in message headers and the mobile rail. Names and roles remain text; decorative images have empty alt text. The same mapping appears in chat and voice modes.

## Generation prompt

Use case: stylized-concept. Asset type: original animal identity artwork for Yama, a serious dark conversation interface. One animal only. Square, genuinely transparent canvas. Strong close-up head-and-shoulders silhouette filling 85% of the square, no full body, no scenery. Mature natural-history anatomy, calm attentive expression. Monochrome ivory, silver, mid-grey and charcoal, no colour accents. Visible medium pixel-art clusters on an approximately 64 by 64 logical grid, ordered Bayer dithering and checkerboard tonal transitions, crisp square edges; upscale the grid without smoothing. Think restrained early computer monochrome wildlife art. Avoid emoji styling, cute cartoon features, rounded glossy 3D shapes, gradients, soft airbrush, photorealistic fur, glows, badges, frames, circles, text, symbols, labels, accessories or watermarks.

## Animal subjects

### Saathi: eagle

An eagle head and upper breast, three-quarter profile facing right. Distinct hooked beak, powerful brow and layered neck feathers, beak closed. Natural proportions, dignified and watchful, not angry. This is Saathi's eagle identity.

### Drishti: wolf

A grey wolf's head and upper chest, nearly frontal three-quarter pose slightly facing right. Pointed upright ears, elongated natural muzzle, closed mouth, layered angular fur. Alert and composed, no snarl, no cartoon grin, not a dog or fox. This is Drishti's wolf identity.

### Disha: elephant

An Asian elephant's head and upper shoulders, three-quarter view slightly facing right. Broad recognisable ears, natural small eyes, a clearly visible gently descending trunk and subtle short tusks. Wise and composed, true elephant anatomy, not a cute baby. Keep the complete trunk visible within the square. This is Disha's elephant identity.

## Pixel-treatment edit prompt

Use case: style-transfer. Input image is the edit target, not just a reference. Preserve this same animal, its recognisable anatomy, pose, direction, square framing, monochrome palette, and actual transparent background. Change only the pixel-art treatment: make it visibly much coarser, with approximately 48 square pixel cells across the entire image, as if drawn at 48x48 then enlarged by nearest-neighbour. At a 1254px output each logical cell must occupy about 26x26 actual pixels, with perfectly hard square boundaries. Simplify fur, feathers and skin into angular flat pixel clusters. Use ONLY four tonal values: ivory, light grey, dark grey, charcoal, plus transparent. Tone transitions must use obvious alternating single-logical-cell checkerboard dithering. The checkerboard squares must be as large as the other logical pixels, not tiny photographic noise. Preserve a calm, mature natural-history identity. No fine detail inside a logical cell, no small speckles, no smoothing, no gradients, no blur, no glossy emoji treatment, no cartoon grin, no colour fringes, no text, no badge, no circle, no background. This must read as medium-coarse dithered pixel art when displayed at 48px.

## Review

Screenshots and verification details are saved beside this file. Previous artwork is retained for design history. This change covers artwork and its sizing; runtime voice, agent roles, and provider integrations are unchanged.

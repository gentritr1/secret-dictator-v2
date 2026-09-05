# Rubble Square — direction v2 mood frames (generated 2026-09-05, Higgsfield FLUX.2 pro)

AI-generated direction targets for hand-made 3D work, never shipped. Same rule as `design/concepts/`: every style review holds the work next to these files, not next to adjectives. Job ids are in `generation.json`; add manifest rows in `docs/ASSET_MANIFEST.md` under a "Direction v2" heading.

| file | role |
|---|---|
| square-dusk-rubble.png | **base look**: the Marktplatz at dusk, tribunal platform of salvaged doors, bombed church spire as backdrop, pocked tenements, brick stacks, rail cart, hand pump, notice board |
| night-tribunal-searchlight.png | **hero reference** for the trial state: one warm searchlight pool, ring of rim-lit watchers, painted-flat skyline, no black |
| day-queue-notice-board.png | day/discussion mood: ration queue, brick chain into the rail cart, half-collapsed rooms open to the sky, muted, no lit lamps |
| citizens-lineup-1946.png | **hero reference** for the eight citizen silhouettes and the carved-figurine finish |

Content rule on every frame: no swastikas, no real insignia, no flags, no real logos, no legible real text. If a generated frame contains any, it is rejected and regenerated, never cropped around.

## Sheet prompt template (GPT Image 2, for Codex)

```
Production turnaround sheet for a low-poly stylised game asset, three true orthographic
views on one wide image: FRONT (left), SIDE (centre), TOP (right), exactly the same metre
scale, front and side on a shared ground baseline. Flat neutral grey background, soft even
studio lighting, no perspective, no ground shadow, no text except the small view labels and
a 1 m scale bar. Complete asset in every view, no cropping.
ASSET: <name, overall metres, EXACT counts of every part, placement of each part>
ROLE IN THE GAME: <what the player must read from it and at what distance; which socket or
collider it must keep>
STORY WEAR: <1946 rubble years: shell pocks, soot, salvaged and mismatched parts, chalk
marks, one fictional paper notice, weeds>
STYLE: stylised handcrafted game asset, chunky bevelled low-poly geometry, hand-painted
matte texture language readable at 256-512 px, painted ambient occlusion, restrained
palette of soot grey, brick red, plaster ochre, khaki, gas-lamp amber, night blue.
AVOID: swastikas, any real insignia or flag, real logos, legible real text, photoreal PBR,
gloss, ink or hatching shaders, tiny greebles, details invented between views. Counts and
proportions agree in every view.
```

## Hero prompt template (GPT Image 2)

```
Stylised low-poly painterly game frame, hand-painted matte textures, chunky bevelled
geometry, toy-theatre staging with painted-flat backdrop, no photorealism: a bombed German
town square in 1946 at <dusk | overcast day | night trial>, seen from the game camera 1.7 m
high, <the asset described exactly as in its sheet> at <distance>, cobbles with weeds,
rubble in shadow, gas lamps <lit | unlit>. Warm light only where it means attention; dark is
blue, never black. No swastikas, no real insignia, no flags, no real logos, no legible text.
```

## Caveats found on review (2026-09-05)

- `citizens-lineup-1946.png` shows six of the eight citizens (nurse and teenager with cart are missing) and the soldier figure carries a cap star and a chest pin. **Do not reproduce the star or the pin**: the returning soldier has a dyed greatcoat with no insignia of any kind. Use this frame for finish and proportion only; generate the full eight-figure silhouette sheet yourself with GPT Image 2.
- `day-queue-notice-board.png` has two rival posters whose symbols are placeholders. The Reform and Seize poster designs must be authored as fictional marks in the material-ID pass, never lifted from this frame. The notice-board text is illegible on purpose and stays that way.
- `square-dusk-rubble.png` notice board contains a red circular stamp and portrait-like posters; treat as placeholders for fictional notices.

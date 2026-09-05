# Secret Dictator — Style Bible

Locked 2026-08-08 by owner decision: **stylized-game base (Square B), staged
theatrically (Toy-Theater steals), citizens with woodcut-lineup proportions.**
No NPR/ink shader pipeline — the identity comes from shapes, lighting and
staging, not from a rendering technique.

Every future visual task is judged against the images in `design/concepts/`,
not against adjectives. When a review asks "does this match the style?", it
means: hold it next to these files.

## The one-line direction

> A handcrafted small-town stage at dusk, where warm lantern light is
> attention and cold blue dark is suspicion.

## Reference images (acceptance targets)

| file | role |
| --- | --- |
| `square-B-stylized-game.png` | base look: architecture, materials, night palette |
| `mood-day-discussion.png` | day/discussion lighting mood (weakest ref — candidate for a re-roll if it fights the style in practice) |
| `mood-dusk-gathering.png` | dusk/anticipation lighting mood |
| `mood-night-trial.png` | **hero reference** — trial staging: single warm beam on the platform, silhouetted ring of watchers, backdrop-flat rooftops |
| `citizens-sculpt-reference.png` | **hero reference** — character proportions and finish: hand-carved painted-wood figures |
| `citizens-B-woodcut.png` | character shape-language source (silhouette exaggeration) |
| `square-D-toy-theater.png` | staging-idea source: stage flats, painted backdrop, miniature charm |

## Palette (sampled from square-B-stylized-game.png, not invented)

Measured via canvas histogram over the actual chosen image:

| name | hex | use |
| --- | --- | --- |
| Lantern glow | `#f8d868` | windows, lanterns, the trial beam — ATTENTION. Highlights to `#f8e888`. |
| Timber ochre | `#684828` – `#783818` | wood beams, platform, doors, carts |
| Timber shadow | `#583828` | wood in shade |
| Slate stone | `#384848` | cobbles, stone walls, rooftops in ambient light |
| Night ambient | `#181828` / `#182828` | the dominant dark — ~75% of a night frame sits here |
| Night lift | `#282838` | the brightest a "dark" surface gets at night |

Rules that fall out of the measurement:
- **Warm is scarce.** In the base image the amber family is under 5% of the
  frame. Warm light = information (attention, speech, accusation). If a night
  scene is more than ~10% warm pixels, it has lost the language.
- **Dark is blue, never black.** Shadows sit in the `#181828` family; pure
  black is reserved for nothing.

## Lighting moods (three states, from the refs)

- **Day / discussion** (`mood-day-discussion`): soft overcast, no lit lanterns,
  muted greens and slates, shadows soft. Calm but watchful.
- **Dusk / gathering** (`mood-dusk-gathering`): low amber sun, long shadows,
  first lanterns lit, amber-to-teal sky gradient. Anticipation.
- **Night / trial** (`mood-night-trial`): near-monochrome deep blue; ONE
  dominant warm beam on the platform; watchers as rim-lit silhouettes; a few
  dim windows. Maximum pressure.

## Theatrical staging rules (the Toy-Theater steals)

1. **Backdrop, not skybox realism:** distant rooftops read as painted flats /
   silhouette layers against the sky gradient.
2. **The platform is the stage:** phase transitions re-light it before they
   move anyone. Light changes first, people move second.
3. **Stage-light framing for trials:** accused alone in the warm pool, crowd in
   the cold dark, exactly as `mood-night-trial`.
4. **Tilt-shift for verdicts:** shallow depth-of-field during vote resolution,
   making the town momentarily a miniature — the players are figures on a board.
5. **Handcraft is allowed to show:** chunky bevels, visible facets, painterly
   texture. Imperfection reads as craft, not error.

## Character shape language (from citizens-sculpt-reference + woodcut lineup)

- Proportions are **carved-caricature**: mass goes to one dominant feature per
  citizen (the blacksmith's torso, the clockmaker's legs, the innkeeper's bulk,
  the elder's hunch). No realistic anatomy.
- **Silhouette-first:** every citizen must be identifiable from a black
  silhouette at 20 meters in-game. This is a functional gameplay requirement
  (social readability), not just style.
- One distinctive accessory per citizen, readable at distance.
- Finish: painterly hand-painted texture, matte, like painted wood. No gloss,
  no PBR metal/roughness realism.
- Faces simple and matte; expression carried by pose and animation, not facial
  micro-detail.

## Materials & environment

- Chunky simplified geometry, generous bevels; facets welcome.
- Hand-painted-look albedo textures; slight brush texture, no photo textures.
- Half-timber architecture: dark timber frames on warm plaster, steep roofs.
- Cobbles large and readable, not noisy.
- Fog is blue and low, used for depth layering, never to hide players.

## Anti-goals (instant style-review failures)

- Photo-real textures or PBR gloss anywhere.
- Warm light used decoratively (it must always mean something).
- Pure black shadows.
- Visual noise that breaks silhouette reading of citizens.
- NPR ink/hatching shaders — rejected as a pipeline, deliberately.
- More than one dominant light story per scene.

## Provenance

All references AI-generated 2026-08-08 on the owner's Higgsfield account as
*direction targets for hand-made 3D work* — they are not shipped assets. Job
IDs in `docs/ASSET_MANIFEST.md`.

## Direction v2 addendum — rubble years (2026-09-05)

The setting is a small German town in 1946. Pocked plaster, salvaged brick,
soot-marked doors, cloth and matte iron replace the earlier timber-town
vocabulary. Every lighting, silhouette, staging and handcrafted-surface
principle above remains authoritative. The four references in
`design/concepts/rubble/` govern finish and composition, with their README's
content caveats. Their placeholder notices and uniform details are not assets.

Measured by `scripts/capture-rubble-baseline.mjs` using
`scripts/rubble-pixels.mjs`; full counts are in
`design/reviews/baseline-v2/measurements.json`. Histogram colours below are
centres of 16-value RGB bins, the same quantization convention as the original
bible. They describe displayed reference pixels, not unlit material values.
Role assignment is an art-direction interpretation; the counts are measured.

| Family / role | Measured bin | Reference | Pixels in bin |
| --- | --- | --- | ---: |
| Soot / stone midtone | `#484848` | square-dusk-rubble | 23,261 |
| Blue soot shadow | `#282838` | square-dusk-rubble | 30,521 |
| Brick red | `#a85838` | square-dusk-rubble | 3,135 |
| Worn plaster ochre | `#786858` | square-dusk-rubble | 17,517 |
| Salvaged timber shadow | `#583828` | square-dusk-rubble | 10,044 |
| Khaki cloth | `#786848` | citizens-lineup-1946 | 2,213 |
| Headscarf muted plum | `#583848` | square-dusk-rubble | 169 |
| Gas-lamp highlight | `#f8d898` | square-dusk-rubble | 857 |
| Night blue | `#082848` | night-tribunal-searchlight | 87,374 |
| Lifted night blue | `#283858` | night-tribunal-searchlight | 27,375 |

Warm classifier remains HSL hue 15–70° inclusive, saturation >0.16,
lightness >0.18. Whole-reference warm fractions are 15.902% dusk, 4.418%
night, 18.579% day, and 11.463% lineup. These are not new budgets.
Keep the runtime's day allowance 100%, dusk allowance 45%, and the bible's
night ceiling 10%, aiming below 5% where possible. A reference's near-black
pixels do not override the blue-shadow rule. Neither the lineup's neutral
studio background nor its skin highlights are cloth-albedo targets.

Use at most six shared painted 1024 albedo roles: plaster, brick,
timber-and-soot, metal, cloth, emissive. Paint occlusion and wear into albedo;
keep illumination runtime-controlled and vertex colour for tint only. No
normal, roughness or metallic texture maps. The gameplay dimensions remain
those of `BLENDER_PIPELINE.md` and the baseline collider/socket snapshot.

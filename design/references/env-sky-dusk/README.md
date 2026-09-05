# Dusk panorama

Generated panorama, game-height hero, then single-role material-ID; prompts
adjacent. Built-in imagegen was asked for GPT Image 2, but returned no model
identifier. The source panorama is 1774 × 887, not native 4096 × 1024. Blender
resampled it to the required runtime dimensions; both source and output were
profiled. It is a panorama, not a generated orthographic sheet.

`scripts/blender/rubble-sky.py` creates the packed editable image library and
production PNG through isolated Blender MCP. `scripts/profile-rubble-sky.py`
records every column's warm fraction and mean luminance, maximum rolling 10°
warm change, adjacent-window change and luma ratio. No seam repair was made.

Runtime uses one cached sRGB texture through assets.js. The existing dome
samples its luminance as subtle brush detail; the original day/dusk/trial
colour gradients continue to supply the hue. This intentionally does not
reproduce the source panorama's ochre hue literally. Missing texture retains
the original gradient. No added GLB, geometry draw or independent light.

The brief's 4096 × 1024 panorama is a special resource size; it is not an
additional 1024 material-role atlas. References and dimensions are in the asset
manifest. See the phase-1 report for actual browser decoding/fallback evidence.

# Rejected sheet attempts

Original generated files are retained without rescaling or relayout.

- sheet-01.png: rejected. Roof/front width about 381 px, side about 138 px,
  top about 393 px instead of 360 / 120 / 360. The added trim enlarged the
  engineering envelopes. Prompt: ../sheet-prompt-1.txt.
- sheet-02.png: rejected for inconsistent roof material. The upper side view
  was plaster while the top was timber. Prompt: ../sheet-prompt-2.txt.
  Corrected by imagegen in ../sheet.png, not by pixel editing.

- plaster-01.png: seams passed; relative spectral drift 0.124 exceeded 0.10.
- plaster-02.png: seams passed; relative spectral drift 0.273 exceeded 0.10.
- plaster-03.png: numeric profile passed, but rejected visually for a regular
  dot pattern inconsistent with the mood frames. A passing number is not a
  visual approval.
- plaster-04.png: top/bottom mismatch 8.198/255 and relative drift 0.366 failed.
- brick-01.png: top/bottom mismatch 9.873/255 failed.

Profiles live under design/reviews/rubble-phase-2/env-facade-a/ with matching
rejected attempt numbers. Plaster attempt 5 and brick attempt 2 are the accepted
unmodified sources. Their production atlases are uniformly reduced in Blender,
then profiled again. No generated image was stitched, rectified or seam-repaired.

- plaster-cold-reviewed.png: measurable gates passed, rejected after owner review for cool-grey drift from the hero. Retained unchanged; warm ochre replacement requested.

Ochre revision attempts: 01 failed both edge and spectral gates; 02 failed spectral; 03 failed spectral and looked too speckled; 04 failed both; 05 passed source but failed the production-atlas spectral gate. All five native originals are retained. Attempt 06 is plaster-ochre-source.png and passes both sizes. Exact measurements are retained in the phase-2 review packet.

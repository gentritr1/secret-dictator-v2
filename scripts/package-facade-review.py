"""Preserve the owned, uncommitted facade checkpoint as an explicit-path overlay."""
import hashlib
import json
from pathlib import Path
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = Path('/private/tmp/rubble-facades-bc-review-ae6a31a.tar.gz')
CHECKPOINT = Path('design/reviews/rubble-phase-2/facades/checkpoint.json')
OWNED = [
    'art/blender/environment/env-facade-a/env-facade-a.blend',
    'art/blender/environment/env-facade-b/env-facade-b.blend',
    'art/blender/environment/env-facade-c/env-facade-c.blend',
    'design/references/env-facade-a', 'design/references/env-facade-b', 'design/references/env-facade-c',
    'design/reviews/env-facade-a', 'design/reviews/env-facade-b', 'design/reviews/env-facade-c',
    'design/reviews/rubble-phase-2', 'docs/ASSET_MANIFEST.md',
    'public/assets/models/environment/env-facade-a.glb',
    'public/assets/models/environment/env-facade-b.glb',
    'public/assets/models/environment/env-facade-c.glb',
    'public/assets/textures/rubble/TEX_Brick.png',
    'public/assets/textures/rubble/TEX_Plaster_Facade.png',
    'src/play/assets.js', 'test/glb.test.js',
    'scripts/audit-facade-shared-atlases.py', 'scripts/package-facade-review.py',
    'scripts/blender/audit-rubble-facade.py', 'scripts/blender/export-rubble-facade-variant.py',
    'scripts/blender/ochre-rubble-facade.py', 'scripts/blender/open-rubble-facade-b.py',
    'scripts/blender/open-rubble-facade-c.py', 'scripts/blender/paint-rubble-facade.py',
    'scripts/blender/refine-rubble-facade.py', 'scripts/blender/rubble-facade.py',
    'scripts/blender/rubble-facade-b.py', 'scripts/blender/rubble-facade-c.py',
    'scripts/capture-facade-template.mjs', 'scripts/compare-facade-atlas-only.py',
    'scripts/compare-facade-variant.mjs', 'scripts/compare-rubble-facade.mjs',
    'scripts/locate-facade-warm-delta.py', 'scripts/measure-facade-sheet.py',
    'scripts/measure-facade-variant-sheet.py', 'scripts/measure-facade-walk.mjs',
    'scripts/measure-facade-warm-pair.mjs', 'scripts/review-facade-variant.mjs',
    'scripts/review-rubble-facade.mjs',
]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


base = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
assert base.startswith('ae6a31a'), 'Review base changed; inspect before packaging.'
paths = set()
for name in OWNED:
    path = ROOT / name
    assert path.exists(), name
    for entry in path.rglob('*') if path.is_dir() else [path]:
        if entry.is_file() and not entry.is_symlink() and entry.suffix not in ['.blend1', '.pyc'] and entry.name != '.DS_Store':
            paths.add(entry.relative_to(ROOT))
paths.discard(CHECKPOINT)
hashes = {str(p): digest(ROOT / p) for p in sorted(paths)}
report = {
    'baseCommit': base, 'branch': 'art/rubble-square',
    'status': 'Uncommitted B/C facade review checkpoint. A owner-approved. Phase 2 remains incomplete.',
    'restore': 'Overlay this archive onto a clean detached worktree at baseCommit. Install dependencies separately; use the specified Node20 PATH. Run npm run verify and open the facades/index.html review through npm run dev. No git metadata or node_modules is included.',
    'historicalEvidence': 'A-only and B-only comparison/runtime hashes describe their earlier sequential stages. C comparison and this manifest describe the current mixed row. Historical A checkpoint.json belongs to the earlier retained A archive.',
    'sha256': hashes,
}
(ROOT / CHECKPOINT).write_text(json.dumps(report, indent=2) + '\n')
paths.add(CHECKPOINT)
assert not OUTPUT.exists(), 'Keep existing review archives; choose a new output name.'
with tarfile.open(OUTPUT, 'w:gz') as archive:
    for path in sorted(paths):
        archive.add(ROOT / path, arcname=str(path), recursive=False)
with tarfile.open(OUTPUT) as archive:
    assert set(archive.getnames()) == {str(p) for p in paths}
    for path in paths:
        payload = archive.extractfile(str(path)).read()
        assert hashlib.sha256(payload).hexdigest() == digest(ROOT / path)
result = {'archive': str(OUTPUT), 'bytes': OUTPUT.stat().st_size, 'files': len(paths), 'sha256': digest(OUTPUT), 'allArchivedBytesVerified': True}
OUTPUT.with_suffix('.verification.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))

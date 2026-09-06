"""Compare the retained grey GLB with the ochre export, including every accessor."""
import hashlib, json, struct
from pathlib import Path

OUT = Path('design/reviews/rubble-phase-2/env-facade-a')

def read_glb(path):
    raw = path.read_bytes()
    size = struct.unpack_from('<I', raw, 12)[0]
    doc = json.loads(raw[20:20 + size])
    binary = raw[28 + size:]
    def view(index):
        entry = doc['bufferViews'][index]
        start = entry.get('byteOffset', 0)
        return binary[start:start + entry['byteLength']]
    accessors = []
    for entry in doc['accessors']:
        metadata = {k: v for k, v in entry.items() if k != 'bufferView'}
        accessors.append((metadata, hashlib.sha256(view(entry['bufferView'])).hexdigest()))
    images = {entry['name']: hashlib.sha256(view(entry['bufferView'])).hexdigest() for entry in doc['images']}
    return doc, accessors, images

before, before_accessors, before_images = read_glb(OUT / 'cold-candidate/env-facade-a.glb')
after, after_accessors, after_images = read_glb(Path('public/assets/models/environment/env-facade-a.glb'))
assert before_accessors == after_accessors
for key in ['nodes', 'meshes', 'materials', 'textures', 'samplers', 'scenes']:
    assert before.get(key) == after.get(key), key
changed = [name for name in before_images if before_images[name] != after_images[name]]
assert changed == ['TEX_Plaster_Facade'], changed
report = {'allAccessorBytesEqual': True, 'accessorCount': len(after_accessors),
          'nodesMeshesMaterialsTexturesSamplersScenesEqual': True, 'changedImages': changed,
          'beforeImages': before_images, 'afterImages': after_images}
(OUT / 'atlas-only-comparison.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))

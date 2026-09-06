"""Compare embedded role images, without decoding or changing them."""
import hashlib
import json
import struct
from pathlib import Path


def images(asset):
    path = Path('public/assets/models/environment') / (asset + '.glb')
    data = path.read_bytes()
    length, kind = struct.unpack_from('<II', data, 12)
    assert kind == 0x4e4f534a
    document = json.loads(data[20:20 + length])
    start = 20 + length
    binary_length, kind = struct.unpack_from('<II', data, start)
    assert kind == 0x004e4942
    binary = data[start + 8:start + 8 + binary_length]
    result = {}
    for image in document['images']:
        view = document['bufferViews'][image['bufferView']]
        offset = view.get('byteOffset', 0)
        payload = binary[offset:offset + view['byteLength']]
        result[image['name']] = hashlib.sha256(payload).hexdigest()
    assert len(result) == 3
    return result


reports = {asset: images(asset) for asset in ['env-facade-a', 'env-facade-b', 'env-facade-c']}
assert reports['env-facade-a'] == reports['env-facade-b'] == reports['env-facade-c']
report = {'method': 'SHA-256 of each embedded image bufferView, compared by image name.', 'byteIdentical': True, 'images': reports}
Path('design/reviews/rubble-phase-2/facades/shared-atlases.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report))

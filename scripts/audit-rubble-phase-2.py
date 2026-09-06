"""Read-only final asset hash and shared-image audit; writes one explicit new report."""
from pathlib import Path
import hashlib,json,struct,sys
assets=['env-facade-a','env-facade-b','env-facade-c','env-rubble-small','env-rubble-large','env-brick-stack','env-rubble-cart','env-well-a']
out=Path(sys.argv[1]);assert not out.exists(),'Refusing to overwrite evidence'
checkpoint=json.loads(Path('design/reviews/rubble-phase-2/facades/checkpoint.json').read_text())
report={'method':'SHA-256 of GLB and source bytes; embedded image bufferViews compared by image name. Approved facade hashes compared with the pre-kit checkpoint.','assets':{},'images':{},'approvedFacadesUnchanged':True}
for asset in assets:
 glb=Path(f'public/assets/models/environment/{asset}.glb');source=Path(f'art/blender/environment/{asset}/{asset}.blend');b=glb.read_bytes();length=struct.unpack_from('<I',b,12)[0];j=json.loads(b[20:20+length]);offset=20+length;binary=b[offset+8:];hashes={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in [glb,source]}
 if asset.startswith('env-facade-'):
  for path,digest in hashes.items():assert digest==checkpoint['sha256'][path],f'Approved facade changed: {path}'
 embedded={}
 for image in j['images']:
  view=j['bufferViews'][image['bufferView']];start=view.get('byteOffset',0);digest=hashlib.sha256(binary[start:start+view['byteLength']]).hexdigest();embedded[image['name']]=digest
  if image['name'] in report['images']:assert report['images'][image['name']]==digest,f'Shared atlas differs: {image["name"]}'
  report['images'][image['name']]=digest
 report['assets'][asset]={'hashes':hashes,'embeddedImages':embedded,'nodes':[n['name'] for n in j['nodes']]}
assert len(report['images'])==4,'Phase 2 must share the four declared image roles'
out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'approvedFacadesUnchanged':True,'assets':len(assets),'sharedImages':len(report['images'])}))

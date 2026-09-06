"""Read-only source audit through the isolated MCP connection."""
import bpy,json,re
from pathlib import Path
ROOT=Path('/private/tmp/rubble-square-art')
assert Path(bpy.data.filepath)==ROOT/'art/blender/environment/env-facade-a/env-facade-a.blend'
scene=bpy.context.scene
assert scene.unit_settings.system=='METRIC' and scene.unit_settings.scale_length==1
assert sorted(c.name for c in bpy.data.collections)==['00_GUIDES','10_RENDER','20_COLLISION','30_SOCKETS','90_REVIEW']
report={'source':bpy.data.filepath,'unit':'metre','objects':[],'images':[]}
for obj in bpy.data.objects:
    assert not re.search(r'\.\d{3}$',obj.name)
    assert not re.match(r'^(Cube|Plane|Cylinder|Camera|Light)(\.|$)',obj.name)
    assert tuple(obj.scale)==(1,1,1)
    if obj.type=='MESH':assert not re.search(r'\.\d{3}$',obj.data.name)
    report['objects'].append({'name':obj.name,'data':obj.data.name if obj.data else None,'collections':[c.name for c in obj.users_collection],'dimensions':list(obj.dimensions),'location':list(obj.location),'scale':list(obj.scale)})
for image in bpy.data.images:
    if not image.name.startswith('TEX_'):continue
    assert list(image.size)==[1024,1024] and image.packed_file
    assert not re.search(r'\.\d{3}$',image.name)
    report['images'].append({'name':image.name,'size':list(image.size),'packed':True,'colourSpace':image.colorspace_settings.name})
assert len(report['images'])==3
capsule=bpy.data.objects['GUIDE_Calibration']
assert abs(capsule.dimensions.x-.7)<.0001 and abs(capsule.dimensions.z-1.7)<.0001
assert len(bpy.data.armatures)==0 and len(bpy.data.actions)==0
(ROOT/'design/reviews/rubble-phase-2/env-facade-a/source-audit.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))

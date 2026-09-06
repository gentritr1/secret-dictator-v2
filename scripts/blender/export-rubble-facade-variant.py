"""Audit and export the currently open owned facade variant through MCP."""
import bpy, json
from pathlib import Path
ROOT=Path('/private/tmp/rubble-square-art')
asset=Path(bpy.data.filepath).stem
assert asset in ['env-facade-b','env-facade-c']
assert Path(bpy.data.filepath)==ROOT/f'art/blender/environment/{asset}/{asset}.blend'
assert sorted(c.name for c in bpy.data.collections)==['00_GUIDES','10_RENDER','20_COLLISION','30_SOCKETS','90_REVIEW']
names=[asset,'VIS_plaster','VIS_brick','VIS_joinery','COL_wall','SOCKET_lamp']
assert bpy.context.scene.unit_settings.system=='METRIC' and bpy.context.scene.unit_settings.scale_length==1
for name in names:
    obj=bpy.data.objects[name]
    assert tuple(obj.scale)==(1,1,1) and tuple(obj.rotation_euler)==(0,0,0)
images=[]
for image in bpy.data.images:
    if image.name.startswith('TEX_'):
        assert list(image.size)==[1024,1024] and image.packed_file
        images.append({'name':image.name,'pixels':list(image.size),'packed':True})
assert len(images)==3 and len(bpy.data.actions)==0 and len(bpy.data.armatures)==0
bpy.ops.object.select_all(action='DESELECT')
for name in names:bpy.data.objects[name].select_set(True)
bpy.context.view_layer.objects.active=bpy.data.objects[asset]
bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
bpy.ops.export_scene.gltf(filepath=str(ROOT/f'public/assets/models/environment/{asset}.glb'),export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_image_format='AUTO')
report={'source':bpy.data.filepath,'images':images,'objects':names,'colliderVertices':[list(v.co) for v in bpy.data.objects['COL_wall'].data.vertices],'lampSourcePosition':list(bpy.data.objects['SOCKET_lamp'].location)}
(ROOT/f'design/reviews/rubble-phase-2/{asset}/source-audit.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))

"""Audit and export only the current, owned phase-2 prop."""
import bpy,json
from pathlib import Path
ROOT=Path('/private/tmp/rubble-square-art');asset=Path(bpy.data.filepath).stem
assert asset in ['env-rubble-small','env-rubble-large','env-brick-stack','env-rubble-cart','env-well-a']
assert Path(bpy.data.filepath)==ROOT/f'art/blender/environment/{asset}/{asset}.blend'
config=json.loads((ROOT/f'design/references/{asset}/contract.json').read_text())
assert sorted(c.name for c in bpy.data.collections)==['00_GUIDES','10_RENDER','20_COLLISION','30_SOCKETS','90_REVIEW']
objects=[o for o in bpy.data.objects if o.name==asset or o.name.startswith(('VIS_','COL_','SOCKET_'))]
assert bpy.data.objects[config['collider']] in objects
assert bpy.context.scene.unit_settings.system=='METRIC' and bpy.context.scene.unit_settings.scale_length==1
for o in objects:
    assert tuple(o.scale)==(1,1,1) and tuple(o.rotation_euler)==(0,0,0)
    assert not o.name.endswith('.001')
    if not o.name.startswith('SOCKET_'):assert tuple(o.location)==(0,0,0)
images={}
for o in objects:
    if not o.name.startswith('VIS_'):continue
    for material in o.data.materials:
        for node in material.node_tree.nodes:
            if node.type=='TEX_IMAGE':
                image=node.image;assert list(image.size)==[1024,1024] and image.packed_file
                images[image.name]={'size':list(image.size),'packed':True}
assert len(images)<=3 and not bpy.data.actions and not bpy.data.armatures
bpy.ops.object.select_all(action='DESELECT')
for o in objects:o.select_set(True)
bpy.context.view_layer.objects.active=bpy.data.objects[asset]
bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
bpy.ops.export_scene.gltf(filepath=str(ROOT/f'public/assets/models/environment/{asset}.glb'),export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_image_format='AUTO')
col=bpy.data.objects[config['collider']]
report={'source':bpy.data.filepath,'objects':[o.name for o in objects],'images':images,'colliderVertices':[list(v.co) for v in col.data.vertices],'colliderFaces':[list(p.vertices) for p in col.data.polygons],'colliderMatrix':[list(r) for r in col.matrix_world],'collections':[c.name for c in bpy.data.collections]}
(ROOT/f'design/reviews/rubble-phase-2/{asset}/source-audit.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))

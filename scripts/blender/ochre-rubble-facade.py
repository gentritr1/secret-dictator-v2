"""Replace only the facade plaster image through the isolated Blender MCP session."""
import bpy, hashlib, json
from pathlib import Path

ROOT = Path('/private/tmp/rubble-square-art')
OUT = ROOT / 'design/reviews/rubble-phase-2/env-facade-a'
SOURCE = ROOT / 'art/blender/environment/env-facade-a/env-facade-a.blend'
assert Path(bpy.data.filepath) == SOURCE

def mesh_contract():
    result = {}
    for obj in bpy.data.objects:
        record = {'matrix': [list(row) for row in obj.matrix_world]}
        if obj.type == 'MESH':
            mesh = obj.data
            record['vertices'] = [list(v.co) for v in mesh.vertices]
            record['faces'] = [list(p.vertices) for p in mesh.polygons]
            record['uv'] = [[list(d.uv) for d in layer.data] for layer in mesh.uv_layers]
            record['tints'] = [[list(d.color) for d in layer.data] for layer in mesh.color_attributes]
        result[obj.name] = hashlib.sha256(json.dumps(record, sort_keys=True).encode()).hexdigest()
    return result

before = mesh_contract()
old = bpy.data.images['TEX_Plaster_Facade']
image = bpy.data.images.load(str(ROOT / 'design/references/env-facade-a/plaster-ochre-source.png'), check_existing=False)
source_size = list(image.size)
image.scale(1024, 1024)
image.filepath_raw = str(ROOT / 'public/assets/textures/rubble/TEX_Plaster_Facade.png')
image.file_format = 'PNG'
image.save()
image.pack()
for material in bpy.data.materials:
    if material.use_nodes:
        for node in material.node_tree.nodes:
            if node.type == 'TEX_IMAGE' and node.image == old:
                node.image = image
bpy.data.images.remove(old)
image.name = 'TEX_Plaster_Facade'
after = mesh_contract()
assert before == after, 'Atlas replacement must preserve geometry, transforms, UVs and tints'
names = ['env-facade-a', 'VIS_plaster', 'VIS_brick', 'VIS_joinery', 'COL_wall', 'SOCKET_lamp']
bpy.ops.object.select_all(action='DESELECT')
for name in names:
    bpy.data.objects[name].select_set(True)
bpy.context.view_layer.objects.active = bpy.data.objects['env-facade-a']
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
bpy.ops.export_scene.gltf(filepath=str(ROOT / 'public/assets/models/environment/env-facade-a.glb'), export_format='GLB', use_selection=True, export_yup=True, export_animations=False, export_image_format='AUTO')
bpy.context.scene.render.filepath = str(OUT / 'ochre-blender.png')
bpy.ops.render.render(write_still=True)
report = {'sourcePixels': source_size, 'atlasPixels': list(image.size), 'unchangedGeometryTransformsUvsTints': before == after, 'before': before, 'after': after}
(OUT / 'ochre-build.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report))

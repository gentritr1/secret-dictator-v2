"""Run through the isolated Blender MCP server, with env-ground-a open."""
import bpy
import json
from pathlib import Path
from mathutils import Vector

ROOT = Path('/private/tmp/rubble-square-art')
scene = bpy.context.scene
assert Path(bpy.data.filepath) == ROOT / 'art/blender/environment/env-ground-a/env-ground-a.blend'
assert set(bpy.data.objects.keys()) == {'env-ground-a','COL_ground','VIS_cobble_accent','VIS_cobble_field'}
root = bpy.data.objects['env-ground-a']
collider = bpy.data.objects['COL_ground']
before = [tuple(v.co) for v in collider.data.vertices]
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1
collections = {}
for name in ['00_GUIDES','10_RENDER','20_COLLISION','30_SOCKETS','90_REVIEW']:
    collection = bpy.data.collections.new(name)
    scene.collection.children.link(collection)
    collections[name] = collection

def move(obj, collection):
    for owner in list(obj.users_collection): owner.objects.unlink(obj)
    collections[collection].objects.link(obj)

move(root, '10_RENDER')
move(collider, '20_COLLISION')
collider.data.name = 'COL_ground_mesh'
collider.data.materials.clear()
for name in ['VIS_cobble_accent','VIS_cobble_field']:
    obj = bpy.data.objects[name]
    mesh = obj.data
    bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.meshes.remove(mesh)
for material in list(bpy.data.materials):
    if material.users == 0: bpy.data.materials.remove(material)

image = bpy.data.images.load(str(ROOT / 'design/references/env-ground-a/cobble-source.png'), check_existing=False)
image.name = 'TEX_Plaster_Cobble'
image.colorspace_settings.name = 'sRGB'
# Uniform production texture reduction; no projection change or seam repair.
image.scale(1024,1024)
image.filepath_raw = str(ROOT / 'public/assets/textures/rubble/TEX_Plaster_Cobble.png')
image.file_format = 'PNG'
image.save()
image.pack()
material = bpy.data.materials.new('MAT_Plaster')
material.use_nodes = True
material.surface_render_method = 'DITHERED'
material.use_backface_culling = True
bsdf = material.node_tree.nodes.get('Principled BSDF')
bsdf.inputs['Roughness'].default_value = .9
bsdf.inputs['Metallic'].default_value = 0
tex = material.node_tree.nodes.new('ShaderNodeTexImage')
tex.name = 'TEX_Plaster_Cobble'
tex.image = image
tex.extension = 'REPEAT'
material.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])

def mesh_object(name, vertices, faces, uv_for):
    mesh = bpy.data.meshes.new(name + '_mesh')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    uv = mesh.uv_layers.new(name='UV_Atlas')
    for polygon in mesh.polygons:
        for loop in polygon.loop_indices:
            uv.data[loop].uv = uv_for(mesh.vertices[mesh.loops[loop].vertex_index].co)
    obj = bpy.data.objects.new(name, mesh)
    collections['10_RENDER'].objects.link(obj)
    obj.parent = root
    obj.data.materials.append(material)
    return obj

half = 13.9
verts = [(x,y,z) for z in [-.072,-.002] for y in [-half,half] for x in [-half,half]]
faces = [(0,2,3,1),(4,5,7,6),(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5)]
floor = mesh_object('VIS_cobble_field',verts,faces,lambda p: ((p.x+half)/3.475,(p.y+half)/3.475))
# The scars use a narrow soot-grout strip of the same atlas. They are painted
# visual ribbons below the walk plane, with no collision or extra material.
verts=[]; faces=[]
for x in [-.6,.6]:
    n=len(verts)
    verts.extend([(x-.035,-10,-.001),(x+.035,-10,-.001),(x+.035,10,-.001),(x-.035,10,-.001)])
    faces.append((n,n+1,n+2,n+3))
scars=mesh_object('VIS_tram_scars',verts,faces,lambda p: ((p.y+10)/3.475,.998))

bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=1, location=(-15,0,.85))
guide=bpy.context.object
# Edit local vertex coordinates rather than applying object transforms.
for v in guide.data.vertices:
    v.co.x *= .35; v.co.y *= .35; v.co.z *= .85
guide.name='GUIDE_Calibration'
guide.data.name='GUIDE_Calibration_mesh'
move(guide,'00_GUIDES')
guide.hide_render=True
bpy.ops.object.camera_add(location=(22,-25,22))
camera=bpy.context.object; camera.name='REVIEW_Ground'; camera.data.name='REVIEW_Ground_camera'
camera.rotation_euler=(Vector((0,0,0))-camera.location).to_track_quat('-Z','Y').to_euler()
move(camera,'90_REVIEW'); scene.camera=camera
bpy.ops.object.light_add(type='AREA',location=(0,-7,20))
light=bpy.context.object; light.name='REVIEW_Softbox'; light.data.name='REVIEW_Softbox_light'
light.data.energy=2200; light.data.shape='DISK'; light.data.size=20
move(light,'90_REVIEW')
if scene.world is None: scene.world=bpy.data.worlds.new('REVIEW_World')
scene.world.color=(.15,.18,.25)
scene.render.engine='CYCLES'; scene.cycles.samples=16
scene.view_settings.view_transform='AgX'
scene.render.resolution_x=960;scene.render.resolution_y=720;scene.render.resolution_percentage=100
assert [tuple(v.co) for v in collider.data.vertices] == before
bpy.ops.object.select_all(action='DESELECT')
for obj in [root,collider,floor,scars]: obj.select_set(True)
bpy.context.view_layer.objects.active=root
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/blender/environment/env-ground-a/env-ground-a.blend'))
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/assets/models/environment/env-ground-a.glb'),export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_image_format='AUTO',export_materials='EXPORT')
scene.render.filepath=str(ROOT/'design/reviews/rubble-phase-1/ground-blender-preview.png')
bpy.ops.render.render(write_still=True)
print(json.dumps({'colliderUnchanged':True,'atlas':list(image.size),'renderMeshes':[floor.name,scars.name]}))

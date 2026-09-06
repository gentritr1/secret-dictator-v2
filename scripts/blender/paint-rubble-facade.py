"""Apply accepted albedos and restrained bevels to the inspected blockout via MCP."""
import bpy, bmesh, json
from pathlib import Path
ROOT=Path('/private/tmp/rubble-square-art')
OUT=ROOT/'design/reviews/rubble-phase-2/env-facade-a'
assert Path(bpy.data.filepath)==ROOT/'art/blender/environment/env-facade-a/env-facade-a.blend'
for role in ['plaster','brick']:
    assert json.loads((OUT/f'{role}-source-profile.json').read_text())['accepted']
atlas_files={
    'Plaster': ('plaster-source.png','TEX_Plaster_Facade'),
    'Brick': ('brick-source.png','TEX_Brick'),
    'TimberSoot': (None,'TEX_TimberSoot_Backdrop'),
}
for role,(source,name) in atlas_files.items():
    path=ROOT/'public/assets/textures/rubble'/f'{name}.png'
    image=bpy.data.images.load(str(ROOT/'design/references/env-facade-a'/source if source else path),check_existing=False)
    image.name=name;image.colorspace_settings.name='sRGB'
    if source:
        image.scale(1024,1024);image.filepath_raw=str(path);image.file_format='PNG';image.save()
    image.pack()
    material=bpy.data.materials['MAT_'+role];nodes=material.node_tree.nodes;links=material.node_tree.links
    bsdf=nodes.get('Principled BSDF')
    tex=nodes.new('ShaderNodeTexImage');tex.name=name;tex.image=image
    vertex=nodes.new('ShaderNodeVertexColor');vertex.layer_name='Tint';vertex.name='Rubble_Tint'
    mix=nodes.new('ShaderNodeMix');mix.name='Rubble_AlbedoTint';mix.data_type='RGBA';mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1
    links.new(tex.outputs['Color'],mix.inputs[6]);links.new(vertex.outputs['Color'],mix.inputs[7]);links.new(mix.outputs[2],bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value=.9;bsdf.inputs['Metallic'].default_value=0
    bsdf.inputs['Emission Strength'].default_value=0

# Local corner bevels and correct outward winding, never applied transforms.
obj=bpy.data.objects['VIS_joinery'];bm=bmesh.new();bm.from_mesh(obj.data)
bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000001)
bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
edges=[edge for edge in bm.edges if edge.is_manifold and edge.calc_face_angle()>.1]
bmesh.ops.bevel(bm,geom=edges,offset=.012,segments=1,affect='EDGES',clamp_overlap=True)
bm.to_mesh(obj.data);bm.free();obj.data.update()
# Four brick lengths by eight courses in the accepted image cover .8 x .6 m.
brick=bpy.data.objects['VIS_brick'].data
for loop in brick.loops:
    co=brick.vertices[loop.vertex_index].co;brick.uv_layers.active.data[loop.index].uv=(co.x/.8,co.z/.6)
# Rotated dry-brush streaks follow the vertical joinery grain.
for datum in obj.data.uv_layers.active.data: datum.uv=(datum.uv.y,datum.uv.x)
plaster=bpy.data.objects['VIS_plaster'].data
for datum in plaster.color_attributes['Tint'].data:
    c=datum.color;datum.color=(c[0]*.87,c[1]*.93,c[2],1)

scene=bpy.context.scene
bpy.ops.object.select_all(action='DESELECT')
exported=[bpy.data.objects[name] for name in ['env-facade-a','VIS_plaster','VIS_brick','VIS_joinery','COL_wall','SOCKET_lamp']]
for obj in exported:obj.select_set(True)
bpy.context.view_layer.objects.active=bpy.data.objects['env-facade-a']
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/blender/environment/env-facade-a/env-facade-a.blend'))
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/assets/models/environment/env-facade-a.glb'),export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_image_format='AUTO')
scene.render.filepath=str(OUT/'painted-blender.png');bpy.ops.render.render(write_still=True)
report=json.loads((OUT/'facade-build.json').read_text());report['stage']='painted';report['objects']=[]
for obj in exported:
    if obj.type!='MESH':continue
    obj.data.calc_loop_triangles();report['objects'].append({'name':obj.name,'triangles':len(obj.data.loop_triangles),'vertices':len(obj.data.vertices),'scale':list(obj.scale)})
report['atlases']={role: {'name':name,'size':[1024,1024]} for role,(_,name) in atlas_files.items()}
(OUT/'facade-painted-build.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))

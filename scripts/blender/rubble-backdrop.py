"""Run through isolated Blender MCP with the original env-backdrop-a open."""
import bpy, json, math
from pathlib import Path
from mathutils import Vector
from mathutils.geometry import tessellate_polygon
ROOT=Path('/private/tmp/rubble-square-art')
assert Path(bpy.data.filepath)==ROOT/'art/blender/environment/env-backdrop-a/env-backdrop-a.blend'
scene=bpy.context.scene
assert not any(o.name.startswith(('COL_','SOCKET_')) for o in bpy.data.objects)
for obj in list(bpy.data.objects): bpy.data.objects.remove(obj,do_unlink=True)
for coll in list(bpy.data.collections): bpy.data.collections.remove(coll)
for datablocks in [bpy.data.meshes,bpy.data.materials,bpy.data.cameras,bpy.data.lights]:
    for block in list(datablocks):
        if block.users==0:datablocks.remove(block)
for image in list(bpy.data.images):
    if image.name.startswith('TEX_'):bpy.data.images.remove(image)
scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
collections={}
for name in ['00_GUIDES','10_RENDER','20_COLLISION','30_SOCKETS','90_REVIEW']:
    c=bpy.data.collections.new(name);scene.collection.children.link(c);collections[name]=c
root=bpy.data.objects.new('env-backdrop-a',None);collections['10_RENDER'].objects.link(root)
material=bpy.data.materials.new('MAT_TimberSoot');material.use_nodes=True
# Paper-thin scenery is the documented double-sided exception.
material.use_backface_culling=False
bsdf=material.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Roughness'].default_value=.9
bsdf.inputs['Metallic'].default_value=0
objects=[];parts=[]
near=['gable','chimney','spire','gable','chimney','tower','gable','chimney']
far=['gable','chimney','gable','gable','chimney','gable','chimney','gable']
for ring,radius,motifs in [('near',26,near),('far',40,far)]:
    for index,motif in enumerate(motifs):
        a=index*math.pi/4;b=(index+1)*math.pi/4
        start=Vector((radius*math.cos(a),radius*math.sin(a),0))
        end=Vector((radius*math.cos(b),radius*math.sin(b),0))
        top=17.8 if ring=='near' else 16.2
        if motif=='gable':
            profile=[(0,12.2),(.18,13),(.39,top),(.48,top-.8),(.49,top-2.1),(.59,top-1.1),(.78,12.8),(1,12.2)]
        elif motif=='chimney':
            profile=[(0,12.2),(.26,12.8),(.4,12.5),(.4,top-.4),(.38,top-.4),(.38,top),(.51,top),(.51,top-.4),(.49,top-.4),(.49,12.5),(.73,13.1),(1,12.2)]
        elif motif=='spire':
            profile=[(0,12.2),(.3,13),(.36,13),(.36,17),(.40,17),(.50,26),(.535,24),(.515,23.1),(.55,23.4),(.6,17),(.64,17),(.64,13),(.8,12.6),(1,12.2)]
        else: profile=[(0,12.2),(1,12.2)]
        polygons=[[(0,0),(1,0)]+list(reversed(profile))]
        if motif=='tower':
            # Four distinct legs and a square tank, all one paper-flat mesh.
            for u in [.36,.44,.52,.60]: polygons.append([(u,12.2),(u+.025,12.2),(u+.025,16.4),(u,16.4)])
            polygons.append([(.33,16.4),(.66,16.4),(.66,19),(.495,19.7),(.33,19)])
        verts=[];faces=[];uvs=[]
        for polygon in polygons:
            offset=len(verts)
            local=[Vector((u,z,0)) for u,z in polygon]
            for u,z in polygon:
                p=start.lerp(end,u);p.z=z;verts.append(tuple(p));uvs.append((u,z/26))
            for tri in tessellate_polygon([local]): faces.append(tuple(offset+(v if isinstance(v,int) else local.index(v)) for v in tri))
        name=f'VIS_backdrop_{ring}_{index+1:02d}_{motif}'
        mesh=bpy.data.meshes.new(name+'_mesh');mesh.from_pydata(verts,[],faces);mesh.update()
        layer=mesh.uv_layers.new(name='UV_Atlas')
        for loop in mesh.loops: layer.data[loop.index].uv=uvs[loop.vertex_index]
        obj=bpy.data.objects.new(name,mesh);collections['10_RENDER'].objects.link(obj);obj.parent=root
        mesh.materials.append(material);objects.append(obj)
        parts.append(dict(name=name,ring=ring,radius=radius,motif=motif,triangles=len(faces)))
# Apply the painted albedo only after the silhouette meshes exist.
image=bpy.data.images.load(str(ROOT/'design/references/env-backdrop-a/atlas-source.png'),check_existing=False)
image.name='TEX_TimberSoot_Backdrop';image.colorspace_settings.name='sRGB';image.scale(1024,1024)
image.filepath_raw=str(ROOT/'public/assets/textures/rubble/TEX_TimberSoot_Backdrop.png');image.file_format='PNG';image.save();image.pack()
tex=material.node_tree.nodes.new('ShaderNodeTexImage');tex.name=image.name;tex.image=image
tint=material.node_tree.nodes.new('ShaderNodeMix');tint.name='Rubble_AlbedoTint';tint.data_type='RGBA';tint.blend_type='MULTIPLY'
tint.inputs[0].default_value=1;tint.inputs[7].default_value=(.3,.45,.7,1)
material.node_tree.links.new(tex.outputs['Color'],tint.inputs[6]);material.node_tree.links.new(tint.outputs[2],bsdf.inputs['Base Color'])
# A real 1.7 m capsule, radius .35 m, with a one-metre straight body.
verts=[];faces=[];rings=[]
for zc,angles in [(.35,[-math.pi/2+j*math.pi/12 for j in range(7)]),(1.35,[j*math.pi/12 for j in range(7)])]:
    ring=[]
    for angle in angles:
        ring=[]
        for k in range(16):
            ring.append(len(verts));verts.append((.35*math.cos(angle)*math.cos(k*math.tau/16),.35*math.cos(angle)*math.sin(k*math.tau/16),zc+.35*math.sin(angle)))
        rings.append(ring)
for j in range(len(rings)-1):
    for k in range(16): faces.append((rings[j][k],rings[j][(k+1)%16],rings[j+1][(k+1)%16],rings[j+1][k]))
mesh=bpy.data.meshes.new('GUIDE_Calibration_mesh');mesh.from_pydata(verts,[],faces)
guide=bpy.data.objects.new('GUIDE_Calibration',mesh);collections['00_GUIDES'].objects.link(guide);guide.hide_render=True
bpy.ops.object.camera_add(location=(0,-5,1.7));camera=bpy.context.object;camera.name='REVIEW_Game';camera.data.name='REVIEW_Game_camera'
camera.rotation_euler=(Vector((-7,32,17))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.lens=24
for owner in list(camera.users_collection):owner.objects.unlink(camera)
collections['90_REVIEW'].objects.link(camera);scene.camera=camera
bpy.ops.object.light_add(type='AREA',location=(0,0,40));light=bpy.context.object;light.name='REVIEW_Softbox';light.data.name='REVIEW_Softbox_light';light.data.energy=9000;light.data.size=70
for owner in list(light.users_collection):owner.objects.unlink(light)
collections['90_REVIEW'].objects.link(light)
if scene.world is None:scene.world=bpy.data.worlds.new('REVIEW_World')
scene.world.color=(.15,.18,.25);scene.render.engine='CYCLES';scene.cycles.samples=16;scene.view_settings.view_transform='AgX'
scene.render.resolution_x=1280;scene.render.resolution_y=720;scene.render.resolution_percentage=100
bpy.ops.object.select_all(action='DESELECT')
for obj in [root]+objects:obj.select_set(True)
bpy.context.view_layer.objects.active=root
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/blender/environment/env-backdrop-a/env-backdrop-a.blend'))
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/assets/models/environment/env-backdrop-a.glb'),export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_image_format='AUTO')
scene.render.filepath=str(ROOT/'design/reviews/rubble-phase-1/backdrop-blender-preview.png');bpy.ops.render.render(write_still=True)
report=dict(parts=parts,counts={m:sum(p['motif']==m for p in parts) for m in ['spire','tower','chimney','gable']},triangles=sum(p['triangles'] for p in parts),atlas=list(image.size))
(ROOT/'design/reviews/rubble-phase-1/backdrop-build.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))

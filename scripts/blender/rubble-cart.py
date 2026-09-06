"""Construct an accepted bounded heap in its owned Blender source via MCP."""
import bpy,bmesh,json,math
from pathlib import Path
from mathutils import Vector
ROOT=Path('/private/tmp/rubble-square-art');ASSET=Path(bpy.data.filepath).stem
assert ASSET in ['env-rubble-cart']
config=json.loads((ROOT/f'design/references/{ASSET}/contract.json').read_text())
SOURCE=ROOT/f'art/blender/environment/{ASSET}/{ASSET}.blend';OUT=ROOT/f'design/reviews/rubble-phase-2/{ASSET}'
assert Path(bpy.data.filepath)==SOURCE
root=bpy.data.objects.get(ASSET) or bpy.data.objects[config['previous']];root.name=ASSET
collider=bpy.data.objects[config['collider']]
def collision():return {'vertices':[list(v.co) for v in collider.data.vertices],'faces':[list(p.vertices) for p in collider.data.polygons],'matrix':[list(r) for r in collider.matrix_world]}
before=collision()
for name in ['00_GUIDES','10_RENDER','20_COLLISION','30_SOCKETS','90_REVIEW']:
    if name not in bpy.data.collections:
        bpy.context.scene.collection.children.link(bpy.data.collections.new(name))
for obj in list(bpy.data.objects):
    if obj.name.startswith(('VIS_','GUIDE_','REVIEW_')):bpy.data.objects.remove(obj,do_unlink=True)
for collection in [bpy.data.meshes,bpy.data.cameras,bpy.data.lights]:
    for data in list(collection):
        if data.users==0:collection.remove(data)
for obj,collection in [(root,'10_RENDER'),(collider,'20_COLLISION')]:
    for c in list(obj.users_collection):c.objects.unlink(obj)
    bpy.data.collections[collection].objects.link(obj)
with bpy.data.libraries.load(str(ROOT/'art/blender/environment/env-facade-a/env-facade-a.blend'),link=False) as (available,loaded):
    loaded.materials=[n for n in ['MAT_Plaster','MAT_Brick','MAT_TimberSoot'] if n not in bpy.data.materials]
if 'MAT_Metal' not in bpy.data.materials:
    material=bpy.data.materials['MAT_TimberSoot'].copy();material.name='MAT_Metal'
    image=bpy.data.images.load(str(ROOT/'design/references/env-rubble-cart/metal-atlas-source.png'))
    originalSize=list(image.size);image.name='TEX_Metal';image.scale(1024,1024)
    image.filepath_raw=str(ROOT/'public/assets/textures/rubble/TEX_Metal.png');image.file_format='PNG';image.save();image.pack()
    for node in material.node_tree.nodes:
        if node.type=='TEX_IMAGE':node.image=image
    (OUT/'metal-atlas.json').write_text(json.dumps({'originalSize':originalSize,'runtimeSize':[1024,1024],'roles':1,'method':'Uniform Blender atlas reduction; generated orthographic sheets untouched.'},indent=2)+'\n')
materials={role:bpy.data.materials['MAT_'+role] for role in config.get('materialRoles',['Plaster','Brick','TimberSoot'])}
collider.data.materials.clear();collider.data.materials.append(next(iter(materials.values())))
parts=json.loads((ROOT/f'design/references/{ASSET}/guide-parts.json').read_text())
groups={role:[] for role in materials}
for part in parts:
    vertices=part['vertices'];faces=part['faces']
    mesh=bpy.data.meshes.new('VIS_'+part['name']+'_mesh');mesh.from_pydata(vertices,[],faces);mesh.update()
    bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bmesh.ops.bevel(bm,geom=list(bm.edges),offset=.005,segments=1,affect='EDGES',clamp_overlap=True)
    bm.to_mesh(mesh);bm.free();mesh.update()
    uv=mesh.uv_layers.new(name='UV_Atlas');tint=mesh.color_attributes.new(name='Tint',type='FLOAT_COLOR',domain='CORNER')
    role=part['role'];color={'Plaster':(.75,.85,.94,1),'Brick':(1,.95,.92,1),'TimberSoot':(.23,.26,.20,1),'Metal':(.65,.75,.85,1)}[role]
    if ASSET=='env-brick-stack':color=(1,.85,.75,1)
    for face in mesh.polygons:
        axis=max(range(3),key=lambda i:abs(face.normal[i]));axes=[i for i in range(3) if i!=axis]
        for li in face.loop_indices:
            co=mesh.vertices[mesh.loops[li].vertex_index].co
            minima=[min(v.co[a] for v in mesh.vertices) for a in axes]
            spans=[max(v.co[a] for v in mesh.vertices)-minima[i] for i,a in enumerate(axes)]
            u=(co[axes[0]]-minima[0])/max(spans[0],.00001);v=(co[axes[1]]-minima[1])/max(spans[1],.00001)
            if role=='Metal':uv.data[li].uv=(.015+u*.475,.515+v*.475)
            elif role=='Brick':uv.data[li].uv=(.02+u*.22,.88+v*.105)
            else:uv.data[li].uv=(.15+u*.5,.15+v*.5)
            tint.data[li].color=color
    mesh.materials.append(materials[role]);obj=bpy.data.objects.new('VIS_'+part['name'],mesh);bpy.data.collections['10_RENDER'].objects.link(obj);obj.parent=root;groups[role].append(obj)
objects=[]
for role,members in groups.items():
    bpy.ops.object.select_all(action='DESELECT')
    for obj in members:obj.select_set(True)
    bpy.context.view_layer.objects.active=members[0]
    if len(members)>1:bpy.ops.object.join()
    obj=bpy.context.view_layer.objects.active;obj.name='VIS_'+role.lower();obj.data.name=obj.name+'_mesh';obj.parent=root;objects.append(obj)
# Source-only calibration capsule, exactly .7 m wide and 1.7 m tall.
verts=[];faces=[];rings=[]
for centre,angles in [(.35,[-math.pi/2,-math.pi/3,-math.pi/6,0]),(1.35,[0,math.pi/6,math.pi/3,math.pi/2])]:
    for angle in angles:
        rings.append((.35*math.cos(angle),centre+.35*math.sin(angle)))
for radius,z in rings:
    verts.extend([(1.15+radius*math.cos(i*math.tau/16),radius*math.sin(i*math.tau/16),z) for i in range(16)])
for r in range(len(rings)-1):
    for i in range(16):faces.append((r*16+i,r*16+(i+1)%16,(r+1)*16+(i+1)%16,(r+1)*16+i))
m=bpy.data.meshes.new('GUIDE_Calibration_mesh');m.from_pydata(verts,[],faces);o=bpy.data.objects.new('GUIDE_Calibration',m);bpy.data.collections['00_GUIDES'].objects.link(o)
scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
camera=bpy.data.objects.new('REVIEW_Game',bpy.data.cameras.new('REVIEW_Game_data'));bpy.data.collections['90_REVIEW'].objects.link(camera)
camera.location=(1.2,-2.6,1.7);camera.rotation_euler=(Vector((0,0,config['visualBounds'][1]/2))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.lens=55;scene.camera=camera
light=bpy.data.objects.new('REVIEW_Softbox',bpy.data.lights.new('REVIEW_Softbox_data','AREA'));bpy.data.collections['90_REVIEW'].objects.link(light);light.location=(-2,-3,4);light.data.energy=500;light.data.shape='DISK';light.data.size=5;light.rotation_euler=(Vector((0,0,.3))-light.location).to_track_quat('-Z','Y').to_euler()
if scene.world is None:scene.world=bpy.data.worlds.new('REVIEW_World')
scene.world.color=(.18,.23,.29);scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=1000;scene.render.resolution_y=1000;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX';collider.hide_render=True
assert collision()==before
for obj in objects:assert tuple(obj.scale)==(1,1,1) and tuple(obj.location)==(0,0,0)
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE));scene.render.filepath=str(OUT/'blender-preview.png');bpy.ops.render.render(write_still=True)
report={'asset':ASSET,'pieces':parts,'collisionEqual':True,'collider':before,'objects':[]}
for obj in objects:
    obj.data.calc_loop_triangles();report['objects'].append({'name':obj.name,'triangles':len(obj.data.loop_triangles)})
(OUT/'build.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))

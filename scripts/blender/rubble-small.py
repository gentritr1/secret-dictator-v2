"""Construct the accepted six-piece prop in its owned Blender source via MCP."""
import bpy,bmesh,json,math
from pathlib import Path
from mathutils import Vector
ROOT=Path('/private/tmp/rubble-square-art');ASSET='env-rubble-small'
SOURCE=ROOT/f'art/blender/environment/{ASSET}/{ASSET}.blend';OUT=ROOT/f'design/reviews/rubble-phase-2/{ASSET}'
assert Path(bpy.data.filepath)==SOURCE
root=bpy.data.objects.get(ASSET) or bpy.data.objects['env-crate-a'];root.name=ASSET
collider=bpy.data.objects['COL_crate']
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
materials={role:bpy.data.materials['MAT_'+role] for role in ['Plaster','Brick','TimberSoot']}
collider.data.materials.clear();collider.data.materials.append(materials['Plaster'])
parts=json.loads((ROOT/f'design/references/{ASSET}/guide-parts.json').read_text())
groups={role:[] for role in materials}
for part in parts:
    outline=part['xz'];y0,y1=part['y'];n=len(outline)
    vertices=[(x,y,z) for y in [y0,y1] for x,z in outline]
    faces=[tuple(range(n)),tuple(reversed(range(n,2*n)))]+[(i,i+n,(i+1)%n+n,(i+1)%n) for i in range(n)]
    mesh=bpy.data.meshes.new('VIS_'+part['name']+'_mesh');mesh.from_pydata(vertices,[],faces);mesh.update()
    bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bmesh.ops.bevel(bm,geom=list(bm.edges),offset=.005,segments=1,affect='EDGES',clamp_overlap=True)
    bm.to_mesh(mesh);bm.free();mesh.update()
    # Restore only outer extrema shortened by the edge bevel; keep the sheet envelope.
    for v in mesh.vertices:
        if v.co.x<-.335:v.co.x=-.3375
        if v.co.x>.335:v.co.x=.3375
    # Bevels stay inside each piece's envelope, with the sheet's peak restored.
    if part['name']=='plaster-tall':
        for v in mesh.vertices:
            if v.co.z>.615:v.co.z=.62
    uv=mesh.uv_layers.new(name='UV_Atlas');tint=mesh.color_attributes.new(name='Tint',type='FLOAT_COLOR',domain='CORNER')
    role=part['role'];color={'Plaster':(.75,.85,.94,1),'Brick':(1,.95,.92,1),'TimberSoot':(.2,.25,.324,1)}[role]
    for face in mesh.polygons:
        axis=max(range(3),key=lambda i:abs(face.normal[i]));axes=[i for i in range(3) if i!=axis]
        for li in face.loop_indices:
            co=mesh.vertices[mesh.loops[li].vertex_index].co
            if role=='Brick':
                # Sample one painted brick interior; no wall mortar across a loose fragment.
                uv.data[li].uv=(.18+(co[axes[0]]+.34)*.18,.19+(co[axes[1]]+.34)*.18)
            else:uv.data[li].uv=(co[axes[0]]*1.7+.3,co[axes[1]]*1.7+.3)
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
camera.location=(1.2,-2.6,1.7);camera.rotation_euler=(Vector((0,0,.31))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.lens=55;scene.camera=camera
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

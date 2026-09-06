"""First facade blockout. Run through MCP with the owned source open."""
import bpy, json, math
from pathlib import Path
from mathutils import Vector
from mathutils.geometry import tessellate_polygon

ROOT = Path('/private/tmp/rubble-square-art')
SOURCE = ROOT/'art/blender/environment/env-facade-a/env-facade-a.blend'
OUT = ROOT/'design/reviews/rubble-phase-2/env-facade-a'
assert Path(bpy.data.filepath) == SOURCE
scene = bpy.context.scene
root = bpy.data.objects['env-facade-a']
collider = bpy.data.objects['COL_wall']
socket = bpy.data.objects['SOCKET_lamp']
assert tuple(root.location) == (0, 0, 0)
assert len(collider.data.vertices) == 8 and len(collider.modifiers) == 0
preserved = {o.name: {'matrix': [list(row) for row in o.matrix_world],
             'vertices': [list(v.co) for v in o.data.vertices] if o.type == 'MESH' else None}
             for o in [collider, socket]}
for obj in list(bpy.data.objects):
    if obj not in [root, collider, socket]: bpy.data.objects.remove(obj, do_unlink=True)
for obj in [root, collider, socket]:
    for collection in list(obj.users_collection): collection.objects.unlink(obj)
for collection in list(bpy.data.collections): bpy.data.collections.remove(collection)
collider.data.materials.clear()
for blocks in [bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights]:
    for block in list(blocks):
        if block.users == 0: blocks.remove(block)
collections = {}
for name in ['00_GUIDES', '10_RENDER', '20_COLLISION', '30_SOCKETS', '90_REVIEW']:
    collection = bpy.data.collections.new(name)
    scene.collection.children.link(collection); collections[name] = collection
collections['10_RENDER'].objects.link(root)
collections['20_COLLISION'].objects.link(collider)
collections['30_SOCKETS'].objects.link(socket)
scene.unit_settings.system = 'METRIC'; scene.unit_settings.scale_length = 1

# Geometry is authored in baked coordinates. No transform_apply is used.
groups = {role: {'vertices': [], 'faces': [], 'uv': [], 'tints': []}
          for role in ['Plaster', 'Brick', 'TimberSoot']}
parts = []
def polygon(role, coordinates, tint=(1, 1, 1, 1), uv=None):
    group = groups[role]; offset = len(group['vertices'])
    group['vertices'].extend(coordinates)
    group['faces'].append(tuple(range(offset, offset+len(coordinates))))
    group['tints'].extend([tint]*len(coordinates))
    if uv is None:
        normal = (Vector(coordinates[1])-Vector(coordinates[0])).cross(Vector(coordinates[2])-Vector(coordinates[0]))
        axis = max(range(3), key=lambda i: abs(normal[i]))
        axes = [i for i in range(3) if i != axis]
        scale = 2 if role == 'Plaster' else (1.2 if role == 'Brick' else 2)
        uv = [(p[axes[0]]/scale, p[axes[1]]/scale) for p in coordinates]
    group['uv'].extend(uv)

def box(role, x0, x1, y0, y1, z0, z1, tint=(1, 1, 1, 1)):
    v = [(x0,y0,z0),(x1,y0,z0),(x1,y0,z1),(x0,y0,z1),
         (x0,y1,z0),(x1,y1,z0),(x1,y1,z1),(x0,y1,z1)]
    for face in [(0,1,2,3),(5,4,7,6),(4,0,3,7),(1,5,6,2),(3,2,6,7),(4,5,1,0)]:
        polygon(role, [v[i] for i in face], tint)

windows = [(x,z) for z in [1.65,3.45,5.1] for x in [-1.425,1.425]]
holes = [(x-.45,x+.45,z-.575,z+.575) for x,z in windows] + [(-.5,.5,0,2.05)]
xs = sorted(set([-2.25,2.25]+[v for h in holes for v in h[:2]]))
zs = sorted(set([0,6]+[v for h in holes for v in h[2:]]))
for x0,x1 in zip(xs,xs[1:]):
    for z0,z1 in zip(zs,zs[1:]):
        x=(x0+x1)/2;z=(z0+z1)/2
        if any(a<x<b and c<z<d for a,b,c,d in holes): continue
        polygon('Plaster',[(x0,-.2,z0),(x1,-.2,z0),(x1,-.2,z1),(x0,-.2,z1)])
# Gable shell, rear, sides, and opening reveals.
outline=[(-2.25,0),(2.25,0),(2.25,6),(0,7.755),(-2.25,6)]
polygon('Plaster',[(-2.25,-.2,6),(2.25,-.2,6),(0,-.2,7.755)])
polygon('Plaster',[(x,1.2,z) for x,z in reversed(outline)])
for (x0,z0),(x1,z1) in zip(outline,outline[1:]+outline[:1]):
    polygon('Plaster',[(x0,-.2,z0),(x0,1.2,z0),(x1,1.2,z1),(x1,-.2,z1)])
for x0,x1,z0,z1 in holes:
    for a,b in [((x0,z0),(x0,z1)),((x0,z1),(x1,z1)),((x1,z1),(x1,z0)),((x1,z0),(x0,z0))]:
        polygon('Plaster',[(a[0],-.2,a[1]),(b[0],-.2,b[1]),(b[0],-.08,b[1]),(a[0],-.08,a[1])],(.8,.84,.9,1))
parts.append({'name':'wall_shell','count':1})

for side in [-1,1]:
    # Each slope is a thin closed prism contained in the 4.5 x 7.8 x 1.5 envelope.
    section=[(0,7.8),(side*2.25,6.045),(side*2.25,6),(0,7.755)]
    if side == -1: section.reverse()
    polygon('TimberSoot',[(x,-.3,z) for x,z in section],(.40,.50,.65,1))
    polygon('TimberSoot',[(x,1.2,z) for x,z in reversed(section)],(.40,.50,.65,1))
    for a,b in zip(section,section[1:]+section[:1]):
        polygon('TimberSoot',[(a[0],-.3,a[1]),(a[0],1.2,a[1]),(b[0],1.2,b[1]),(b[0],-.3,b[1])],(.40,.50,.65,1))
parts.append({'name':'roof_slopes','count':2})

for number,(x,z) in enumerate(windows,1):
    x0=x-.45;x1=x+.45;z0=z-.575;z1=z+.575;w=.065
    # Four rails form one ring frame; no horizontal mullion.
    for a,b,c,d in [(x0,x0+w,z0,z1),(x1-w,x1,z0,z1),(x0+w,x1-w,z0,z0+w),(x0+w,x1-w,z1-w,z1)]:
        box('TimberSoot',a,b,-.285,-.075,c,d,(.42,.55,.72,1))
    box('TimberSoot',x-.03,x+.03,-.26,-.075,z0+w,z1-w,(.42,.55,.72,1))
    for a,b in [(x0+w,x-.03),(x+.03,x1-w)]:
        box('TimberSoot',a,b,-.085,-.065,z0+w,z1-w,(.095,.16,.26,1))
parts += [{'name':'window_frames','count':6},{'name':'vertical_mullions','count':6},{'name':'unlit_panes','count':12}]
for i in range(5):
    x0=-.435+i*.174
    box('TimberSoot',x0+.005,x0+.169,-.23,-.08,0,1.985,(.48+i*.009,.58+i*.009,.72+i*.009,1))
for a,b,c,d in [(-.5,-.435,0,2.05),(.435,.5,0,2.05),(-.435,.435,1.985,2.05)]:
    box('TimberSoot',a,b,-.29,-.08,c,d,(.37,.48,.64,1))
parts += [{'name':'door_boards','count':5},{'name':'door_frame_pieces','count':3}]
for px,py in [(87,407),(413,512),(183,650),(310,615),(90,804),(405,814)]:
    points=[((px+dx-256)/80,-.202,(850-py-dy)/80) for dx,dy in [(0,0),(16,-6),(23,8),(17,28),(-2,24)]]
    points.reverse()
    polygon('Brick',points,(.78,.83,.9,1))
parts.append({'name':'brick_patches','count':6})
box('Plaster',.6375,.8625,-.208,-.201,1.2375,1.5625,(1.1,1.1,1.08,1))
parts.append({'name':'blank_notice','count':1})

objects=[]
for role,group in groups.items():
    name={'Plaster':'VIS_plaster','Brick':'VIS_brick','TimberSoot':'VIS_joinery'}[role]
    mesh=bpy.data.meshes.new(name+'_mesh');mesh.from_pydata(group['vertices'],[],group['faces']);mesh.update()
    uv=mesh.uv_layers.new(name='UV_Atlas')
    colour=mesh.color_attributes.new(name='Tint',type='FLOAT_COLOR',domain='CORNER')
    for loop in mesh.loops:
        uv.data[loop.index].uv=group['uv'][loop.vertex_index]
        colour.data[loop.index].color=group['tints'][loop.vertex_index]
    material=bpy.data.materials.new('MAT_'+role);material.use_nodes=True;material.use_backface_culling=True
    bsdf=material.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Roughness'].default_value=.9;bsdf.inputs['Metallic'].default_value=0
    bsdf.inputs['Base Color'].default_value={'Plaster':(.4,.4,.38,1),'Brick':(.25,.18,.15,1),'TimberSoot':(.08,.12,.18,1)}[role]
    mesh.materials.append(material)
    obj=bpy.data.objects.new(name,mesh);collections['10_RENDER'].objects.link(obj);obj.parent=root;objects.append(obj)

# Non-exported calibration capsule.
vertices=[];faces=[];rings=[]
for centre,angles in [(.35,[-math.pi/2+j*math.pi/12 for j in range(7)]),(1.35,[j*math.pi/12 for j in range(7)])]:
    for angle in angles:
        ring=[]
        for k in range(16):
            ring.append(len(vertices));vertices.append((3+.35*math.cos(angle)*math.cos(k*math.tau/16),.35*math.cos(angle)*math.sin(k*math.tau/16),centre+.35*math.sin(angle)))
        rings.append(ring)
for a,b in zip(rings,rings[1:]):
    for k in range(16):faces.append((a[k],a[(k+1)%16],b[(k+1)%16],b[k]))
mesh=bpy.data.meshes.new('GUIDE_Calibration_mesh');mesh.from_pydata(vertices,[],faces)
guide=bpy.data.objects.new('GUIDE_Calibration',mesh);collections['00_GUIDES'].objects.link(guide)
def review_object(obj,name):
    obj.name=name;obj.data.name=name+'_data'
    for collection in list(obj.users_collection):collection.objects.unlink(obj)
    collections['90_REVIEW'].objects.link(obj)
bpy.ops.object.camera_add(location=(4,-12,1.7));camera=bpy.context.object;review_object(camera,'REVIEW_Game')
camera.rotation_euler=(Vector((0,0,3.9))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.lens=38;scene.camera=camera
bpy.ops.object.light_add(type='AREA',location=(-3,-7,11));light=bpy.context.object;review_object(light,'REVIEW_Softbox');light.data.energy=1800;light.data.size=8
if scene.world is None:scene.world=bpy.data.worlds.new('REVIEW_World')
scene.world.color=(.15,.18,.25);scene.render.engine='CYCLES';scene.cycles.samples=24;scene.view_settings.view_transform='AgX'
scene.render.resolution_x=1100;scene.render.resolution_y=1100;scene.render.resolution_percentage=100
collider.hide_render=True
for obj in [collider,socket]:
    assert [list(row) for row in obj.matrix_world] == preserved[obj.name]['matrix']
assert [list(v.co) for v in collider.data.vertices] == preserved['COL_wall']['vertices']
report={'stage':'blockout','parts':parts,'preserved':preserved,'objects':[]}
for obj in objects:
    obj.data.calc_loop_triangles();report['objects'].append({'name':obj.name,'triangles':len(obj.data.loop_triangles),'vertices':len(obj.data.vertices)})
(OUT/'facade-build.json').write_text(json.dumps(report,indent=2)+'\n')
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
scene.render.filepath=str(OUT/'blockout-blender.png');bpy.ops.render.render(write_still=True)
print(json.dumps(report))

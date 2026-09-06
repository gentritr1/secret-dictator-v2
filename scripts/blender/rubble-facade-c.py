"""Build the accepted boarded shopfront module in its own source through MCP."""
import bpy, bmesh, json, hashlib
from pathlib import Path
from mathutils import Vector

ROOT=Path('/private/tmp/rubble-square-art')
SOURCE=ROOT/'art/blender/environment/env-facade-c/env-facade-c.blend'
OUT=ROOT/'design/reviews/rubble-phase-2/env-facade-c'
assert Path(bpy.data.filepath)==SOURCE
assert sorted(c.name for c in bpy.data.collections)==['00_GUIDES','10_RENDER','20_COLLISION','30_SOCKETS','90_REVIEW']
root=bpy.data.objects.get('env-facade-c') or bpy.data.objects['env-facade-a']
root.name='env-facade-c'
collider=bpy.data.objects['COL_wall'];socket=bpy.data.objects['SOCKET_lamp']
def contract():
    return {'vertices':[list(v.co) for v in collider.data.vertices], 'faces':[list(p.vertices) for p in collider.data.polygons],
            'colliderMatrix':[list(v) for v in collider.matrix_world], 'socketMatrix':[list(v) for v in socket.matrix_world]}
before=contract()
materials={role:bpy.data.materials['MAT_'+role] for role in ['Plaster','Brick','TimberSoot']}
for obj in list(bpy.data.objects):
    if obj.name.startswith('VIS_'):
        mesh=obj.data;bpy.data.objects.remove(obj,do_unlink=True)
        if mesh.users==0:bpy.data.meshes.remove(mesh)
groups={role:{'vertices':[],'faces':[],'tints':[],'uv':[]} for role in materials}
def polygon(role,points,tint):
    group=groups[role];start=len(group['vertices']);group['vertices'].extend(points)
    group['faces'].append(tuple(range(start,start+len(points))));group['tints'].extend([tint]*len(points))
    normal=(Vector(points[1])-Vector(points[0])).cross(Vector(points[2])-Vector(points[0]))
    axis=max(range(3),key=lambda k:abs(normal[k]));axes=[i for i in range(3) if i!=axis]
    if role=='Brick':uv=[(p[0]/.8,p[2]/.6) for p in points]
    elif role=='Plaster':uv=[(p[axes[0]]/4.5,p[axes[1]]/4.5) for p in points]
    else:uv=[(p[axes[1]]/2,p[axes[0]]/2) for p in points]
    group['uv'].extend(uv)
def box(role,x0,x1,y0,y1,z0,z1,tint):
    v=[(x0,y0,z0),(x1,y0,z0),(x1,y0,z1),(x0,y0,z1),(x0,y1,z0),(x1,y1,z0),(x1,y1,z1),(x0,y1,z1)]
    for f in [(0,1,2,3),(5,4,7,6),(4,0,3,7),(1,5,6,2),(3,2,6,7),(4,5,1,0)]:polygon(role,[v[i] for i in f],tint)
def slab(role,outline,y0,y1,tint):
    polygon(role,[(x,y0,z) for x,z in outline],tint)
    polygon(role,[(x,y1,z) for x,z in reversed(outline)],tint)
    for a,b in zip(outline,outline[1:]+outline[:1]):polygon(role,[(a[0],y0,a[1]),(a[0],y1,a[1]),(b[0],y1,b[1]),(b[0],y0,b[1])],tint)
exterior=(.87,.93,1,1);wood=(.20,.25,.324,1);pane=(.04275,.072,.117,1)
windows=[(x,z) for z in [3.7,5.25] for x in [-1.1,1.1]]
holes=[(x-.45,x+.45,z-.55,z+.55) for x,z in windows]+[(-1.95,.05,.6,2.1),(.8,1.8,0,2.1)]
xs=sorted(set([-2.25,2.25]+[v for h in holes for v in h[:2]]));zs=sorted(set([0,6]+[v for h in holes for v in h[2:]]))
for x0,x1 in zip(xs,xs[1:]):
    for z0,z1 in zip(zs,zs[1:]):
        x=(x0+x1)/2;z=(z0+z1)/2
        if any(a<x<b and c<z<d for a,b,c,d in holes):continue
        polygon('Plaster',[(x0,-.2,z0),(x1,-.2,z0),(x1,-.2,z1),(x0,-.2,z1)],exterior)
outline=[(-2.25,0),(2.25,0),(2.25,6),(0,7.12),(-2.25,6)]
polygon('Plaster',[(-2.25,-.2,6),(2.25,-.2,6),(0,-.2,7.12)],exterior)
polygon('Plaster',[(x,1.2,z) for x,z in reversed(outline)],exterior)
for a,b in zip(outline,outline[1:]+outline[:1]):polygon('Plaster',[(a[0],-.2,a[1]),(a[0],1.2,a[1]),(b[0],1.2,b[1]),(b[0],-.2,b[1])],exterior)
for x0,x1,z0,z1 in holes:
    for a,b in [((x0,z0),(x0,z1)),((x0,z1),(x1,z1)),((x1,z1),(x1,z0)),((x1,z0),(x0,z0))]:
        polygon('Plaster',[(a[0],-.2,a[1]),(b[0],-.2,b[1]),(b[0],-.06,b[1]),(a[0],-.06,a[1])],(.65,.70,.8,1))
for side in [-1,1]:
    section=[(0,7.2),(side*2.25,6.08),(side*2.25,6),(0,7.12)]
    if side==-1:section.reverse()
    slab('TimberSoot',section,-.3,1.2,(.18,.225,.2925,1))
for x,z in windows:
    x0=x-.45;x1=x+.45;z0=z-.55;z1=z+.55;w=.065
    for a,b,c,d in [(x0,x0+w,z0,z1),(x1-w,x1,z0,z1),(x0+w,x1-w,z0,z0+w),(x0+w,x1-w,z1-w,z1)]:box('TimberSoot',a,b,-.285,-.065,c,d,wood)
    box('TimberSoot',x-.03,x+.03,-.26,-.065,z0+w,z1-w,wood)
    for a,b in [(x0+w,x-.03),(x+.03,x1-w)]:box('TimberSoot',a,b,-.075,-.055,z0+w,z1-w,pane)
# Boarded display: six horizontal boards, four frame rails, two diagonal braces.
x0=-1.95;x1=.05;z0=.6;z1=2.1;w=.065
for a,b,c,d in [(x0,x0+w,z0,z1),(x1-w,x1,z0,z1),(x0+w,x1-w,z0,z0+w),(x0+w,x1-w,z1-w,z1)]:box('TimberSoot',a,b,-.29,-.065,c,d,wood)
for i in range(6):
    bottom=.665+i*(1.37/6)
    box('TimberSoot',-1.885,-.015,-.205,-.065,bottom+.004,bottom+1.37/6-.004,(.205+i*.003,.255+i*.003,.325+i*.003,1))
def brace(a,b,y0,y1):
    dx=b[0]-a[0];dz=b[1]-a[1];length=(dx*dx+dz*dz)**.5
    nx=-dz/length*.055;nz=dx/length*.055
    outline=[(a[0]-nx,a[1]-nz),(b[0]-nx,b[1]-nz),(b[0]+nx,b[1]+nz),(a[0]+nx,a[1]+nz)]
    slab('TimberSoot',outline,y0,y1,(.165,.215,.29,1))
brace((-1.82,.73),(-.08,1.97),-.265,-.21)
brace((-1.82,1.97),(-.08,.73),-.285,-.268)
for i in range(5):box('TimberSoot',.865+i*.174+.005,.865+i*.174+.169,-.23,-.06,0,2.035,(.216+i*.004,.261+i*.004,.324+i*.004,1))
for a,b,c,d in [(.8,.865,0,2.1),(1.735,1.8,0,2.1),(.865,1.735,2.035,2.1)]:box('TimberSoot',a,b,-.29,-.06,c,d,wood)
box('TimberSoot',-1.95,1.95,-.285,-.20,2.55,2.91,wood)
outline=[(0,0),(7,-2),(10,0),(14,-4),(18,1),(24,9),(20,15),(21,23),(12,24),(8,21),(-1,22),(0,14),(-2,9)]
for px,py in [(83,509),(265,405),(411,560),(280,779)]:
    polygon('Brick',[((px+dx-256)/80,-.202,(850-py-dy)/80) for dx,dy in reversed(outline)],(1,.95,.92,1))
objects=[]
for role,group in groups.items():
    name={'Plaster':'VIS_plaster','Brick':'VIS_brick','TimberSoot':'VIS_joinery'}[role]
    mesh=bpy.data.meshes.new(name+'_mesh');mesh.from_pydata(group['vertices'],[],group['faces']);mesh.update()
    uv=mesh.uv_layers.new(name='UV_Atlas');tint=mesh.color_attributes.new(name='Tint',type='FLOAT_COLOR',domain='CORNER')
    for loop in mesh.loops:
        uv.data[loop.index].uv=group['uv'][loop.vertex_index];tint.data[loop.index].color=group['tints'][loop.vertex_index]
    mesh.materials.append(materials[role]);obj=bpy.data.objects.new(name,mesh);bpy.data.collections['10_RENDER'].objects.link(obj);obj.parent=root;objects.append(obj)
    if role=='TimberSoot':
        bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000001);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
        edges=[e for e in bm.edges if e.is_manifold and e.calc_face_angle()>.1]
        bmesh.ops.bevel(bm,geom=edges,offset=.01,segments=1,affect='EDGES',clamp_overlap=True)
        bm.to_mesh(mesh);bm.free();mesh.update()
        # Keep the sheet's roof peak after the tiny edge bevel.
        for vertex in mesh.vertices:
            if vertex.co.z>7.19:vertex.co.z=7.2
assert contract()==before
scene=bpy.context.scene;scene.camera.location=(4,-12,1.7);scene.camera.rotation_euler=(Vector((0,0,3.6))-scene.camera.location).to_track_quat('-Z','Y').to_euler()
scene.render.filepath=str(OUT/'blender-preview.png')
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE));bpy.ops.render.render(write_still=True)
report={'asset':'env-facade-c','parts':{'roofSlopes':2,'windows':4,'mullions':4,'panes':8,'displayBoards':6,'displayBraces':2,'displayFrameRails':4,'doorBoards':5,'doorFramePieces':3,'blankFascia':1,'brickExposures':4},'collisionSocketEqual':True,'objects':[]}
for obj in objects:
    obj.data.calc_loop_triangles();report['objects'].append({'name':obj.name,'triangles':len(obj.data.loop_triangles),'vertices':len(obj.data.vertices)})
(OUT/'build.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))

"""Build the accepted half-collapsed module in its own source through MCP."""
import bpy, bmesh, json, hashlib
from pathlib import Path
from mathutils import Vector

ROOT=Path('/private/tmp/rubble-square-art')
SOURCE=ROOT/'art/blender/environment/env-facade-b/env-facade-b.blend'
OUT=ROOT/'design/reviews/rubble-phase-2/env-facade-b'
assert Path(bpy.data.filepath)==SOURCE
assert sorted(c.name for c in bpy.data.collections)==['00_GUIDES','10_RENDER','20_COLLISION','30_SOCKETS','90_REVIEW']
root=bpy.data.objects.get('env-facade-b') or bpy.data.objects['env-facade-a']
root.name='env-facade-b'
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
exterior=(.87,.93,1,1);interior=(.50,.64,.72,1);wood=(.20,.25,.324,1);pane=(.04275,.072,.117,1)
windows=[(-1.5125,3.45),(-1.5125,4.9)]
holes=[(x-.45,x+.45,z-.575,z+.575) for x,z in windows]+[(-1.9625,-.9625,0,2.05)]
xs=sorted(set([-2.25,-.8]+[v for h in holes for v in h[:2]]));zs=sorted(set([0,6.35]+[v for h in holes for v in h[2:]]))
def roof_height(x):return 5.35+(x+2.25)/1.45
def under_roof(points):
    result=[]
    for a,b in zip(points,points[1:]+points[:1]):
        da=roof_height(a[0])-a[1];db=roof_height(b[0])-b[1]
        if da>=0:result.append(a)
        if (da>=0)!=(db>=0):
            t=da/(da-db);result.append((a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])))
    return result
for x0,x1 in zip(xs,xs[1:]):
    for z0,z1 in zip(zs,zs[1:]):
        x=(x0+x1)/2;z=(z0+z1)/2
        if any(a<x<b and c<z<d for a,b,c,d in holes):continue
        outline=under_roof([(x0,z0),(x1,z0),(x1,z1),(x0,z1)])
        if len(outline)>=3:polygon('Plaster',[(x,-.2,z) for x,z in outline],exterior)
for x0,x1,z0,z1 in holes:
    for a,b in [((x0,z0),(x0,z1)),((x0,z1),(x1,z1)),((x1,z1),(x1,z0)),((x1,z0),(x0,z0))]:
        polygon('Plaster',[(a[0],-.2,a[1]),(b[0],-.2,b[1]),(b[0],-.06,b[1]),(a[0],-.06,a[1])],(.65,.70,.8,1))
# Broken frontage edges and low rubble sill, contained within the old wall line.
slab('Plaster',[(-.8,1.15),(-.7375,1.15),(-.7375,2.3125),(-.5375,2.5),(-.7375,2.6625),(-.775,4.05),(-.575,4.175),(-.8,4.35)],-.2,-.06,exterior)
slab('Plaster',[(-.8,0),(2.25,0),(2.25,1.15),(1.6125,1.05),(.9125,1.1875),(.3625,.9875),(-.2,1.2),(-.8,1.15)],-.2,-.06,exterior)
# Rear exposed room wall, left surviving rear wall, and two returns.
rear=[(-.8,0),(2.25,0),(2.25,4.6),(1.7,4.5375),(1.2875,4.6875),(.825,4.4875),(.4875,4.725),(.1,4.5125),(-.2,4.7125),(-.8,4.55)]
slab('Plaster',rear,1.06,1.2,interior)
slab('Plaster',[(-2.25,0),(-.8,0),(-.8,6.35),(-2.25,5.35)],1.06,1.2,exterior)
box('Plaster',-2.25,-2.12,-.2,1.2,0,5.35,exterior)
box('Plaster',2.12,2.25,-.2,1.2,0,4.6,exterior)
slab('TimberSoot',[(-2.25,5.35),(-.8,6.35),(-.8,6.4),(-2.25,5.4)],-.3,1.2,(.18,.225,.2925,1))
for top in [2.55,4.3]:
    box('TimberSoot',-.75,2.12,-.2,1.06,top-.175,top,wood)
    for x in [-.295,.705,1.705]:box('TimberSoot',x-.055,x+.055,-.29,1.06,top-.3375,top-.175,wood)
for x,z in windows:
    x0=x-.45;x1=x+.45;z0=z-.575;z1=z+.575;w=.065
    for a,b,c,d in [(x0,x0+w,z0,z1),(x1-w,x1,z0,z1),(x0+w,x1-w,z0,z0+w),(x0+w,x1-w,z1-w,z1)]:box('TimberSoot',a,b,-.285,-.065,c,d,wood)
    box('TimberSoot',x-.03,x+.03,-.26,-.065,z0+w,z1-w,wood)
    for a,b in [(x0+w,x-.03),(x+.03,x1-w)]:box('TimberSoot',a,b,-.075,-.055,z0+w,z1-w,pane)
for i in range(5):box('TimberSoot',-1.8975+i*.174+.005,-1.8975+i*.174+.169,-.23,-.06,0,1.985,(.216+i*.004,.261+i*.004,.324+i*.004,1))
for a,b,c,d in [(-1.9625,-1.8975,0,2.05),(-1.0275,-.9625,0,2.05),(-1.8975,-1.0275,1.985,2.05)]:box('TimberSoot',a,b,-.29,-.06,c,d,wood)
outline=[(0,0),(7,-2),(10,0),(17,-4),(19,1),(26,9),(21,14),(22,23),(12,25),(8,22),(-2,23),(0,14),(-2,9)]
for px,py in [(79,624),(179,568),(334,789)]:
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
            if vertex.co.z>6.39:vertex.co.z=6.4
assert contract()==before
scene=bpy.context.scene;scene.camera.location=(4,-12,1.7);scene.camera.rotation_euler=(Vector((0,0,3.2))-scene.camera.location).to_track_quat('-Z','Y').to_euler()
scene.render.filepath=str(OUT/'blender-preview.png')
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE));bpy.ops.render.render(write_still=True)
report={'asset':'env-facade-b','parts':{'roofFragments':1,'floors':2,'joists':6,'windows':2,'mullions':2,'panes':4,'doorBoards':5,'doorFramePieces':3,'brickExposures':3},'collisionSocketEqual':True,'objects':[]}
for obj in objects:
    obj.data.calc_loop_triangles();report['objects'].append({'name':obj.name,'triangles':len(obj.data.loop_triangles),'vertices':len(obj.data.vertices)})
(OUT/'build.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))

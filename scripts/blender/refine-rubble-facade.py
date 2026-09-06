"""Review-driven surface refinements, through MCP, with collision untouched."""
import bpy,json
from pathlib import Path
ROOT=Path('/private/tmp/rubble-square-art')
OUT=ROOT/'design/reviews/rubble-phase-2/env-facade-a'
assert Path(bpy.data.filepath)==ROOT/'art/blender/environment/env-facade-a/env-facade-a.blend'
plaster=bpy.data.objects['VIS_plaster'].data
image=bpy.data.images['TEX_Plaster_Facade'];pixels=list(image.pixels)
# The blank notice samples one pale pigment texel, retaining the plaster role.
bright=max(range(len(pixels)//4),key=lambda i:sum(pixels[i*4:i*4+3]))
paper_uv=((bright%1024+.5)/1024,(bright//1024+.5)/1024)
for loop in plaster.loops:
    co=plaster.vertices[loop.vertex_index].co
    is_notice=.6374<=co.x<=.8626 and 1.2374<=co.z<=1.5626 and co.y<-.2005
    if is_notice:
        plaster.uv_layers.active.data[loop.index].uv=paper_uv
        plaster.color_attributes['Tint'].data[loop.index].color=(1,1,1,1)
    else:
        datum=plaster.uv_layers.active.data[loop.index];datum.uv=datum.uv*(2/4.5)
joinery=bpy.data.objects['VIS_joinery'].data
for datum in joinery.color_attributes['Tint'].data:
    c=datum.color;datum.color=(c[0]*.45,c[1]*.45,c[2]*.45,1)

obj=bpy.data.objects['VIS_brick'];old=obj.data;material=old.materials[0]
vertices=[];faces=[]
# Irregular chipped edges within each sheet patch envelope, not neat pentagons.
outline=[(0,0),(9,-2),(10,-6),(16,-6),(17,0),(22,2),(20,8),(23,10),(19,15),
         (20,22),(17,28),(10,25),(6,28),(1,24),(-2,24),(0,17),(-2,13),(1,8)]
for px,py in [(87,407),(413,512),(183,650),(310,615),(90,804),(405,814)]:
    start=len(vertices)
    vertices.extend([((px+dx-256)/80,-.202,(850-py-dy)/80) for dx,dy in reversed(outline)])
    faces.append(tuple(range(start,len(vertices))))
mesh=bpy.data.meshes.new('VIS_brick_refined_mesh');mesh.from_pydata(vertices,[],faces);mesh.update();obj.data=mesh
bpy.data.meshes.remove(old);mesh.name='VIS_brick_mesh';mesh.materials.append(material)
uv=mesh.uv_layers.new(name='UV_Atlas');tint=mesh.color_attributes.new(name='Tint',type='FLOAT_COLOR',domain='CORNER')
for loop in mesh.loops:
    co=mesh.vertices[loop.vertex_index].co;uv.data[loop.index].uv=(co.x/.8,co.z/.6)
    tint.data[loop.index].color=(1,.95,.92,1)

exported=[bpy.data.objects[n] for n in ['env-facade-a','VIS_plaster','VIS_brick','VIS_joinery','COL_wall','SOCKET_lamp']]
bpy.ops.object.select_all(action='DESELECT')
for obj in exported:obj.select_set(True)
bpy.context.view_layer.objects.active=bpy.data.objects['env-facade-a']
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/blender/environment/env-facade-a/env-facade-a.blend'))
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/assets/models/environment/env-facade-a.glb'),export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_image_format='AUTO')
bpy.context.scene.render.filepath=str(OUT/'refined-blender.png');bpy.ops.render.render(write_still=True)
report=json.loads((OUT/'facade-painted-build.json').read_text());report['stage']='refined';report['objects']=[]
for obj in exported:
    if obj.type!='MESH':continue
    obj.data.calc_loop_triangles();report['objects'].append({'name':obj.name,'triangles':len(obj.data.loop_triangles),'vertices':len(obj.data.vertices),'scale':list(obj.scale)})
report['surfaceReview']={'plasterTileWorldMetres':4.5,'brickTileWorldMetres':[.8,.6],'joineryTintMultiplier':.45,'noticeConstantUV':paper_uv}
(OUT/'facade-final-build.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))

"""Albedo-only correction measured against the fixed phase-1 night frame."""
import bpy,json
from pathlib import Path
ROOT=Path('/private/tmp/rubble-square-art')
assert Path(bpy.data.filepath)==ROOT/'art/blender/environment/env-ground-a/env-ground-a.blend'
material=bpy.data.materials['MAT_Plaster'];nodes=material.node_tree.nodes
bsdf=nodes.get('Principled BSDF');tex=nodes.get('TEX_Plaster_Cobble')
old=nodes.get('Rubble_AlbedoTint')
if old:nodes.remove(old)
tint=nodes.new('ShaderNodeMix');tint.name='Rubble_AlbedoTint';tint.data_type='RGBA';tint.blend_type='MULTIPLY'
tint.inputs[0].default_value=1;tint.inputs[7].default_value=(.8,.9,1,1)
material.node_tree.links.new(tex.outputs['Color'],tint.inputs[6]);material.node_tree.links.new(tint.outputs[2],bsdf.inputs['Base Color'])
# Replace the earlier ellipsoid ruler with the pipeline's actual capsule.
guide=bpy.data.objects['GUIDE_Calibration'];mesh=guide.data
verts=[];faces=[];rings=[]
import math
for zc,angles in [(.35,[-math.pi/2+j*math.pi/12 for j in range(7)]),(1.35,[j*math.pi/12 for j in range(7)])]:
 for angle in angles:
  ring=[]
  for k in range(16):
   ring.append(len(verts));verts.append((.35*math.cos(angle)*math.cos(k*math.tau/16),.35*math.cos(angle)*math.sin(k*math.tau/16),zc+.35*math.sin(angle)))
  rings.append(ring)
for j in range(len(rings)-1):
 for k in range(16):faces.append((rings[j][k],rings[j][(k+1)%16],rings[j+1][(k+1)%16],rings[j+1][k]))
mesh.clear_geometry();mesh.from_pydata(verts,[],faces);mesh.update();guide.location.z=0
bpy.ops.object.select_all(action='DESELECT')
for name in ['env-ground-a','COL_ground','VIS_cobble_field','VIS_tram_scars']:bpy.data.objects[name].select_set(True)
bpy.context.view_layer.objects.active=bpy.data.objects['env-ground-a']
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/blender/environment/env-ground-a/env-ground-a.blend'))
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/assets/models/environment/env-ground-a.glb'),export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_image_format='AUTO')
bpy.context.scene.render.filepath=str(ROOT/'design/reviews/rubble-phase-1/ground-blender-preview.png');bpy.ops.render.render(write_still=True)
print(json.dumps({'albedoMultiplier':[.8,.9,1],'lightingChanged':False}))

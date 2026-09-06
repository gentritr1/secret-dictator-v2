import bpy,json
from pathlib import Path
source=Path('/private/tmp/rubble-square-art/art/blender/environment/env-brick-stack/env-brick-stack.blend')
bpy.ops.wm.open_mainfile(filepath=str(source))
report={'source':bpy.data.filepath,'units':bpy.context.scene.unit_settings.system,'scale':bpy.context.scene.unit_settings.scale_length,'collections':[c.name for c in bpy.data.collections],'objects':[{'name':o.name,'type':o.type,'location':list(o.location),'dimensions':list(o.dimensions),'scale':list(o.scale),'parent':o.parent.name if o.parent else None} for o in bpy.data.objects]}
print(json.dumps(report))

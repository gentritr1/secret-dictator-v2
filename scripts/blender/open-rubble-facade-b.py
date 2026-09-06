import bpy, json
from pathlib import Path
p=Path('/private/tmp/rubble-square-art/art/blender/environment/env-facade-b/env-facade-b.blend')
bpy.ops.wm.open_mainfile(filepath=str(p))
print(json.dumps({'source':bpy.data.filepath,'objects':[o.name for o in bpy.data.objects],'collections':[c.name for c in bpy.data.collections]}))

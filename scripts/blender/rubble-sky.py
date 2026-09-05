"""Prepare the single panorama through Blender MCP; no sheet transformation."""
import bpy
from pathlib import Path
ROOT=Path('/private/tmp/rubble-square-art')
image=bpy.data.images.load(str(ROOT/'design/references/env-sky-dusk/panorama-source.png'),check_existing=False)
image.name='TEX_Emissive_DuskPanorama'
image.colorspace_settings.name='sRGB'
image.scale(4096,1024)
image.filepath_raw=str(ROOT/'public/assets/textures/rubble/TEX_Emissive_DuskPanorama.png')
image.file_format='PNG';image.save();image.pack()
source=ROOT/'art/blender/environment/env-sky-dusk/env-sky-dusk.blend'
source.parent.mkdir(parents=True,exist_ok=True)
bpy.data.libraries.write(str(source),{image})
print({'image':image.name,'size':list(image.size),'source':str(source)})

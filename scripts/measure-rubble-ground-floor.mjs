import { chromium } from 'playwright';
import { mkdirSync,writeFileSync,readFileSync } from 'node:fs';
const base=process.env.REVIEW_URL||'http://127.0.0.1:5184';
const out=process.argv[2]||'design/reviews/rubble-phase-1';
mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
const report={url:base,instrumentation:'Browser route appends temporary review access; production files are unchanged.',errors:[]};
try {
 const page=await browser.newPage({viewport:{width:1280,height:720},reducedMotion:'reduce'});
 page.on('pageerror',e=>report.errors.push(e.message));
 await page.route('**/src/play/main.js*',async route=>{
  const r=await route.fetch();await route.fulfill({response:r,body:await r.text()+'\nwindow.__rubbleReview={scene,rig,renderer,lighting,THREE};\n'});
 });
 await page.route('**/src/play/assets.js*',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:await r.text()+'\nexport {GLTFLoader};\n'});});
 await page.goto(base+'/play.html');await page.waitForFunction(()=>window.__rubbleReview&&window.__play?.environment.ok);await page.waitForTimeout(2400);
 report.environment=await page.evaluate(()=>window.__play.environment);
 report.textureState=await page.evaluate(()=>{
  const {scene}=window.__rubbleReview;const meshes=[];
  scene.traverse(n=>{if(n.isMesh){for(const m of Array.isArray(n.material)?n.material:[n.material]){
   if(m.map || m.uniforms?.uPanorama)meshes.push({node:n.name,material:m.name,map:m.map?.image?{width:m.map.image.width,height:m.map.image.height}:null,panorama:m.uniforms?.uPanorama?.value?.image?{width:m.uniforms.uPanorama.value.image.width,height:m.uniforms.uPanorama.value.image.height,active:m.uniforms.uHasPanorama.value}:null});
  }}});return meshes;
 });
 await page.evaluate(()=>{const p=window.__play;p.restart(1000,7,0);});await page.waitForTimeout(2400);
 await page.evaluate(()=>{const p=window.__play;p.pause();p.setLighting('trial',true);p.teleport(p.marks.podium.x,0,p.marks.podium.z);p.face(0,9);for(const id of ['tray','card','objective','controls','prompt']){const e=document.getElementById(id);if(e)e.style.visibility='hidden';}});await page.waitForTimeout(500);
 const frame=await page.screenshot({path:out+'/ground-floor-frame.png'});
 report.groundFloor=await page.evaluate(async data=>{
  const im=new Image();im.src=data;await im.decode();const c=document.createElement('canvas');c.width=1280;c.height=720;const ctx=c.getContext('2d');ctx.drawImage(im,0,0);const rgb=ctx.getImageData(0,0,1280,720).data;
  const {scene,rig,renderer,THREE}=window.__rubbleReview;
  const changed=[];const fog=scene.fog,background=scene.background;scene.fog=null;scene.background=new THREE.Color(0);
  scene.traverse(n=>{if(n.isMesh){const old=n.material;const floor=/VIS_cobble_field|VIS_cobble_accent|VIS_tram_scars/.test(n.name);const mat=new THREE.MeshBasicMaterial({color:floor?0xffffff:0,side:THREE.DoubleSide,toneMapped:false});changed.push([n,old,mat]);n.material=mat;}});
  const target=new THREE.WebGLRenderTarget(1280,720);const previous=renderer.getRenderTarget();renderer.setRenderTarget(target);renderer.render(scene,rig.camera);const mask=new Uint8Array(1280*720*4);renderer.readRenderTargetPixels(target,0,0,1280,720,mask);renderer.setRenderTarget(previous);target.dispose();for(const[n,old,mat]of changed){n.material=old;mat.dispose();}scene.fog=fog;scene.background=background;
  let count=0,darkest=null;const minima=[255,255,255];
  for(let y=1;y<719;y++)for(let x=1;x<1279;x++){
   const index=((719-y)*1280+x)*4;
   // Erode one pixel to omit antialiased silhouette boundaries.
   if([0,-4,4,-5120,5120].some(d=>mask[index+d]<250))continue;
   const i=(y*1280+x)*4,a=[rgb[i],rgb[i+1],rgb[i+2]],l=a[0]*.2126+a[1]*.7152+a[2]*.0722;count++;
   for(let k=0;k<3;k++)minima[k]=Math.min(minima[k],a[k]);if(!darkest||l<darkest.luma)darkest={rgb:a,luma:l,x,y};
  }
  return {method:'Actual ground VIS ID render, eroded one pixel, sampled against unchanged 1280x720 screenshot; all other meshes occlude.',pixels:count,darkest,channelMinima:minima,recordedFloor:[1,11,20],passesComponentFloor:minima.every((v,i)=>v>=[1,11,20][i])};
 },'data:image/png;base64,'+frame.toString('base64'));
 writeFileSync(out+'/ground-floor-measurement.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.groundFloor));
}finally{await browser.close();}

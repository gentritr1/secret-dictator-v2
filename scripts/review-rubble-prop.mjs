import {chromium} from 'playwright';
import {writeFileSync,readFileSync,existsSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const asset=process.argv[2];
const config=JSON.parse(readFileSync(`design/references/${asset}/contract.json`));
const out=process.argv[3];
assert.ok(out,'Explicit new output directory required');
assert.ok(!existsSync(out),'Refusing to overwrite evidence');mkdirSync(out,{recursive:true});
const base=process.env.REVIEW_URL || 'http://127.0.0.1:5184';
const browser=await chromium.launch();
const report={asset,localCameraOffset:config.reviewCameraOffset||[1.8,2.7],errors:[],warnings:[]};
try {
  const page=await browser.newPage({viewport:{width:1280,height:720},reducedMotion:'reduce'});
  page.on('pageerror',e=>report.errors.push(e.message));
  page.on('console',m=>{if(m.type()==='warning')report.warnings.push(m.text());});
  await page.route('**/src/play/assets.js*',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:await r.text()+'\nexport {GLTFLoader};\n'});});
  await page.route('**/src/play/main.js*',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:(await r.text()).replace('function frame(now) {','function frame(now) { if (window.__propStill) { requestAnimationFrame(frame); return; }')+'\nwindow.__propReview={scene,rig,renderer};\n'});});
  await page.goto(base+'/play.html');await page.waitForFunction(()=>window.__play?.environment.ok);
  report.decoded=await page.evaluate(asset=>window.__propReview.scene.children.filter(n=>n.name===asset).map(g=>{
    const maps=[];g.traverse(n=>{if(n.isMesh&&n.name.startsWith('VIS_'))maps.push({node:n.name,material:n.material.name,width:n.material.map?.image?.width,height:n.material.map?.image?.height,tint:n.material.vertexColors});});return {position:g.position.toArray(),maps};
  }),asset);
  assert.equal(report.decoded.length,config.placements.length);assert.ok(report.decoded.every(g=>g.maps.length===(config.materialRoles?.length||3)&&g.maps.every(m=>m.width===1024&&m.height===1024&&m.tint)));
  report.refusals=await page.evaluate(async asset=>{
    const A=await import('/src/play/assets.js'),spec=A.ENVIRONMENT.find(s=>s.id===asset),gltf=await new A.GLTFLoader().loadAsync(A.assetUrl(spec));
    return spec.requiredNodes.map(name=>{const scene=gltf.scene.clone(true);scene.getObjectByName(name).name='REVIEW_Removed';const result=A.buildEnvironment(scene,spec);return {removed:name,ok:result.ok,reason:result.reason};});
  },asset);assert.ok(report.refusals.every(r=>!r.ok&&r.reason==='missing-nodes'));
  for(const state of ['day','dusk','trial']) {
    await page.evaluate(()=>window.__play.restart(1000,7,0));await page.waitForTimeout(2400);
    await page.evaluate(({state,place,height,offset})=>{
      window.__play.pause();window.__play.setLighting(state,true);window.__propStill=true;
      for(const id of ['tray','card','objective','controls','prompt','labels']){const e=document.getElementById(id);if(e)e.style.visibility='hidden';}
      const r=window.__propReview;r.rig.camera.position.set(place.x+offset[0],1.7,place.z+offset[1]);r.rig.camera.lookAt(place.x,height/2,place.z);r.rig.camera.updateMatrixWorld();r.renderer.render(r.scene,r.rig.camera);
    },{state,place:config.placements[0],height:config.visualBounds[1],offset:config.reviewCameraOffset||[1.8,2.7]});await page.screenshot({path:`${out}/eye-height-${state}.png`});await page.evaluate(()=>window.__propStill=false);
  }
  await page.goto(base+'/play.html?tone=linear');await page.waitForFunction(()=>window.__play?.environment.ok);
  report.linear=await page.evaluate(()=>({tone:window.__play.lighting().toneMapping,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches}));assert.equal(report.linear.tone,'linear');assert.ok(report.linear.reducedMotion);
  const url=`**/assets/models/environment/${asset}.glb`;
  await page.route(url,route=>route.abort());await page.reload();await page.waitForFunction(()=>window.__play?.environment.reason==='load-failed');
  report.fallback=await page.evaluate(asset=>({count:window.__play.environment.fallbacks.filter(f=>f.id===asset&&f.fallback==='capsule').length,complete:window.__play.runToEnd().over}),asset);assert.equal(report.fallback.count,config.placements.length);assert.ok(report.fallback.complete);
  await page.unroute(url);await page.setViewportSize({width:1100,height:1100});
  await page.goto(`${base}/asset-lab.html?asset=environment/${asset}.glb`);await page.waitForFunction(()=>window.__lab?.report?.file);
  await page.evaluate(({height,position})=>{window.__lab.mood('day');const {camera}=window.__lab.probe();camera.fov=45;camera.updateProjectionMatrix();camera.position.set(...position);camera.lookAt(0,height/2,0);camera.updateMatrixWorld();document.getElementById('panel').style.visibility='hidden';},{height:config.visualBounds[1],position:config.heroCameraPosition||[1.2,1.7,2.6]});
  await page.waitForTimeout(250);await page.screenshot({path:out+'/hero-model.png'});
  report.heroCamera={position:config.heroCameraPosition||[1.2,1.7,2.6],target:[0,config.visualBounds[1]/2,0],fov:45};
  writeFileSync(out+'/browser-review.json',JSON.stringify(report,null,2)+'\n');assert.equal(report.errors.length,0);console.log(JSON.stringify(report));
}finally{await browser.close();}

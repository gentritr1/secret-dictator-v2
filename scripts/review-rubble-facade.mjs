import {chromium} from 'playwright';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const base=process.env.REVIEW_URL || 'http://127.0.0.1:5184';
const out='design/reviews/rubble-phase-2/env-facade-a';
const browser=await chromium.launch();
const report={url:base,errors:[],warnings:[],instrumentation:'Temporary browser routes expose the live scene and GLTFLoader. Production entry points are unchanged.'};
try {
  const page=await browser.newPage({viewport:{width:1280,height:720},reducedMotion:'reduce'});
  page.on('pageerror',e=>report.errors.push(e.message));
  page.on('console',m=>{if(m.type()==='warning')report.warnings.push(m.text());});
  await page.route('**/src/play/assets.js*',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:await r.text()+'\nexport {GLTFLoader};\n'});});
  await page.route('**/src/play/main.js*',async route=>{
    const r=await route.fetch();await route.fulfill({response:r,body:(await r.text()).replace('function frame(now) {','function frame(now) { if (window.__facadeStill) { requestAnimationFrame(frame); return; }')+'\nwindow.__facadeReview={scene,rig,renderer,lighting,THREE};\n'});
  });
  await page.goto(base+'/play.html');await page.waitForFunction(()=>window.__play?.environment.ok);await page.waitForTimeout(2400);
  report.environment=await page.evaluate(()=>window.__play.environment);
  report.decoded=await page.evaluate(()=>{
    const groups=window.__facadeReview.scene.children.filter(n=>n.name==='env-facade-a');
    return groups.map(g=>{
      const maps=[];g.traverse(n=>{if(n.isMesh&&n.name.startsWith('VIS_'))maps.push({node:n.name,material:n.material.name,colourTint:n.material.vertexColors,width:n.material.map?.image?.width,height:n.material.map?.image?.height});});
      return {position:g.position.toArray(),maps};
    });
  });
  assert.equal(report.decoded.length,7);
  assert.ok(report.decoded.every(g=>g.maps.length===3&&g.maps.every(m=>m.width===1024&&m.height===1024&&m.colourTint)));
  report.refusals=await page.evaluate(async()=>{
    const A=await import('/src/play/assets.js'),spec=A.ENVIRONMENT.find(s=>s.id==='env-facade-a');
    const gltf=await new A.GLTFLoader().loadAsync(A.assetUrl(spec));
    return spec.requiredNodes.map(name=>{
      const scene=gltf.scene.clone(true);scene.getObjectByName(name).name='REVIEW_Removed';
      const result=A.buildEnvironment(scene,spec);return {removed:name,ok:result.ok,reason:result.reason,fallback:spec.fallback};
    });
  });
  assert.ok(report.refusals.every(r=>!r.ok&&r.reason==='missing-nodes'&&r.fallback==='capsule'));
  for(const state of ['day','dusk','trial']) {
    await page.evaluate(()=>window.__play.restart(1000,7,0));await page.waitForTimeout(2400);
    await page.evaluate(state=>{
      window.__play.pause();window.__play.setLighting(state,true);window.__facadeStill=true;
      for(const id of ['tray','card','objective','controls','prompt','labels']){const e=document.getElementById(id);if(e)e.style.visibility='hidden';}
      const r=window.__facadeReview;r.rig.camera.position.set(4,1.7,2.6);r.rig.camera.lookAt(0,3.9,13.6);r.rig.camera.updateMatrixWorld();r.renderer.render(r.scene,r.rig.camera);
    },state);
    await page.screenshot({path:`${out}/eye-height-${state}.png`});
    await page.evaluate(()=>window.__facadeStill=false);
  }
  await page.goto(base+'/play.html?tone=linear');await page.waitForFunction(()=>window.__play?.environment.ok);await page.waitForTimeout(2400);
  report.linear=await page.evaluate(()=>({tone:window.__play.lighting().toneMapping,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,environmentOK:window.__play.environment.ok}));
  assert.equal(report.linear.tone,'linear');assert.ok(report.linear.reducedMotion&&report.linear.environmentOK);
  await page.route('**/assets/models/environment/env-facade-a.glb',route=>route.abort());
  await page.reload();await page.waitForFunction(()=>window.__play?.environment.reason==='load-failed');await page.waitForTimeout(2400);
  report.missingFile=await page.evaluate(()=>({fallbacks:window.__play.environment.fallbacks,replay:window.__play.runToEnd()}));
  assert.equal(report.missingFile.fallbacks.filter(f=>f.id==='env-facade-a'&&f.fallback==='capsule').length,7);
  assert.ok(report.missingFile.replay.over);

  await page.setViewportSize({width:1100,height:1100});
  await page.unroute('**/assets/models/environment/env-facade-a.glb');
  await page.goto(base+'/asset-lab.html?asset=environment/env-facade-a.glb');await page.waitForFunction(()=>window.__lab?.report?.file);
  await page.evaluate(()=>{
    window.__lab.mood('day');const {camera}=window.__lab.probe();camera.fov=45;camera.updateProjectionMatrix();camera.position.set(4,1.7,12);camera.lookAt(0,3.9,0);camera.updateMatrixWorld();document.getElementById('panel').style.visibility='hidden';
  });
  await page.waitForTimeout(250);await page.screenshot({path:out+'/hero-model.png'});
  report.heroCamera={position:[4,1.7,12],target:[0,3.9,0],fov:45,source:'Actual asset-lab scene, day mood, AgX, supplemental camera; fixed six captures retained separately.'};
  writeFileSync(out+'/browser-review.json',JSON.stringify(report,null,2)+'\n');
  assert.equal(report.errors.length,0);
  console.log(JSON.stringify({decodedPlacements:report.decoded.length,refusals:report.refusals,linear:report.linear,missingFile:report.missingFile}));
} finally {await browser.close();}

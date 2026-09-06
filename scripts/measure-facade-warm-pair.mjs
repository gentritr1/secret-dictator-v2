import {chromium} from 'playwright';
import {execFileSync} from 'node:child_process';
import {mkdirSync, writeFileSync, readFileSync} from 'node:fs';
import {measurePixels} from './rubble-pixels.mjs';
const base=process.env.REVIEW_URL || 'http://127.0.0.1:5184';
const asset=process.env.PAIR_ASSET || 'env-facade-a';
if(!/^env-facade-[abc]$/.test(asset))throw Error('Unknown facade');
const intendedCount=asset==='env-facade-a'?7:2;
const out=process.env.PAIR_OUTPUT || `design/reviews/rubble-phase-2/${asset}/paired-warm`;
mkdirSync(out,{recursive:true});
const oldBytes=process.env.PAIR_REFERENCE ? readFileSync(process.env.PAIR_REFERENCE) : execFileSync('git',['show','73a154c:public/assets/models/environment/env-facade-a.glb']);
const browser=await chromium.launch();
const report={method:'Same frozen scene, lights, camera and animation instant. Toggle all intended placements of the selected facade between the immutable 73a154c GLB and candidate; redraw shadows. Same rubble-pixels classifier, 1280x720, seed1000/7, podium camera. Three independent trial instants retained. Supplemental isolation measurement, not a replacement for full-scene captures.',allowancePp:0,errors:[],pairs:[]};
report.reference=process.env.PAIR_REFERENCE || '73a154c:public/assets/models/environment/env-facade-a.glb';
report.resolutionPp=.001;
report.asset=asset;report.intendedPlacements=intendedCount;
if(process.env.PAIR_REFERENCE)report.method=report.method.replace('the immutable 73a154c GLB','the explicitly recorded diagnostic reference GLB');
try {
  const page=await browser.newPage({viewport:{width:1280,height:720},reducedMotion:'reduce'});
  page.on('pageerror',e=>report.errors.push(e.message));
  await page.route('**/__before-facade.glb',r=>r.fulfill({contentType:'model/gltf-binary',body:oldBytes}));
  await page.route('**/src/play/assets.js*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+'\nexport {GLTFLoader};\n'});});
  await page.route('**/src/play/main.js*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace('function frame(now) {','function frame(now) { if (window.__facadeStill) { requestAnimationFrame(frame); return; }')+'\nwindow.__facadeReview={scene,rig,renderer};\n'});
  });
  await page.goto(base+'/play.html');
  await page.waitForFunction(()=>window.__play?.environment.ok);
  await page.waitForTimeout(2500);
  for (const [index,state] of ['day','dusk','trial','trial','trial'].entries()) {
    await page.evaluate(()=>{
      const r=window.__facadeReview;
      for(const n of r.previous || [])r.scene.remove(n);
      for(const n of r.current || [])n.visible=true;
      window.__facadeStill=false;
      for(const id of ['tray','card','objective','controls','prompt']) {const e=document.getElementById(id);if(e)e.style.visibility='';}
    });
    await page.evaluate(()=>window.__play.restart(1000,7,0));
    await page.waitForTimeout(2400);
    await page.evaluate(state=>{
      const p=window.__play;p.pause();p.setLighting(state,true);p.teleport(p.marks.podium.x,0,p.marks.podium.z);p.face(0,9);
    },state);
    await page.waitForTimeout(500);
    const count=await page.evaluate(async asset=>{
      window.__facadeStill=true;
      const A=await import('/src/play/assets.js');const {scene}=window.__facadeReview;
      const current=scene.children.filter(n=>n.name===asset);
      const template=await new A.GLTFLoader().loadAsync('/__before-facade.glb');
      const previous=A.ENVIRONMENT.filter(s=>s.id===asset).map(spec=>{
        const built=A.buildEnvironment(template.scene.clone(true),{...spec,requiredNodes:['COL_wall','SOCKET_lamp']});
        if(!built.ok)throw Error(built.reason);built.visual.visible=false;scene.add(built.visual);return built.visual;
      });
      window.__facadeReview.current=current;window.__facadeReview.previous=previous;
      const camera=window.__facadeReview.rig.camera;
      return {current:current.length,previous:previous.length,camera:{position:camera.position.toArray(),quaternion:camera.quaternion.toArray(),fov:camera.fov}};
    },asset);
    if(count.current!==intendedCount || count.previous!==intendedCount)throw Error('Expected all intended facade placements');
    await page.addScriptTag({content:'window.measureFacadePixels='+measurePixels.toString()+';'});
    const pair={state,index,count};
    for(const variant of ['before','after']) {
      pair[variant]={};
      for(const hud of [true,false]) {
        const stats=await page.evaluate(({variant,hud})=>{
          const r=window.__facadeReview;
          r.current.forEach(n=>n.visible=variant==='after');r.previous.forEach(n=>n.visible=variant==='before');
          for(const id of ['tray','card','objective','controls','prompt']) {const e=document.getElementById(id);if(e)e.style.visibility=hud?'':'hidden';}
          r.scene.updateMatrixWorld(true);r.renderer.shadowMap.needsUpdate=true;r.renderer.render(r.scene,r.rig.camera);
          return {calls:r.renderer.info.render.calls,triangles:r.renderer.info.render.triangles};
        },{variant,hud});
        const bytes=await page.screenshot({path:`${out}/${index}-${state}-${variant}-${hud?'hud':'scene'}.png`});
        const measured=await page.evaluate(async source=>{
          const im=new Image();im.src=source;await im.decode();const c=document.createElement('canvas');c.width=1280;c.height=720;
          const ctx=c.getContext('2d');ctx.drawImage(im,0,0);const m=window.measureFacadePixels(ctx.getImageData(0,0,1280,720).data,1280,720);
          return {warm:m.warm,warmPct:m.warmPct,total:m.total};
        },'data:image/png;base64,'+bytes.toString('base64'));
        pair[variant][hud?'hud':'scene']={...measured,stats};
      }
    }
    pair.deltaPp=Object.fromEntries(['hud','scene'].map(k=>[k,pair.after[k].warmPct-pair.before[k].warmPct]));
    report.pairs.push(pair);
    console.log(JSON.stringify({state,index,deltaPp:pair.deltaPp}));
  }
  report.passesZeroAllowance=report.pairs.filter(p=>p.state==='trial').every(p=>p.deltaPp.hud<=report.resolutionPp && p.deltaPp.scene<=report.resolutionPp);
  writeFileSync(out+'/measurement.json',JSON.stringify(report,null,2)+'\n');
  if(report.errors.length || !report.passesZeroAllowance)throw Error('Facade paired warm gate failed');
} finally {await browser.close();}

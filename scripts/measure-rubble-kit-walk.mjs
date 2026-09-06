import {chromium} from 'playwright';
import {writeFileSync,existsSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const out=process.argv[2];
if(!out)throw Error('Pass a new output directory explicitly; no default is allowed');
if(existsSync(out))throw Error('Output exists; refusing to overwrite evidence');
mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
const report={method:'walk.html actual controller and camera. A temporary browser route substitutes the real square plus all ENVIRONMENT GLB collider parts for the obstacle course, using the same merge as play.html. No production files change. Geometry measurements and deterministic walks are compared to approved phase1 (16fa8af, same runtime as73a154c). This is an instrumented navigation check, not a human usability review.',errors:[],builds:{}};
const replacement=`
const reviewAssets=await import('/src/play/assets.js');
const reviewSquare=await import('/src/play/square.js');
const reviewEnvironment=await reviewAssets.loadEnvironment();
if(!reviewEnvironment.ok)throw Error('Square assets failed to load');
const reviewBuilt=reviewSquare.buildSquare({omit:reviewEnvironment.replaces});
const course=reviewBuilt.group;
for(const visual of reviewEnvironment.visuals)course.add(visual);
const colliderGeometry=reviewAssets.mergeGeometries([reviewBuilt.colliderGeometry,...reviewEnvironment.colliderParts],false);
window.__squareWalk={environment:reviewEnvironment,square:reviewSquare,course};
`;
try {
  for(const [name,base] of [['before','http://127.0.0.1:5185'],['after','http://127.0.0.1:5184']]) {
    const page=await browser.newPage({viewport:{width:1280,height:720},reducedMotion:'reduce'});
    page.on('pageerror',e=>report.errors.push({name,message:e.message}));
    await page.route('**/src/play/assets.js*',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:await r.text()+'\nexport {mergeGeometries};\n'});});
    await page.route('**/src/walk/main.js*',async route=>{
      const r=await route.fetch();const text=await r.text();
      if(!text.includes('const { group: course, colliderGeometry } = buildCourse();'))throw Error('Walk instrument source changed');
      await route.fulfill({response:r,body:text.replace('const { group: course, colliderGeometry } = buildCourse();',replacement)});
    });
    await page.goto(base+'/walk.html');await page.waitForFunction(()=>window.__walk&&window.__squareWalk);await page.waitForTimeout(500);
    const result=await page.evaluate(()=>{
      const w=window.__walk,r=window.__squareWalk;
      const colliders=r.environment.loaded.flatMap(a=>a.colliderParts.map(g=>{
        g.computeBoundingBox();const b=g.boundingBox;
        return {asset:a.id,name:g.name,min:b.min.toArray(),max:b.max.toArray(),size:b.max.clone().sub(b.min).toArray()};
      }));
      const walks=[];
      const cases=[
        ['spawn',[0,0,2],[0,0],1],['dais',[1.5,0,6.4],[0,1],1],
        ['north-boundary',[4.5,0,11],[0,1],2],['east-boundary',[11,0,4.5],[1,0],2],
        ['west-boundary',[-11,0,-4.5],[-1,0],2],['south-boundary',[0,0,-11],[0,-1],2],
        ['main-passage-left',[-.6,0,5.9],[0,1],.6],['main-passage-right',[.6,0,5.9],[0,1],.6],
        ['bench-approach',[-7.5,0,0],[-1,0],1],['bell-approach',[5.5,0,3.7],[0,1],1]
      ];
      for(const [id,at,input,seconds] of cases) {
        w.teleport(...at);w.tick(1/60,30);w.setInput(...input);const trace=w.tick(1/60,Math.round(seconds*60));w.setInput(0,0);
        walks.push({id,at,input,seconds,frames:trace.frames,substeps:trace.substeps,position:trace.state.position,grounded:trace.state.grounded});
      }
      w.teleport(1.5,0,6.4);w.tick(1/60,30);w.setInput(0,1);w.tick(1/60,60);w.setInput(0,0);
      return {colliders,walks,tuning:{height:w.tuning.height,radius:w.tuning.radius,stepHeight:w.tuning.stepHeight,maxSlopeDeg:w.tuning.maxSlopeDeg},anchors:{dais:r.square.DAIS,bell:r.square.BELL,bench:r.square.BENCH,spawn:r.square.SPAWN,ringRadius:r.square.RING_RADIUS},sockets:r.environment.sockets};
    });
    await page.screenshot({path:`${out}/walk-${name}.png`});report.builds[name]=result;await page.close();
  }
  writeFileSync(out+'/walk-comparison.json',JSON.stringify(report,null,2)+'\n');
  const normalize=build=>({...build,colliders:build.colliders.map(c=>({...c,asset:/^env-facade-[abc]$/.test(c.asset)?'facade-grid-bay':({'env-rubble-small':'env-crate-a','env-brick-stack':'env-crate-a','env-rubble-cart':'env-crate-a','env-rubble-large':'env-barrel-a'}[c.asset]||c.asset)}))});
  assert.deepEqual(normalize(report.builds.after),normalize(report.builds.before));
  report.comparison='Only facade and replacement dressing IDs normalize to their original roles; all collider measurements, traces, anchors, sockets and tuning compare exactly.';
  const after=report.builds.after;
  const dais=after.colliders.find(c=>c.name==='COL_dais');
  assert.ok(Math.abs(dais.size[0]-6)<.001 && Math.abs(dais.size[2]-3.4)<.001 && Math.abs(dais.max[1]-.22)<.001);
  assert.ok(Math.abs(after.walks.find(w=>w.id==='dais').position.y-.22)<.01);
  assert.ok(after.walks.filter(w=>w.id.startsWith('main-passage')).every(w=>w.position.z>6.8));
  report.equal=true;writeFileSync(out+'/walk-comparison.json',JSON.stringify(report,null,2)+'\n');
  assert.equal(report.errors.length,0);console.log(JSON.stringify({equal:report.equal,walks:after.walks,tuning:after.tuning}));
} finally {await browser.close();}

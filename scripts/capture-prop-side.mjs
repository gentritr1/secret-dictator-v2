import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
const asset=process.argv[2],output=process.argv[3];
if(!asset||!output||existsSync(output))throw Error('Pass asset ID and unused output image path');
const browser=await chromium.launch();
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 await page.goto(`http://127.0.0.1:5184/asset-lab.html?asset=environment/${asset}.glb`);
 await page.waitForFunction(()=>window.__lab?.report?.file);
 await page.evaluate(()=>{window.__lab.mood('day');window.__lab.camera('side');window.__lab.probe().scene.getObjectByName('guides').visible=false;});
 await page.waitForTimeout(250);await page.screenshot({path:output});
}finally{await browser.close();}

import { chromium } from 'playwright';
const name=process.argv[2]||'outline-template';
if(!['layout-template','outline-template'].includes(name))throw Error('Choose an authored template');
const browser=await chromium.launch();
try {
 const page=await browser.newPage({viewport:{width:1536,height:1024}});
 await page.goto(`http://127.0.0.1:5184/design/references/env-backdrop-a/${name}.svg`);
 await page.screenshot({path:`design/references/env-backdrop-a/${name}.png`});
} finally {await browser.close();}

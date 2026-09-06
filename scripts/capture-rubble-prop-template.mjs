import {chromium} from 'playwright';
const asset=process.argv[2];
if(!/^env-(rubble-small|rubble-large|brick-stack|rubble-cart|well-a)$/.test(asset))throw Error('Expected a phase-2 prop ID');
const browser=await chromium.launch();
try {
 const page=await browser.newPage({viewport:{width:1536,height:1024}});
 await page.goto(`http://127.0.0.1:5184/design/references/${asset}/layout-template.svg`);
 await page.screenshot({path:`design/references/${asset}/layout-template.png`});
} finally {await browser.close();}

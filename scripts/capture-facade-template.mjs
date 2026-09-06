import {chromium} from 'playwright';
const id=process.argv[2] || 'env-facade-a';
if(!/^env-facade-[abc]$/.test(id))throw Error('Unknown facade template');
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1536,height:1024}});
 await page.goto(`http://127.0.0.1:5184/design/references/${id}/layout-template.svg`);
 await page.screenshot({path:`design/references/${id}/layout-template.png`});
}finally{await browser.close();}

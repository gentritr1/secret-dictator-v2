import {chromium} from 'playwright';
import {writeFileSync} from 'node:fs';
const browser=await chromium.launch();
try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  await page.goto('http://127.0.0.1:5184/design/reviews/rubble-phase-2/index.html');
  await page.waitForLoadState('networkidle');
  const report=await page.evaluate(async()=>{
    await Promise.all([...document.images].map(async image=>{image.loading='eager';try{await image.decode();}catch{}}));
    return {images:[...document.images].map(image=>({src:image.getAttribute('src'),ok:image.complete&&image.naturalWidth>0})),links:[...document.querySelectorAll('a[href]')].map(a=>a.href)};
  });
  report.linkFailures=[];
  for(const url of report.links) {
    if(!url.startsWith('http://127.0.0.1:5184'))continue;
    const response=await page.request.get(url);
    if(!response.ok())report.linkFailures.push({url,status:response.status()});
  }
  await page.screenshot({path:'design/reviews/rubble-phase-2/combined/review-page.png'});
  writeFileSync('design/reviews/rubble-phase-2/combined/review-page-check.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({images:report.images.length,failedImages:report.images.filter(i=>!i.ok),failedLinks:report.linkFailures}));
  if(report.images.some(i=>!i.ok)||report.linkFailures.length)process.exitCode=1;
}finally{await browser.close();}

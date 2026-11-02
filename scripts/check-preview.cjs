// Optional browser regression check. Requires Playwright and installed Chromium.
// Run: NODE_PATH=<directory containing playwright> node scripts/check-preview.cjs <demo.html>
const {chromium}=require('playwright');
const fs=require('node:fs');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  for(const sandboxed of [false,true]){
   const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   const html=fs.readFileSync(process.argv[2]||'/tmp/atlas-flight-demo-v4.html','utf8');
   let view=page;
   if(sandboxed){await page.setContent('<iframe sandbox="allow-scripts allow-popups" style="width:100%;height:1000px"></iframe>');await page.locator('iframe').evaluate((el,source)=>el.srcdoc=source,html);view=page.frameLocator('iframe');}
   else await page.setContent(html);
   await view.locator('.card').first().waitFor();assert.equal(await view.locator('.card').count(),12);
   const before=await view.locator('.card strong').allTextContents();
   await view.locator('#origin').selectOption('BOS');await view.locator('#date').fill('2026-12-20');
   assert.match(await view.locator('#search-status').innerText(),/Changes not applied/);
   await view.locator('.search-button').click();
   assert.match(await view.locator('#summary').innerText(),/Dec 20/);
   assert.notDeepEqual(await view.locator('.card strong').allTextContents(),before);
   assert.match(await view.locator('#search-status').innerText(),/updated for Dec 20/);
   for(const href of await view.locator('.card a').evaluateAll(as=>as.map(a=>a.href)))assert.match(href,/\/bos\/[a-z]{3}\/261220\//);
   await view.locator('#date').fill('2026-12-21');await view.locator('#date').press('Enter');assert.match(await view.locator('#summary').innerText(),/Dec 21/);
   await view.locator('#trip').selectOption('roundtrip');await view.locator('#return-date').fill('2026-12-30');await view.locator('.search-button').click();
   for(const href of await view.locator('.card a').evaluateAll(as=>as.map(a=>a.href)))assert.match(href,/261221\/261230\//);
   await view.locator('#return-date').fill('2026-12-01');await view.locator('.search-button').click();assert.match(await view.locator('#error').innerText(),/Search not updated.*return date/);
   await view.locator('#trip').selectOption('multicity');await view.locator('#destination').selectOption('SGN');await view.locator('.leg-to').selectOption('SIN');await view.locator('.leg-date').fill('2026-12-24');await view.locator('.search-button').click();assert.equal(await view.locator('.card').count(),1);await view.locator('.multi-check').click();
   const legs=await view.locator('dialog a').evaluateAll(as=>as.map(a=>a.href));assert.match(legs[0],/bos\/sgn\/261221/);assert.match(legs[1],/sgn\/sin\/261224/);
   assert.deepEqual(errors,[]);await page.close();
   console.log(`PASS: ${sandboxed?'sandboxed preview (no allow-forms)':'standalone page'} refreshes prices, dates, and links after click/Enter; roundtrip and multi-city work.`);
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});

// Optional browser integration test: Playwright + installed Chromium. No provider calls.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
(async()=>{
 const {createApp}=await import(pathToFileURL(path.resolve('server.js')));
 const {createFlightService}=await import(pathToFileURL(path.resolve('lib/flights.js')));
 let calls=0,lastParams;
 const service=createFlightService({apiKey:'test-secret-not-a-real-key',dailyLimit:100,now:()=>new Date('2026-11-02T12:00:00Z'),request:async url=>{
  calls++;lastParams=new URL(url);const date=url.searchParams.get('outbound_date'),code=url.searchParams.get('arrival_id').split(',')[0],origin=url.searchParams.get('departure_id').split(',')[0];
  const segment=(from,to)=>({departure_airport:{id:from,time:date+' 10:00'},arrival_airport:{id:to,time:date+' 22:00'},airline:'Fixture Airline',flight_number:'FX 1',travel_class:'Business'});
  return {ok:true,json:async()=>({best_flights:[{price:2000+Number(date.slice(-2)),total_duration:1100,flights:[segment(origin,'DOH'),segment('DOH',code)]}],other_flights:[{price:3000,total_duration:900,flights:[segment(origin,code)]}]})};
 }});
 const server=createApp({service});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage();if(process.argv.includes('--netlify'))await page.route('**/api/status',route=>route.fulfill({json:{configured:true,liveTrips:['oneway'],maxDestinationsPerRequest:1}}));const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port);assert.equal(await page.locator('#data-source').inputValue(),'live');assert.equal(await page.locator('.card').count(),0);assert.equal(calls,0);
  await page.click('.search-button');await page.waitForFunction(()=>document.getElementById('search-status').textContent.includes('Search completed'));
  assert.equal(await page.locator('.card').count(),12);assert.equal(calls,12);assert.match(await page.locator('.card strong').first().innerText(),/2,015/);assert.match(await page.locator('#mode-note').innerText(),/LIVE/);assert.ok(!(await page.content()).includes('test-secret-not-a-real-key'));
  await page.check('#nonstop');assert.equal(await page.locator('.card').count(),12);assert.match(await page.locator('.card strong').first().innerText(),/3,000/);assert.equal(calls,12);await page.uncheck('#nonstop');
  await page.locator('.card button').first().click();assert.match(await page.locator('dialog').innerText(),/Fixture Airline/);assert.equal(await page.locator('dialog a').count(),2);await page.click('#close');
  await page.fill('#date','2026-12-20');await page.click('.search-button');await page.waitForFunction(()=>document.getElementById('search-status').textContent.includes('Search completed'));assert.equal(calls,24);assert.match(await page.locator('.card strong').first().innerText(),/2,020/);assert.match(await page.locator('.card a').first().getAttribute('href'),/261220/);
  await page.click('.search-button');await page.waitForFunction(()=>document.getElementById('search-status').textContent.includes('Search completed'));assert.equal(calls,24);
  await page.locator('.options-button').first().click();assert.equal(await page.locator('.card').count(),2);assert.equal(calls,24);assert.match(await page.locator('#search-status').innerText(),/No additional provider requests/);
  await page.selectOption('#sort','highest');assert.match(await page.locator('.card strong').first().innerText(),/3,000/);
  await page.selectOption('#sort','price');assert.match(await page.locator('.card strong').first().innerText(),/2,020/);
  await page.click('#refresh-prices');await page.waitForFunction(()=>document.getElementById('search-status').textContent.includes('Search completed'));assert.equal(calls,25);assert.equal(lastParams.searchParams.get('no_cache'),'true');
  const downloadPromise=page.waitForEvent('download');await page.click('#download-report');const download=await downloadPromise;const contents=require('node:fs').readFileSync(await download.path(),'utf8');const report=JSON.parse(contents);assert.equal(report.coverage.length,1);assert.equal(report.coverage[0].refreshed,true);assert.equal(report.coverage[0].providerParameters.no_cache,'true');assert.ok(report.coverage[0].diagnostics.offerAudit.length>0);assert.ok(!contents.includes('test-secret-not-a-real-key'));
  const previousAsian=await page.locator('#destination').inputValue();await page.click('#swap-route');assert.equal(await page.locator('#origin').inputValue(),previousAsian);assert.equal(await page.locator('#destination').inputValue(),'NYC');assert.equal(await page.locator('#date').inputValue(),'2026-12-20');assert.equal(await page.locator('.card').count(),0);assert.equal(calls,25);
  await page.click('.search-button');await page.waitForFunction(()=>document.getElementById('search-status').textContent.includes('Search completed'));assert.equal(calls,26);assert.equal(lastParams.searchParams.get('departure_id'),previousAsian);assert.equal(lastParams.searchParams.get('arrival_id'),'JFK,EWR,LGA');assert.equal(await page.locator('.card').count(),2);assert.match(await page.locator('.card .route-code').first().innerText(),new RegExp(previousAsian+' → JFK'));assert.match(await page.locator('.card a').first().getAttribute('href'),new RegExp('/'+previousAsian.toLowerCase()+'/jfk/261220/'));
  await page.selectOption('#origin','Asia');await page.selectOption('#destination','BOS');await page.click('.search-button');await page.waitForFunction(()=>document.getElementById('search-status').textContent.includes('Search completed'));assert.equal(calls,38);assert.equal(await page.locator('.card').count(),12);assert.match(await page.locator('#results-title').innerText(),/fly from/);assert.ok((await page.locator('.route-code').allTextContents()).every(t=>t.endsWith('→ BOS')));
  await page.locator('.options-button').first().click();assert.equal(await page.locator('.card').count(),2);assert.equal(calls,38);assert.notEqual(await page.locator('#origin').inputValue(),'Asia');assert.equal(await page.locator('#destination').inputValue(),'BOS');
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'/tmp/atlas-reverse-mobile.png',fullPage:true});
  await page.selectOption('#trip','roundtrip');await page.click('.search-button');assert.match(await page.locator('#error').innerText(),/supports One way/);assert.equal(await page.locator('.card').count(),0);assert.equal(calls,38);
  await page.selectOption('#data-source','demo');assert.equal(await page.locator('.card').count(),1);assert.match(await page.locator('#mode-note').innerText(),/DEMO MODE/);
  assert.deepEqual(errors,[]);console.log('PASS: browser-to-backend integration with simulated provider: no automatic charges; 12-city results, date updates, nonstop alternatives, caching, explicit live-only limits, and demo separation.');
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exit(1)});

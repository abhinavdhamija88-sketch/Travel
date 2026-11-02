import {cities,origins,searchFares,skyscannerUrl,selectLiveFares,getSearchPlan,expandSearchQueries} from './search.js';
const $=id=>document.getElementById(id);
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n);
const prettyDate=d=>new Date(d+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'});
const tripNames={oneway:'One way',roundtrip:'Round trip',multicity:'Multi-city'};
const cabinNames={business:'Business class',premium:'Premium economy',economy:'Economy'};
const airportNames=Object.fromEntries([...origins,...cities.map(c=>({code:c.code,label:c.city}))].map(o=>[o.code,o.label]));
let cityPhotos={};
let query,displayed=[],liveResults=[],liveReport=null,busy=false,apiBatchSize=Infinity;
const offlineDemo=Boolean(globalThis.ATLAS_OFFLINE_DEMO)||location.protocol==='file:';
$('data-source').value=offlineDemo?'demo':'live';
const liveMode=()=>$('data-source').value==='live';
const escapeText=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const usOptions=origins.map(o=>`<option value="${o.code}">${o.label}</option>`).join('');
const asiaOptions='<optgroup label="Explore a region">'+['Asia','East Asia','Southeast Asia','South Asia'].map(r=>`<option>${r}</option>`).join('')+'</optgroup><optgroup label="Choose a city">'+[...cities].sort((a,b)=>a.city.localeCompare(b.city)).map(c=>`<option value="${c.code}">${c.city}</option>`).join('')+'</optgroup>';
let reverseDirection=false;
function routeOptions(origin,destination){
 $('origin').innerHTML=reverseDirection?asiaOptions:usOptions;
 $('destination').innerHTML=reverseDirection?usOptions:asiaOptions;
 if(origin)$('origin').value=origin;if(destination)$('destination').value=destination;
}
routeOptions();
function singleRoute(){return getSearchPlan(query).single;}
$('swap-route').addEventListener('click',()=>{
 const from=$('origin').value,to=$('destination').value;
 reverseDirection=!reverseDirection;routeOptions(to,from);
 liveResults=[];liveReport=null;query=readQuery();render();
 updateUsageEstimate();
 $('search-status').textContent='Route swapped. Click Search flights to search in this direction. Departure date and cabin are unchanged.';
});
function addLeg(){
 if($('legs').children.length>=5)return;
 const row=document.createElement('div');row.className='leg-row';
 const n=$('legs').children.length;
 row.innerHTML=`<span class="leg-number">Flight ${n+2}</span><label class="field"><span>CONTINUE TO</span><select class="leg-to" aria-label="Flight ${n+2} destination"><option value="HOME">Return to departure airport</option>${[...cities].sort((a,b)=>a.city.localeCompare(b.city)).map(c=>`<option value="${c.code}">${c.city}</option>`).join('')}${origins.filter(o=>o.code!=='NYC').map(o=>`<option value="${o.code}">${o.label}</option>`).join('')}</select></label><label class="field date"><span>DEPARTURE DATE</span><input type="date" class="leg-date" aria-label="Flight ${n+2} departure date" value="2026-12-22" required></label><button class="remove-leg" type="button" aria-label="Remove flight ${n+2}">×</button>`;
 row.querySelector('.leg-to').value=n?'HOME':'SIN';
 row.querySelector('.remove-leg').onclick=()=>{row.remove();renumber();};
 $('legs').append(row);renumber();
}
function renumber(){[...$('legs').children].forEach((row,i)=>{row.querySelector('.leg-number').textContent=`Flight ${i+2}`;row.querySelector('.leg-to').setAttribute('aria-label',`Flight ${i+2} destination`);row.querySelector('.leg-date').setAttribute('aria-label',`Flight ${i+2} departure date`);row.querySelector('button').setAttribute('aria-label',`Remove flight ${i+2}`);});$('add-leg').disabled=$('legs').children.length>=5;}
function tripFields(){
 const round=$('trip').value==='roundtrip',multi=$('trip').value==='multicity';
 $('return-field').hidden=!round;$('return-date').disabled=!round;$('return-date').required=round;
 $('multi-fields').hidden=!multi;if(multi&&!$('legs').children.length)addLeg();
 $('legs').querySelectorAll('input,select').forEach(el=>el.disabled=!multi);
}
$('trip').onchange=tripFields;$('add-leg').onclick=addLeg;tripFields();
function readQuery(){return {origin:$('origin').value,destination:$('destination').value,date:$('date').value,returnDate:$('return-date').value,trip:$('trip').value,cabin:$('cabin').value,onward:[...$('legs').children].map(row=>({code:row.querySelector('select').value,date:row.querySelector('input').value}))};}
function link(f){return skyscannerUrl({...f,returnDate:f.trip==='roundtrip'?f.returnDate:undefined});}
function flightTimes(f){
 if(!f.source)return 'Sample itinerary';
 const dep=f.departure||f.legs?.[0]?.segments?.[0]?.departure||'',arr=f.arrival||f.legs?.[0]?.segments?.at(-1)?.arrival||'';
 const start=dep.match(/\b\d{2}:\d{2}\b/)?.[0],end=arr.match(/\b\d{2}:\d{2}\b/)?.[0];
 if(!start||!end)return 'See flight details';
 const later=arr.slice(0,10)>dep.slice(0,10)?' · arrives '+prettyDate(arr.slice(0,10)):'';
 return start+' → '+end+later;
}
function updateUsageEstimate(){
 try{
  if(!liveMode()){$('usage-estimate').textContent='Sample data · no provider searches.';return;}
  if($('trip').value!=='oneway'){$('usage-estimate').textContent='Live pricing supports one-way searches. Other trip types use sample data.';return;}
  const count=getSearchPlan(readQuery()).targets.length;
  $('usage-estimate').textContent=`Checks ${count} ${count===1?'city':'cities'} · may use up to ${count} provider ${count===1?'search':'searches'}.`;
 }catch{$('usage-estimate').textContent='Choose a route to see estimated search usage.';}
}
function showDetails(f){
 const live=Boolean(f.source);
 const legs=f.legs.map((l,i)=>`<div class="detail-leg"><strong>Flight ${i+1}: ${l.origin} → ${l.code}</strong><p>${prettyDate(l.date)} · ${l.stops?'Connecting':'Nonstop'} · ${money(l.price)}${live?'':' sample fare'}</p>${live?`<p>${escapeText(l.airline)}</p>${l.segments.map(s=>`<p>${escapeText(s.origin)} → ${escapeText(s.code)} · ${escapeText(s.flightNumber)} · ${escapeText(s.cabin)}<br>${escapeText(s.departure)} → ${escapeText(s.arrival)}</p>`).join('')}`:''}${f.trip==='multicity'?`<a class="skyscanner-link" href="${skyscannerUrl(l)}" target="_blank" rel="noopener noreferrer">Check flight ${i+1} on Skyscanner →</a>`:''}</div>`).join('');
 $('detail-body').innerHTML=`<div class="eyebrow">${live?'GOOGLE FLIGHTS RESULT':'ILLUSTRATIVE ITINERARY'}</div><h2>${f.origin} → ${f.code}</h2><p>${tripNames[f.trip]} · ${f.mixedCabin?'Mixed cabins — see each segment below':cabinNames[f.cabin]} · 1 adult</p><h3>${money(f.price)} <small>USD · trip total</small></h3>${legs}${live?`<a class="skyscanner-link" href="${escapeText(f.googleUrl)}" target="_blank" rel="noopener noreferrer">Search this route on Google Flights →</a><p>Checked ${escapeText(new Date(f.checkedAt).toLocaleString())}. Prices may change. Seller comparisons are not included; check Google Flights for booking options.</p>`:''}${f.trip!=='multicity'?`<a class="skyscanner-link" href="${link(f)}" target="_blank" rel="noopener noreferrer">Check on Skyscanner →</a>`:''}<p class="external-note">${live?'This price was returned by the provider.':'All displayed fares are samples.'} Skyscanner runs a separate search; confirm airports, dates, and cabin there.${f.trip==='multicity'?' Multi-city links check each flight separately; their prices do not represent a single multi-city ticket.':''}</p>`;
 if(typeof $('details').showModal==='function')$('details').showModal();else $('details').setAttribute('open','');
}
function render(){
 try{
 displayed=liveMode()?selectLiveFares(liveResults,{origin:query.origin,destination:query.destination,includeMixed:$('mixed-cabins').checked,nonstop:$('nonstop').checked,budget:Number($('budget').value),sort:$('sort').value}):searchFares({...query,nonstop:$('nonstop').checked,budget:Number($('budget').value),sort:$('sort').value});
 $('download-report').hidden=!liveMode()||!liveReport;
 $('refresh-prices').hidden=!liveMode()||!liveReport||!singleRoute();
 displayed.sort((a,b)=>$('sort').value==='highest'?b.price-a.price:$('sort').value==='duration'?a.hours-b.hours:a.price-b.price);

 $('error').textContent='';
 $('results-title').textContent=singleRoute()?'Flight options':getSearchPlan(query).reverse?'Compare departure cities':'Flight results';
 const dates=[query.date,...(query.trip==='roundtrip'?[query.returnDate]:query.trip==='multicity'?query.onward.map(l=>l.date):[])].map(prettyDate).join(' · ');
 $('summary').textContent=`${airportNames[query.origin]||query.origin} → ${airportNames[query.destination]||query.destination} · ${dates} · ${cabinNames[query.cabin]} · ${tripNames[query.trip]}`;
 $('count').textContent=`${displayed.length} ${displayed.length===1?'trip':'trips'}`;
 $('results').innerHTML=displayed.length?displayed.map((f,i)=>`<article class="card"><div class="city-art theme-${f.comparisonCode||f.code}" data-photo-code="${f.comparisonCode||f.code}" aria-hidden="true"><div class="sun"></div><div class="skyline ${i%2?'arch':'temple'}"><i></i><i></i><i></i><i></i><i></i></div></div><div class="card-body"><div class="city-line"><div><h3>${escapeText(singleRoute()?(f.airline||'Airline not supplied'):f.city)}</h3><p>${singleRoute()?escapeText(flightTimes(f)):escapeText(f.country)+(f.reverse?' · Departure city':f.trip==='multicity'?' · First stop':'')}</p></div><span class="route-code">${f.origin} → ${f.code}</span></div><div class="flight-meta"><span>${prettyDate(f.date)}${f.trip==='roundtrip'?' – '+prettyDate(f.returnDate):''} · ${tripNames[f.trip]}</span><span>${f.stops===0?'Nonstop':f.stops+' connection'+(f.stops===1?'':'s')}${f.connectionAirports?.length?' via '+escapeText(f.connectionAirports.join(', ')):''}${liveMode()?' · '+Math.floor(f.hours)+'h '+Math.round(f.hours%1*60)+'m':''}</span>${liveMode()?`${singleRoute()?'':`<span class="fare-airline">${escapeText(f.airline)}</span>`}<span class="cabin-badge ${f.mixedCabin?'mixed':''}">${f.mixedCabin?'Mixed cabins':(f.cabin==='business'?'Business / first':cabinNames[f.cabin])+' · all segments'}</span>`:''}</div><div class="card-bottom"><div><span class="from">${liveMode()?'USD · per adult':'SAMPLE FARE'}</span><strong>${money(f.price)}</strong></div><button data-index="${i}" aria-label="View flight details for ${f.origin} to ${f.code}" title="Flight details">→</button></div><div class="row-actions">${liveMode()&&!singleRoute()&&f.optionCount>1?`<button class="options-button" data-options-code="${f.comparisonCode||f.code}">${f.optionCount} flight options</button>`:''}${f.trip==='multicity'?`<button class="skyscanner-link multi-check" data-index="${i}">Check legs on Skyscanner →</button>`:`<a class="skyscanner-link" href="${link(f)}" target="_blank" rel="noopener noreferrer">Check on Skyscanner →</a>`}</div></div></article>`).join(''):`<div class="empty"><h3>${liveMode()&&!liveReport?'Enter a route to search':liveMode()?'No matching returned fares':'No matching sample trips'}</h3><p>${liveMode()&&!liveReport?'Choose airports, a date, and a cabin, then select Search flights.':'Try a higher budget, allow connections, or choose a different city.'}</p>${liveMode()&&!liveReport?'':'<button class="reset-filters" type="button">Clear price and nonstop filters</button>'}</div>`;
 if(liveMode()&&liveReport){
  const coverage=document.createElement('details');coverage.className='coverage-note';
  const coverageBody=document.createElement('p');
  const failed=liveReport.coverage.filter(c=>c.status==='error'),empty=liveReport.coverage.filter(c=>c.status==='no_matching_fare');
  coverageBody.textContent=`${liveReport.coverage.length-failed.length} of ${liveReport.coverage.length} city searches completed. ${failed.length?'Incomplete searches: '+failed.map(c=>c.city+': '+c.message).join('; ')+'. ':''}${empty.length?'No verified requested-cabin fare returned for '+empty.map(c=>c.city).join(', ')+'. ':''}Only the provider’s returned offers are compared. Checked times appear in trip details; our cache lasts 15 minutes and the provider may also cache prices. Refresh prices bypasses both caches for a single city.`;
  const mixed=liveReport.coverage.reduce((n,c)=>n+(c.diagnostics?.mixed||0),0);
  const unknown=liveReport.coverage.reduce((n,c)=>n+(c.diagnostics?.unknownCabin||0),0);
  const mixedPrices=liveReport.coverage.flatMap(c=>c.diagnostics?.lowestMixedPrice!=null?[c.diagnostics.lowestMixedPrice]:[]);
  const rawOffers=liveReport.coverage.reduce((n,c)=>n+(c.diagnostics?.returnedOffers||0),0);
  const eligibleOffers=liveReport.coverage.reduce((n,c)=>n+(c.diagnostics?.eligibleOffers||0),0);
  const rawPrices=liveReport.coverage.flatMap(c=>c.diagnostics?.lowestReturnedPrice!=null?[c.diagnostics.lowestReturnedPrice]:[]);
  if(rawOffers)coverageBody.textContent+=` Provider returned ${rawOffers} offers; ${eligibleOffers} distinct offers have verified requested cabins.${rawPrices.length?' Lowest price before cabin and itinerary validation: '+money(Math.min(...rawPrices))+'.':''}`;
  const excludedReasons={};for(const c of liveReport.coverage)for(const [reason,count] of Object.entries(c.diagnostics?.excludedByReason||{}))excludedReasons[reason]=(excludedReasons[reason]||0)+count;
  if(Object.keys(excludedReasons).length)coverageBody.textContent+=' Exclusion details are available in Download search report.';
  if(mixed)coverageBody.textContent+=` ${mixed} mixed-cabin offers ${$('mixed-cabins').checked?'included':'hidden'}${mixedPrices.length?' (from '+money(Math.min(...mixedPrices))+')':''}. ${$('mixed-cabins').checked?'Review the cabin on each segment.':'Enable Include mixed cabins to compare them.'}`;
  if(unknown)coverageBody.textContent+=` ${unknown} offers excluded because their segment cabins could not be verified.`;
  coverageBody.textContent+=singleRoute()?' Showing the returned flight options for this city.':' Showing the lowest eligible returned fare per Asian city. Use View flight options to compare alternatives.';
  const coverageTitle=document.createElement('summary');coverageTitle.textContent=`${liveReport.coverage.length-failed.length} of ${liveReport.coverage.length} city searches completed${failed.length?' · Some searches failed':''} · Coverage details`;coverage.append(coverageTitle,coverageBody);$('results').prepend(coverage);
 }
 applyCityPhotos();

 }catch(e){$('error').textContent=e.message;}
}
async function runSearch({refresh=false}={}){
 if(busy)return;
 if(!$('search').reportValidity()){
  $('error').textContent='Search not updated. Complete the highlighted travel details.';return;
 }
 const next={...readQuery(),refresh};
 if(!liveMode()){
  try{searchFares(next);query=next;render();$('search-status').textContent=`Sample results updated for ${prettyDate(query.date)}${query.trip==='roundtrip'?' – '+prettyDate(query.returnDate):''}. Skyscanner links now use these travel dates.`;}catch(e){$('error').textContent='Search not updated. '+e.message;}
  return;
 }
 query=next;liveResults=[];liveReport=null;render();
 if(offlineDemo){$('error').textContent='This downloaded demo cannot retrieve live prices. Use the hosted website with a connected SerpApi key.';return;}
 if(next.trip!=='oneway'){$('error').textContent='Live pricing currently supports One way. Round trip and Multi-city are available in Sample demo mode.';return;}
 busy=true;$('download-report').disabled=true;$('refresh-prices').disabled=true;document.querySelector('.search-button').disabled=true;$('data-source').disabled=true;$('swap-route').disabled=true;
 $('search-status').textContent='Checking Google Flights. This can take a minute; no sample fares will be substituted.';
 try{
  const statusResponse=await fetch('/api/status');
  if(!statusResponse.ok)throw new Error('The flight server could not be reached.');
  const status=await statusResponse.json();
  if(!status.configured)throw new Error('Live pricing is not connected yet. Add the SerpApi key in the hosting service.');
  apiBatchSize=status.maxDestinationsPerRequest||Infinity;
  const targets=expandSearchQueries(next);
  let body;
  if(apiBatchSize===1){
   body={results:[],coverage:[],partial:false};
   for(let i=0;i<targets.length;i+=2){
    const reports=await Promise.all(targets.slice(i,i+2).map(async target=>{
     try{
      const response=await fetch('/api/flights',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(target)});
      const report=await response.json();
      if(!response.ok)throw new Error(report.error||'The destination search failed.');
      return report;
     }catch(e){return {results:[],coverage:[{code:getSearchPlan(target).targets[0].code,city:getSearchPlan(target).targets[0].city,status:'error',message:e.message}],partial:true};}
    }));
    for(const report of reports){body.results.push(...report.results);body.coverage.push(...report.coverage);body.partial ||= report.partial;}
    liveReport=body;liveResults=body.results;render();
    $('search-status').textContent=`Checked ${body.coverage.length} of ${targets.length} cities…`;
   }
   if(body.coverage.every(c=>c.status==='error'))throw new Error(body.coverage[0]?.message||'The flight search failed.');
  }else{
   const response=await fetch('/api/flights',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(next)});
   body=await response.json();
   if(!response.ok)throw new Error(body.error||'The flight search failed.');
  }
  liveReport=body;liveResults=body.results;render();
  $('search-status').textContent=`${body.partial?'Partial search completed':'Search completed'} for ${prettyDate(query.date)}. ${displayed.length} results.`;
 }catch(e){$('search-status').textContent='Search did not complete. No live prices are displayed.';$('error').textContent=e.message;}
 finally{busy=false;$('download-report').disabled=false;$('refresh-prices').disabled=false;document.querySelector('.search-button').disabled=false;$('data-source').disabled=false;$('swap-route').disabled=false;}
}
function updateMode(){
 liveResults=[];liveReport=null;query=readQuery();$('mixed-field').hidden=!liveMode();updateUsageEstimate();render();
 $('search-status').textContent='';
 $('mode-note').innerHTML=liveMode()?'<span>GOOGLE FLIGHTS · LIVE</span> One-way fares returned by Google Flights via SerpApi. Coverage may be incomplete. Prices may change.':'<span>DEMO MODE</span> Illustrative fares only. No live search or booking. Prices shown per person in USD.';
 if(liveMode()&&!offlineDemo)fetch('/api/status').then(r=>r.json()).then(s=>{if(liveMode()&&!s.configured)$('search-status').textContent='Live pricing is not connected yet. Add the SerpApi key in the hosting service to enable searches.';}).catch(()=>{$('error').textContent='The live pricing server could not be reached.';});
}
$('data-source').addEventListener('change',updateMode);
$('refresh-prices').addEventListener('click',()=>runSearch({refresh:true}));
$('download-report').addEventListener('click',()=>{
 if(!liveReport)return;
 const report={version:1,downloadedAt:new Date().toISOString(),search:{origin:query.origin,destination:query.destination,date:query.date,cabin:query.cabin,trip:query.trip},coverage:liveReport.coverage,results:liveReport.results};
 const blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`atlas-search-${query.origin}-${query.destination}-${query.date}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
// Use a regular button: preview frames may disable native form submissions.
document.querySelector('.search-button').addEventListener('click',runSearch);
$('search').addEventListener('submit',e=>{e.preventDefault();runSearch();});
$('search').addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.tagName==='INPUT'){e.preventDefault();runSearch();}});
function markPending(){
 updateUsageEstimate();
 $('search-status').textContent='Changes not applied yet. Click Search flights to update results and Skyscanner links.';
}
for(const id of ['search','trip','cabin']){
 $(id).addEventListener('input',markPending);
 $(id).addEventListener('change',markPending);
}

for(const id of ['sort','budget','nonstop','mixed-cabins'])$(id).addEventListener('change',render);
$('results').addEventListener('click',e=>{const options=e.target.closest('button[data-options-code]');if(options){query=getSearchPlan(query).reverse?{...query,origin:options.dataset.optionsCode}:{...query,destination:options.dataset.optionsCode};$('origin').value=query.origin;$('destination').value=query.destination;updateUsageEstimate();render();$('search-status').textContent='Showing returned flight options. No additional provider requests were made.';return;}const reset=e.target.closest('.reset-filters');if(reset){$('nonstop').checked=false;$('budget').value='Infinity';render();return;}const btn=e.target.closest('button[data-index]');if(btn)showDetails(displayed[Number(btn.dataset.index)]);});
$('close').onclick=()=>{if(typeof $('details').close==='function')$('details').close();else $('details').removeAttribute('open');};
updateMode();

function applyCityPhotos(){
 document.querySelectorAll('.city-art[data-photo-code]').forEach(el=>{
  const code=el.dataset.photoCode,photo=cityPhotos[code];
  if(!photo||!['jpg','png','webp'].some(ext=>photo.src==='/assets/cities/'+code+'.'+ext)||el.querySelector('img'))return;
  const img=document.createElement('img');img.className='city-photo';img.alt='';img.width=160;img.height=160;img.loading='lazy';img.decoding='async';img.src=photo.src;img.addEventListener('error',()=>img.remove(),{once:true});el.append(img);
 });
}
if(!offlineDemo)fetch('/assets/cities/photos.json').then(r=>r.ok?r.json():null).then(data=>{if(data?.photos){cityPhotos=data.photos;applyCityPhotos();}}).catch(()=>{});

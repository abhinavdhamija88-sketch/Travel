import {cities,origins,searchFares,skyscannerUrl,selectLiveFares} from './search.js';
const $=id=>document.getElementById(id);
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n);
const prettyDate=d=>new Date(d+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'});
const tripNames={oneway:'One way',roundtrip:'Round trip',multicity:'Multi-city'};
const cabinNames={business:'Business class',premium:'Premium economy',economy:'Economy'};
const airportNames=Object.fromEntries([...origins,...cities.map(c=>({code:c.code,label:c.city}))].map(o=>[o.code,o.label]));
let query,displayed=[],liveResults=[],liveReport=null,busy=false,apiBatchSize=Infinity;
const offlineDemo=Boolean(globalThis.ATLAS_OFFLINE_DEMO)||location.protocol==='file:';
$('data-source').value=offlineDemo?'demo':'live';
const liveMode=()=>$('data-source').value==='live';
const escapeText=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

$('origin').innerHTML=origins.map(o=>`<option value="${o.code}">${o.label}</option>`).join('');
$('destination').innerHTML='<optgroup label="Explore a region">'+['Asia','East Asia','Southeast Asia','South Asia'].map(r=>`<option>${r}</option>`).join('')+'</optgroup><optgroup label="Choose a city">'+cities.map(c=>`<option value="${c.code}">${c.city} · ${c.code}</option>`).join('')+'</optgroup>';
function addLeg(){
 if($('legs').children.length>=5)return;
 const row=document.createElement('div');row.className='leg-row';
 const n=$('legs').children.length;
 row.innerHTML=`<span class="leg-number">Flight ${n+2}</span><label class="field"><span>CONTINUE TO</span><select class="leg-to" aria-label="Flight ${n+2} destination"><option value="HOME">Return to departure airport</option>${cities.map(c=>`<option value="${c.code}">${c.city} · ${c.code}</option>`).join('')}${origins.filter(o=>o.code!=='NYC').map(o=>`<option value="${o.code}">${o.label}</option>`).join('')}</select></label><label class="field date"><span>DEPARTURE DATE</span><input type="date" class="leg-date" aria-label="Flight ${n+2} departure date" value="2026-12-22" required></label><button class="remove-leg" type="button" aria-label="Remove flight ${n+2}">×</button>`;
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
function showDetails(f){
 const live=Boolean(f.source);
 const legs=f.legs.map((l,i)=>`<div class="detail-leg"><strong>Flight ${i+1}: ${l.origin} → ${l.code}</strong><p>${prettyDate(l.date)} · ${l.stops?'Connecting':'Nonstop'} · ${money(l.price)}${live?'':' sample fare'}</p>${live?`<p>${escapeText(l.airline)}</p>${l.segments.map(s=>`<p>${escapeText(s.origin)} → ${escapeText(s.code)} · ${escapeText(s.flightNumber)} · ${escapeText(s.cabin)}<br>${escapeText(s.departure)} → ${escapeText(s.arrival)}</p>`).join('')}`:''}${f.trip==='multicity'?`<a class="skyscanner-link" href="${skyscannerUrl(l)}" target="_blank" rel="noopener noreferrer">Check flight ${i+1} on Skyscanner →</a>`:''}</div>`).join('');
 $('detail-body').innerHTML=`<div class="eyebrow">${live?'GOOGLE FLIGHTS RESULT':'ILLUSTRATIVE ITINERARY'}</div><h2>${f.origin} → ${f.city}</h2><p>${tripNames[f.trip]} · ${f.mixedCabin?'Mixed cabins — see each segment below':cabinNames[f.cabin]} · 1 adult</p><h3>${money(f.price)} <small>USD · trip total</small></h3>${legs}${live?`<a class="skyscanner-link" href="${escapeText(f.googleUrl)}" target="_blank" rel="noopener noreferrer">Search this route on Google Flights →</a><p>Checked ${escapeText(new Date(f.checkedAt).toLocaleString())}. Prices may change. Seller comparisons are not included; check Google Flights for booking options.</p>`:''}${f.trip!=='multicity'?`<a class="skyscanner-link" href="${link(f)}" target="_blank" rel="noopener noreferrer">Check on Skyscanner →</a>`:''}<p class="external-note">${live?'This price was returned by the provider.':'All displayed fares are samples.'} Skyscanner runs a separate search; confirm airports, dates, and cabin there.${f.trip==='multicity'?' Multi-city links check each flight separately; their prices do not represent a single multi-city ticket.':''}</p>`;
 if(typeof $('details').showModal==='function')$('details').showModal();else $('details').setAttribute('open','');
}
function render(){
 try{
 displayed=liveMode()?selectLiveFares(liveResults,{destination:query.destination,includeMixed:$('mixed-cabins').checked,nonstop:$('nonstop').checked,budget:Number($('budget').value),sort:$('sort').value}):searchFares({...query,nonstop:$('nonstop').checked,budget:Number($('budget').value),sort:$('sort').value});
 $('download-report').hidden=!liveMode()||!liveReport;
 $('refresh-prices').hidden=!liveMode()||!liveReport||!cities.some(c=>c.code===query.destination);
 displayed.sort((a,b)=>$('sort').value==='highest'?b.price-a.price:$('sort').value==='duration'?a.hours-b.hours:a.price-b.price);

 $('error').textContent='';
 const dates=[query.date,...(query.trip==='roundtrip'?[query.returnDate]:query.trip==='multicity'?query.onward.map(l=>l.date):[])].map(prettyDate).join(' · ');
 $('summary').textContent=`${airportNames[query.origin]} → ${airportNames[query.destination]||query.destination} · ${dates} · ${cabinNames[query.cabin]} · ${tripNames[query.trip]}`;
 $('count').textContent=`${displayed.length} ${displayed.length===1?'trip':'trips'}`;
 $('results').innerHTML=displayed.length?displayed.map((f,i)=>`<article class="card"><div class="city-art theme-${f.code}"><span class="region-label">${f.region}</span><div class="sun"></div><div class="mountain"></div><div class="skyline ${i%2?'arch':'temple'}"><i></i><i></i><i></i><i></i><i></i></div><span class="airport">${f.code}</span>${i===0&&$('sort').value==='price'?`<span class="best">${liveMode()?'LOWEST RETURNED FARE':'LOWEST SAMPLE FARE'}</span>`:''}</div><div class="card-body"><div class="city-line"><div><h3>${f.city}</h3><p>${f.country}${f.trip==='multicity'?' · First stop':''}</p></div><span class="route-code">${f.origin} → ${f.code}</span></div><div class="flight-meta"><span>${prettyDate(f.date)}${f.trip==='roundtrip'?' – '+prettyDate(f.returnDate):''} · ${tripNames[f.trip]}</span><span>${f.legs.length} ${f.legs.length===1?'flight':'flights'} · ${f.stops} connections total${liveMode()?' · '+Math.floor(f.hours)+'h '+Math.round(f.hours%1*60)+'m':''}</span>${liveMode()?`<span class="fare-airline">${escapeText(f.airline)}</span><span class="cabin-badge ${f.mixedCabin?'mixed':''}">${f.mixedCabin?'Mixed cabins · review each segment':(f.cabin==='business'?'Business / first':cabinNames[f.cabin])+' · all segments'}</span>`:''}</div><div class="card-bottom"><div><span class="from">${f.trip==='oneway'?'ONE WAY':'TRIP TOTAL'} · ${liveMode()?'USD':'SAMPLE'}</span><strong>${money(f.price)}</strong></div><button data-index="${i}" aria-label="View trip to ${f.city}">→</button></div>${liveMode()&&!cities.some(c=>c.code===query.destination)&&f.optionCount>1?`<button class="options-button" data-options-code="${f.code}">View ${f.optionCount} flight options</button>`:''}${f.trip==='multicity'?`<button class="skyscanner-link multi-check" data-index="${i}">Check flights on Skyscanner →</button>`:`<a class="skyscanner-link" href="${link(f)}" target="_blank" rel="noopener noreferrer">Check on Skyscanner →</a>`}</div></article>`).join(''):`<div class="empty"><h3>${liveMode()&&!liveReport?'Ready to check Google Flights':liveMode()?'No matching returned fares':'No matching sample trips'}</h3><p>${liveMode()&&!liveReport?'Choose your route and date, then click Explore fares. No sample prices are shown in Live mode.':'Try a higher budget, allow connections, or choose a different destination.'}</p>${liveMode()&&!liveReport?'':'<button class="reset-filters" type="button">Clear price and nonstop filters</button>'}</div>`;
 if(liveMode()&&liveReport){
  const coverage=document.createElement('div');coverage.className='coverage-note';
  const failed=liveReport.coverage.filter(c=>c.status==='error'),empty=liveReport.coverage.filter(c=>c.status==='no_matching_fare');
  coverage.textContent=`${liveReport.coverage.length-failed.length} of ${liveReport.coverage.length} destination searches completed. ${failed.length?'Incomplete searches: '+failed.map(c=>c.city+': '+c.message).join('; ')+'. ':''}${empty.length?'No verified requested-cabin fare returned for '+empty.map(c=>c.city).join(', ')+'. ':''}Only the provider’s returned offers are compared. Checked times appear in trip details; our cache lasts 15 minutes and the provider may also cache prices. Refresh prices bypasses both caches for a single city.`;
  const mixed=liveReport.coverage.reduce((n,c)=>n+(c.diagnostics?.mixed||0),0);
  const unknown=liveReport.coverage.reduce((n,c)=>n+(c.diagnostics?.unknownCabin||0),0);
  const mixedPrices=liveReport.coverage.flatMap(c=>c.diagnostics?.lowestMixedPrice!=null?[c.diagnostics.lowestMixedPrice]:[]);
  const rawOffers=liveReport.coverage.reduce((n,c)=>n+(c.diagnostics?.returnedOffers||0),0);
  const eligibleOffers=liveReport.coverage.reduce((n,c)=>n+(c.diagnostics?.eligibleOffers||0),0);
  const rawPrices=liveReport.coverage.flatMap(c=>c.diagnostics?.lowestReturnedPrice!=null?[c.diagnostics.lowestReturnedPrice]:[]);
  if(rawOffers)coverage.textContent+=` Provider returned ${rawOffers} offers; ${eligibleOffers} distinct offers have verified requested cabins.${rawPrices.length?' Lowest price before cabin and itinerary validation: '+money(Math.min(...rawPrices))+'.':''}`;
  const excludedReasons={};for(const c of liveReport.coverage)for(const [reason,count] of Object.entries(c.diagnostics?.excludedByReason||{}))excludedReasons[reason]=(excludedReasons[reason]||0)+count;
  if(Object.keys(excludedReasons).length)coverage.textContent+=' Exclusion details are available in Download search report.';
  if(mixed)coverage.textContent+=` ${mixed} mixed-cabin offers ${$('mixed-cabins').checked?'included':'hidden'}${mixedPrices.length?' (from '+money(Math.min(...mixedPrices))+')':''}. ${$('mixed-cabins').checked?'Review the cabin on each segment.':'Enable Include mixed cabins to compare them.'}`;
  if(unknown)coverage.textContent+=` ${unknown} offers excluded because their segment cabins could not be verified.`;
  coverage.textContent+=cities.some(c=>c.code===query.destination)?' Showing the returned flight options for this city.':' Showing the lowest eligible returned fare per destination. Use View flight options to compare alternatives.';
  $('results').prepend(coverage);
 }

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
 busy=true;$('download-report').disabled=true;$('refresh-prices').disabled=true;document.querySelector('.search-button').disabled=true;$('data-source').disabled=true;
 $('search-status').textContent='Checking Google Flights. This can take a minute; no sample fares will be substituted.';
 try{
  const statusResponse=await fetch('/api/status');
  if(!statusResponse.ok)throw new Error('The flight server could not be reached.');
  const status=await statusResponse.json();
  if(!status.configured)throw new Error('Live pricing is not connected yet. Add the SerpApi key in the hosting service.');
  apiBatchSize=status.maxDestinationsPerRequest||Infinity;
  const targets=cities.filter(c=>next.destination==='Asia'||c.region===next.destination||c.code===next.destination);
  let body;
  if(apiBatchSize===1){
   body={results:[],coverage:[],partial:false};
   for(let i=0;i<targets.length;i+=2){
    const reports=await Promise.all(targets.slice(i,i+2).map(async city=>{
     try{
      const response=await fetch('/api/flights',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...next,destination:city.code})});
      const report=await response.json();
      if(!response.ok)throw new Error(report.error||'The destination search failed.');
      return report;
     }catch(e){return {results:[],coverage:[{code:city.code,city:city.city,status:'error',message:e.message}],partial:true};}
    }));
    for(const report of reports){body.results.push(...report.results);body.coverage.push(...report.coverage);body.partial ||= report.partial;}
    liveReport=body;liveResults=body.results;render();
    $('search-status').textContent=`Checked ${body.coverage.length} of ${targets.length} destinations…`;
   }
   if(body.coverage.every(c=>c.status==='error'))throw new Error(body.coverage[0]?.message||'The flight search failed.');
  }else{
   const response=await fetch('/api/flights',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(next)});
   body=await response.json();
   if(!response.ok)throw new Error(body.error||'The flight search failed.');
  }
  liveReport=body;liveResults=body.results;render();
  $('search-status').textContent=`${body.partial?'Partial search completed':'Search completed'} for ${prettyDate(query.date)}. ${displayed.length} displayed options across ${body.results.length} returned destinations. Skyscanner links use this travel date.`;
 }catch(e){$('search-status').textContent='Search did not complete. No live prices are displayed.';$('error').textContent=e.message;}
 finally{busy=false;$('download-report').disabled=false;$('refresh-prices').disabled=false;document.querySelector('.search-button').disabled=false;$('data-source').disabled=false;}
}
function updateMode(){
 liveResults=[];liveReport=null;query=readQuery();$('mixed-field').hidden=!liveMode();render();
 $('search-status').textContent='';
 $('mode-note').innerHTML=liveMode()?'<span>GOOGLE FLIGHTS · LIVE</span> One-way fares from Google Flights via SerpApi. Each search can make up to 12 provider requests; recent identical searches are reused. Prices may change.':'<span>DEMO MODE</span> Illustrative fares only. No live search or booking. Prices shown per person in USD.';
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
 $('search-status').textContent='Changes not applied yet. Click Explore fares to update results and Skyscanner links.';
}
for(const id of ['search','trip','cabin']){
 $(id).addEventListener('input',markPending);
 $(id).addEventListener('change',markPending);
}

for(const id of ['sort','budget','nonstop','mixed-cabins'])$(id).addEventListener('change',render);
$('results').addEventListener('click',e=>{const options=e.target.closest('button[data-options-code]');if(options){query={...query,destination:options.dataset.optionsCode};$('destination').value=query.destination;render();$('search-status').textContent='Showing returned flight options. No additional provider requests were made.';return;}const reset=e.target.closest('.reset-filters');if(reset){$('nonstop').checked=false;$('budget').value='Infinity';render();return;}const btn=e.target.closest('button[data-index]');if(btn)showDetails(displayed[Number(btn.dataset.index)]);});
$('close').onclick=()=>{if(typeof $('details').close==='function')$('details').close();else $('details').removeAttribute('open');};
updateMode();

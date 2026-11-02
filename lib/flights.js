import {cities,origins,validDate,getSearchPlan,airportCodes} from '../public/search.js';
export class FlightError extends Error {constructor(message,status=400){super(message);this.status=status;}}
const cabinIds={economy:'1',premium:'2',business:'3'};
export function validateLiveQuery(input,now=new Date()){
 const {origin,destination,date,cabin,trip='oneway',refresh=false}=input||{};
 if(typeof refresh!=='boolean')throw new FlightError('Invalid refresh option.');
 if(trip!=='oneway')throw new FlightError('Live pricing currently supports one-way searches. Choose One way, or switch to Sample demo for other trip types.');
 let plan;try{plan=getSearchPlan({origin,destination});}catch(e){throw new FlightError(e.message);}
 if(!Object.hasOwn(cabinIds,cabin))throw new FlightError('Choose a supported cabin.');
 if(!validDate(date)||date<now.toISOString().slice(0,10))throw new FlightError('Choose a valid departure date today or later.');
 const targets=plan.targets;
 if(refresh&&targets.length!==1)throw new FlightError('Choose a single city before refreshing provider prices.');
 return {origin,destination,date,cabin,trip,targets,refresh,reverse:plan.reverse};
}
export function providerParams(query,city){
 const us=airportCodes(query.reverse?query.destination:query.origin).join(','),asian=city.airports.join(',');
 return {engine:'google_flights',departure_id:query.reverse?asian:us,arrival_id:query.reverse?us:asian,outbound_date:query.date,type:'2',travel_class:cabinIds[query.cabin],adults:'1',currency:'USD',hl:'en',gl:'us',sort_by:'2',...(query.refresh?{no_cache:'true'}:{})};
}
function cabinMatches(value,cabin){
 const text=String(value||'').trim().toLowerCase();
 return cabin==='business'?['business','business class','first','first class'].includes(text):cabin==='premium'?['premium economy','premium economy class'].includes(text):['economy','economy class'].includes(text);
}
function googleLink(query,city){
 const url=new URL('https://www.google.com/travel/flights');
 url.searchParams.set('q',`${query.reverse?(city.airports.length>1?city.city:city.code):query.origin} to ${query.reverse?query.destination:(city.airports.length>1?city.city:city.code)} on ${query.date} one way ${query.cabin==='premium'?'premium economy':query.cabin} 1 adult`);return url.href;
}
export function normalizeFlights(payload,query,city,checkedAt){
 const offers=[...(Array.isArray(payload.best_flights)?payload.best_flights:[]),...(Array.isArray(payload.other_flights)?payload.other_flights:[])];
 const allowedOrigins=query.reverse?city.airports:airportCodes(query.origin);
 const allowedArrivals=query.reverse?airportCodes(query.destination):city.airports;
 let cabinExcluded=0;
 const validPrices=offers.map(o=>o?.price).filter(p=>Number.isFinite(p)&&p>0);
 const diagnostics={returnedOffers:offers.length,lowestReturnedPrice:validPrices.length?Math.min(...validPrices):null,mixed:0,unknownCabin:0,otherCabin:0,invalidOffer:0,lowestMixedPrice:null,eligibleOffers:0,excludedByReason:{},offerAudit:[]};
 const allowedCabins=new Set(['economy','economy class','premium economy','premium economy class','business','business class','first','first class']);
 const exactSearchUrl=payload.search_metadata?.google_flights_url;
 let googleUrl=googleLink(query,city);
 try{const u=new URL(exactSearchUrl);if(u.protocol==='https:'&&['google.com','www.google.com'].includes(u.hostname)&&u.pathname.startsWith('/travel/flights')&&!u.username&&!u.password&&!u.searchParams.has('api_key'))googleUrl=u.href;}catch{}
 const fares=offers.flatMap(offer=>{
  const segments=offer?.flights;
  const audit={price:Number.isFinite(offer?.price)?offer.price:null,segments:Array.isArray(segments)?segments.map(s=>({origin:typeof s?.departure_airport?.id==='string'?s.departure_airport.id:'',destination:typeof s?.arrival_airport?.id==='string'?s.arrival_airport.id:'',departure:typeof s?.departure_airport?.time==='string'?s.departure_airport.time:'',airline:typeof s?.airline==='string'?s.airline:'',flightNumber:typeof s?.flight_number==='string'?s.flight_number:'',cabin:typeof s?.travel_class==='string'?s.travel_class:'Unknown'})):[]};
  function reject(reason){diagnostics.offerAudit.push({...audit,status:'excluded',reason});diagnostics.excludedByReason[reason]=(diagnostics.excludedByReason[reason]||0)+1;return [];}

  if(!Array.isArray(segments)||!segments.length||!Number.isFinite(offer.price)||offer.price<=0){diagnostics.invalidOffer++;return reject('missing_price_or_segments');}
  const matches=segments.map(s=>cabinMatches(s?.travel_class,query.cabin));
  const unknown=segments.some(s=>!allowedCabins.has(String(s?.travel_class||'').trim().toLowerCase()));
  const mixedCabin=!unknown&&matches.some(Boolean)&&!matches.every(Boolean);
  if(!matches.every(Boolean)){
   cabinExcluded++;
   if(unknown){diagnostics.unknownCabin++;return reject('unverified_segment_cabin');}
   if(!mixedCabin){diagnostics.otherCabin++;return reject('requested_cabin_absent');}
  }
  const first=segments[0],last=segments.at(-1);
  if(!allowedOrigins.includes(first?.departure_airport?.id)||!allowedArrivals.includes(last?.arrival_airport?.id))return reject('airports_do_not_match_search');
  if(typeof first.departure_airport.time!=='string'||first.departure_airport.time.slice(0,10)!==query.date)return reject('departure_date_does_not_match_search');
  const duration=offer.total_duration;
  if(!Number.isFinite(duration)||duration<=0)return reject('missing_total_duration');
  diagnostics.offerAudit.push({...audit,status:mixedCabin?'mixed_cabin_option':'eligible',reason:null});
  if(mixedCabin){diagnostics.mixed++;diagnostics.lowestMixedPrice=Math.min(diagnostics.lowestMixedPrice??Infinity,offer.price);}
  const airline=[...new Set(segments.map(s=>typeof s.airline==='string'?s.airline:'Airline not supplied'))].join(' / ');
  const leg={origin:first.departure_airport.id,code:last.arrival_airport.id,date:query.date,cabin:query.cabin,price:offer.price,stops:segments.length-1,hours:duration/60,airline,departure:first.departure_airport.time,arrival:typeof last.arrival_airport.time==='string'?last.arrival_airport.time:'',connectionAirports:segments.slice(0,-1).map(s=>s.arrival_airport?.id).filter(code=>typeof code==='string'&&/^[A-Z]{3}$/.test(code)),segments:segments.map(s=>({origin:s.departure_airport?.id||'',code:s.arrival_airport?.id||'',departure:s.departure_airport?.time||'',arrival:s.arrival_airport?.time||'',airline:typeof s.airline==='string'?s.airline:'',flightNumber:typeof s.flight_number==='string'?s.flight_number:'',cabin:typeof s.travel_class==='string'?s.travel_class:''}))};
  const {base,...metadata}=city;
  return [{...metadata,...leg,comparisonCode:city.code,reverse:Boolean(query.reverse),trip:'oneway',legs:[leg],source:'Google Flights via SerpApi',checkedAt,googleUrl,mixedCabin,cabinLabel:mixedCabin?'Mixed cabins':'All segments match requested cabin'}];
 }).sort((a,b)=>a.price-b.price);
 // Merge identical itineraries that appear in both provider lists, keeping the lower fare.
 const seen=new Set();
 const options=fares.filter(f=>{const key=JSON.stringify(f.legs[0].segments);if(seen.has(key))return false;seen.add(key);return true;});
 const matching=options.filter(f=>!f.mixedCabin);
 diagnostics.eligibleOffers=matching.length;
 const cheapest=matching[0]||options[0];
 return {fare:cheapest?{...cheapest,options,nonstopAlternative:matching.find(f=>f.stops===0)||null}:null,cabinExcluded,diagnostics};
}
export function createFlightService({apiKey=process.env.SERPAPI_KEY,request=globalThis.fetch,now=()=>new Date(),dailyLimit=24,cacheMs=15*60*1000,timeoutMs=25000}={}){
 const cache=new Map();let busy=false,used=0,day='';
 async function load(query,city){
  const params=providerParams(query,city);
  const {no_cache,...cacheParams}=params;
  const key=JSON.stringify(cacheParams),cached=cache.get(key);
  if(!query.refresh&&cached&&now().getTime()-cached.time<cacheMs)return {...cached.value,cached:true};
  const today=now().toISOString().slice(0,10);if(today!==day){day=today;used=0;}
  if(used>=dailyLimit)throw new FlightError('The configured daily request limit has been reached. Try a cached search, or try again tomorrow.',429);
  used++;
  const url=new URL('https://serpapi.com/search.json');url.search=new URLSearchParams({...params,api_key:apiKey}).toString();
  let response;
  try{response=await request(url,{signal:AbortSignal.timeout(timeoutMs)});}catch{throw new FlightError('The flight provider could not be reached or timed out. Please try again.',502);}
  if(!response.ok)throw new FlightError(response.status===401||response.status===403?'The flight provider rejected the configured credentials.':response.status===429?'The flight provider search allowance is exhausted or rate limited.':'The flight provider returned an error.',502);
  let payload;try{payload=await response.json();}catch{throw new FlightError('The flight provider returned an unreadable response.',502);}
  if(!payload||typeof payload!=='object'||payload.error)throw new FlightError('The flight provider could not complete this search. Check account access and search allowance.',502);
  if(!Array.isArray(payload.best_flights)&&!Array.isArray(payload.other_flights)&&payload.search_information?.flights_results_state!=='Fully empty')throw new FlightError('The flight provider returned no recognizable flight data.',502);
  const fetchedAt=now().toISOString();
  const metadata=payload.search_metadata||{};
  const providerTime=Date.parse(typeof metadata.created_at==='string'?metadata.created_at:'');
  const checkedAt=Number.isFinite(providerTime)?new Date(providerTime).toISOString():fetchedAt;
  const normalized=normalizeFlights(payload,query,city,checkedAt);
  const value={code:city.code,city:city.city,status:normalized.fare?(normalized.fare.mixedCabin?'mixed_only':'found'):'no_matching_fare',...normalized,checkedAt,fetchedAt,providerSearchId:typeof metadata.id==='string'?metadata.id:null,providerParameters:params,refreshed:query.refresh,cached:false};
  if(cache.size>=200)cache.delete(cache.keys().next().value);
  cache.set(key,{time:now().getTime(),value});return value;
 }
 return {configured:Boolean(apiKey),async search(input){
  if(!apiKey)throw new FlightError('Live pricing is not connected yet. A SerpApi key must be added to the hosting service before searching.',503);
  const query=validateLiveQuery(input,now());
  if(busy)throw new FlightError('Another flight search is running. Please wait and try again.',429);
  busy=true;
  try{
   const coverage=[];
   // Two destinations at a time keeps the first comparison bounded.
   for(let i=0;i<query.targets.length;i+=2){
    const results=await Promise.all(query.targets.slice(i,i+2).map(async city=>{try{return await load(query,city);}catch(e){return {code:city.code,city:city.city,status:'error',message:e instanceof FlightError?e.message:'The destination search failed.'};}}));coverage.push(...results);
   }
   const successes=coverage.filter(c=>c.status!=='error');
   if(!successes.length)throw new FlightError(coverage[0]?.message||'The flight search failed.',502);
   return {source:'Google Flights via SerpApi',currency:'USD',partial:successes.length!==coverage.length,coverage:coverage.map(({fare,...c})=>c),results:coverage.flatMap(c=>c.fare?[c.fare]:[]).sort((a,b)=>a.price-b.price),requestLimit:dailyLimit};
  }finally{busy=false;}
 }};
}

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createFlightService,validateLiveQuery,providerParams,normalizeFlights} from '../lib/flights.js';
import {cities} from '../public/search.js';
const clock=()=>new Date('2026-11-02T12:00:00Z');
const input={origin:'BOS',destination:'SGN',date:'2026-12-15',cabin:'business',trip:'oneway'};
function offer(price,{origin='BOS',code='SGN',cabin='Business',connecting=false}={}){
 const segment=(from,to)=>({departure_airport:{id:from,time:'2026-12-15 10:00'},arrival_airport:{id:to,time:'2026-12-16 12:00'},airline:'Test Airline',flight_number:'TA 123',travel_class:cabin});
 return {price,total_duration:1200,flights:connecting?[segment(origin,'DOH'),segment('DOH',code)]:[segment(origin,code)]};
}
const response=body=>({ok:true,json:async()=>body});
test('maps one-way NYC search to actual airport group and business provider settings',()=>{
 const q=validateLiveQuery({...input,origin:'NYC'},clock());const params=providerParams(q,cities.find(c=>c.code==='SGN'));
 assert.equal(params.departure_id,'JFK,EWR,LGA');assert.equal(params.arrival_id,'SGN');assert.equal(params.outbound_date,input.date);assert.equal(params.type,'2');assert.equal(params.travel_class,'3');assert.equal(params.currency,'USD');
 for(const change of [{trip:'roundtrip'},{origin:'LAX'},{date:'2026-02-30'},{date:'2026-01-01'},{destination:'Europe'},{cabin:'first'}])assert.throws(()=>validateLiveQuery({...input,...change},clock()));
});
test('selects lowest returned matching cabin, rejects mixed or unknown cabins, preserves nonstop alternative',()=>{
 const query=validateLiveQuery(input,clock()),city=cities.find(c=>c.code==='SGN');
 const mixed=offer(10,{connecting:true});mixed.flights[1].travel_class='Economy';
 const result=normalizeFlights({best_flights:[offer(2500),offer(100,{cabin:'Economy'}),mixed],other_flights:[offer(2200,{connecting:true}),offer(50,{cabin:''}),offer(10,{origin:'JFK'})]},query,city,clock().toISOString());
 assert.equal(result.fare.price,2200);assert.equal(result.fare.nonstopAlternative.price,2500);assert.equal(result.cabinExcluded,3);assert.equal(result.fare.legs[0].segments.length,2);assert.equal(result.fare.source,'Google Flights via SerpApi');assert.equal(result.fare.hours,20);assert.ok(!('base' in result.fare));
});
test('caches identical requests without spending another provider request and date changes fetch afresh',async()=>{
 let calls=0;const seen=[];
 const service=createFlightService({apiKey:'private-test-key',now:clock,request:async url=>{calls++;seen.push(url);const date=url.searchParams.get('outbound_date');const o=offer(2200);o.flights[0].departure_airport.time=date+' 10:00';return response({best_flights:[o]});}});
 const first=await service.search(input),second=await service.search(input);assert.equal(calls,1);assert.equal(second.coverage[0].cached,true);assert.equal(first.results[0].price,2200);assert.ok(!JSON.stringify(first).includes('private-test-key'));assert.equal(first.results[0].checkedAt,clock().toISOString());
 await service.search({...input,date:'2026-12-20'});assert.equal(calls,2);assert.equal(seen[1].searchParams.get('outbound_date'),'2026-12-20');
});
test('reports partial coverage and never substitutes samples for failed cities',async()=>{
 const service=createFlightService({apiKey:'key',now:clock,request:async url=>{const code=url.searchParams.get('arrival_id');return code==='SGN'?response({best_flights:[offer(2100)]}):{ok:false,status:500};}});
 const result=await service.search({...input,destination:'Asia'});assert.equal(result.results.length,1);assert.equal(result.results[0].code,'SGN');assert.equal(result.partial,true);assert.equal(result.coverage.filter(c=>c.status==='error').length,11);
});
test('handles missing credentials, malformed responses, provider errors and exhausted local budget safely',async()=>{
 await assert.rejects(createFlightService({apiKey:''}).search(input),/not connected/);
 const empty=createFlightService({apiKey:'key',now:clock,request:async()=>response({other_flights:[]})});assert.equal((await empty.search(input)).results.length,0);
 const malformed=createFlightService({apiKey:'key',now:clock,request:async()=>response({unrelated:true})});await assert.rejects(malformed.search(input),/recognizable/);
 const apiError=createFlightService({apiKey:'secret-key',now:clock,request:async()=>response({error:'Error containing secret-key'})});await assert.rejects(apiError.search(input),e=>!e.message.includes('secret-key'));
 let calls=0;const limited=createFlightService({apiKey:'key',now:clock,dailyLimit:1,request:async()=>{calls++;return response({other_flights:[]});}});await limited.search(input);await assert.rejects(limited.search({...input,date:'2026-12-20'}),/daily request limit/);assert.equal(calls,1);
});
test('bounds concurrent usage and sanitizes fetch failures',async()=>{
 let release;const gate=new Promise(r=>release=r);const service=createFlightService({apiKey:'secret',now:clock,request:async()=>{await gate;throw new Error('https://serpapi.com?api_key=secret');}});
 const pending=service.search(input);await assert.rejects(service.search(input),/Another flight search/);release();await assert.rejects(pending,e=>e.message.includes('could not be reached')&&!e.message.includes('secret'));
});
test('4475 best and 2269 other all-business offers remain available and cheapest wins',()=>{
 const query=validateLiveQuery(input,clock()),city=cities.find(c=>c.code==='SGN');
 const expensive=offer(4475,{connecting:true});expensive.flights[0].airline='Other Airline';
 const cheap=offer(2269,{connecting:true});cheap.flights[0].airline='Delta';cheap.flights[1].airline='Korean Air';
 const result=normalizeFlights({best_flights:[expensive],other_flights:[cheap]},query,city,clock().toISOString());
 assert.equal(result.fare.price,2269);assert.equal(result.fare.options.length,2);assert.equal(result.fare.options[0].price,2269);assert.equal(result.diagnostics.returnedOffers,2);assert.equal(result.diagnostics.lowestReturnedPrice,2269);assert.equal(result.diagnostics.eligibleOffers,2);assert.equal(result.cabinExcluded,0);
 assert.equal(providerParams(query,city).sort_by,'2');
});
test('mixed cabins are retained as explicitly flagged alternatives, never silently labeled business',()=>{
 const query=validateLiveQuery(input,clock()),city=cities.find(c=>c.code==='SGN');
 const mixed=offer(2269,{connecting:true});mixed.flights[1].travel_class='Economy';
 const result=normalizeFlights({best_flights:[offer(4475)],other_flights:[mixed]},query,city,clock().toISOString());
 assert.equal(result.fare.price,4475);assert.equal(result.fare.options[0].price,2269);assert.equal(result.fare.options[0].mixedCabin,true);assert.equal(result.diagnostics.lowestMixedPrice,2269);
});
test('merges duplicated itineraries retaining the lowest price and uses provider search URL safely',()=>{
 const query=validateLiveQuery(input,clock()),city=cities.find(c=>c.code==='SGN');
 const url='https://www.google.com/travel/flights?hl=en&tfs=test';
 const result=normalizeFlights({best_flights:[offer(4475)],other_flights:[offer(2269)],search_metadata:{google_flights_url:url}},query,city,clock().toISOString());
 assert.equal(result.fare.options.length,1);assert.equal(result.fare.price,2269);assert.equal(result.fare.googleUrl,url);
 for(const bad of ['https://evil.example/travel/flights','javascript:alert(1)','https://www.google.com/travel/flights?api_key=secret']){
 const f=normalizeFlights({other_flights:[offer(2269)],search_metadata:{google_flights_url:bad}},query,city,clock().toISOString()).fare;
 assert.ok(f.googleUrl.startsWith('https://www.google.com/travel/flights?'));assert.ok(!f.googleUrl.includes('secret'));
 }
});
test('BOS–ATL–ICN–SGN domestic premium plus international business remains eligible at 2269',()=>{
 const query=validateLiveQuery({...input,date:'2026-12-21'},clock()),city=cities.find(c=>c.code==='SGN');
 for(const domesticCabin of ['Business','First']){
 const legs=[['BOS','ATL','Delta',domesticCabin],['ATL','ICN','Korean Air','Business'],['ICN','SGN','Korean Air','Business']].map(([from,to,airline,travel_class],i)=>({departure_airport:{id:from,time:`2026-12-${i?22:21} 10:00`},arrival_airport:{id:to,time:'2026-12-22 14:00'},airline,travel_class,flight_number:'Flight '+i}));
 const expensive=offer(4475);expensive.flights[0].departure_airport.time='2026-12-21 10:00';
 const result=normalizeFlights({best_flights:[expensive],other_flights:[{price:2269,total_duration:1650,flights:legs}]},query,city,clock().toISOString());
 assert.equal(result.fare.price,2269);assert.equal(result.fare.stops,2);assert.equal(result.fare.legs[0].segments.length,3);assert.equal(result.fare.mixedCabin,false);assert.equal(result.fare.options.length,2);assert.equal(result.cabinExcluded,0);
 }
});
test('single-city refresh bypasses both caches and next ordinary search reuses refreshed result',async()=>{
 let calls=0;const seen=[];const service=createFlightService({apiKey:'private-test-key',now:clock,request:async url=>{seen.push(new URL(url));calls++;return response({best_flights:[offer(calls===1?4475:2269)],search_metadata:{id:'non-secret-search-id',created_at:'2026-11-02 11:00:00 UTC'}});}});
 const old=await service.search(input);assert.equal(old.results[0].price,4475);assert.equal(old.results[0].checkedAt,'2026-11-02T11:00:00.000Z');assert.equal(old.coverage[0].fetchedAt,'2026-11-02T12:00:00.000Z');
 const fresh=await service.search({...input,refresh:true});assert.equal(calls,2);assert.equal(seen[1].searchParams.get('no_cache'),'true');assert.equal(fresh.results[0].price,2269);assert.equal(fresh.coverage[0].refreshed,true);
 const reused=await service.search(input);assert.equal(calls,2);assert.equal(reused.results[0].price,2269);assert.equal(reused.coverage[0].cached,true);
 assert.ok(!JSON.stringify(fresh).includes('private-test-key'));assert.equal(fresh.coverage[0].providerParameters.sort_by,'2');
 assert.throws(()=>validateLiveQuery({...input,destination:'Asia',refresh:true},clock()),/single city/);
});
test('audit explains exactly why each omitted offer was excluded without copying raw provider fields',()=>{
 const query=validateLiveQuery(input,clock()),city=cities.find(c=>c.code==='SGN');
 const unknown=offer(2269,{cabin:''});const wrongDate=offer(2100);wrongDate.flights[0].departure_airport.time='2026-12-20 10:00';const missingDuration=offer(2200);delete missingDuration.total_duration;
 const normalized=normalizeFlights({best_flights:[offer(4475),unknown,wrongDate,missingDuration],api_key:'never-expose'},query,city,clock().toISOString());
 assert.deepEqual(normalized.diagnostics.offerAudit.map(o=>o.reason),[null,'unverified_segment_cabin','departure_date_does_not_match_search','missing_total_duration']);assert.equal(normalized.diagnostics.offerAudit[1].price,2269);assert.equal(normalized.diagnostics.offerAudit[1].segments[0].origin,'BOS');assert.ok(!JSON.stringify(normalized).includes('never-expose'));
});

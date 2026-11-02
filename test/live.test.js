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

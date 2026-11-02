import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cities,airportCodes,getSearchPlan,expandSearchQueries,searchFares,selectLiveFares,skyscannerUrl} from '../public/search.js';
import {validateLiveQuery,providerParams,normalizeFlights,createFlightService} from '../lib/flights.js';
const now=()=>new Date('2026-11-02T12:00:00Z');
const date='2026-12-21';
test('regional reverse search expands the same listed Asian airports toward a selected US city',()=>{
 const input={origin:'Asia',destination:'BOS',date,cabin:'business'};
 const plan=getSearchPlan(input);assert.equal(plan.reverse,true);assert.equal(plan.single,false);assert.equal(plan.targets.length,cities.length);
 const requests=expandSearchQueries(input);assert.equal(requests.length,cities.length);assert.ok(requests.every(q=>q.destination==='BOS'&&q.date===date));assert.ok(requests.some(q=>q.origin==='SGN'));
 assert.equal(getSearchPlan({origin:'Southeast Asia',destination:'RDU'}).targets.length,8);
 for(const q of [{origin:'Asia',destination:'SGN'},{origin:'BOS',destination:'NYC'}])assert.throws(()=>getSearchPlan(q));
});
test('samples reverse actual airports, date, round trip, and NYC arrival group',()=>{
 const one=searchFares({origin:'Asia',destination:'BOS',date,cabin:'business'});assert.equal(one.length,cities.length);assert.ok(one.every(f=>f.reverse&&airportCodes(f.comparisonCode).includes(f.origin)&&f.code==='BOS'&&f.date===date));
 const round=searchFares({origin:'SGN',destination:'NYC',date,cabin:'business',trip:'roundtrip',returnDate:'2026-12-29'})[0];assert.equal(round.origin,'SGN');assert.ok(['JFK','EWR','LGA'].includes(round.code));assert.equal(round.legs[1].origin,round.code);assert.equal(round.legs[1].code,'SGN');
 assert.match(skyscannerUrl(round),new RegExp('/sgn/'+round.code.toLowerCase()+'/261221/261229/'));
});
test('provider request reverses airport fields and accepts actual NYC arrival airport',()=>{
 const query=validateLiveQuery({origin:'SGN',destination:'NYC',date,cabin:'business'},now()),city=query.targets[0];
 const params=providerParams(query,city);assert.equal(params.departure_id,'SGN');assert.equal(params.arrival_id,'JFK,EWR,LGA');assert.equal(params.travel_class,'3');
 const offer={price:2200,total_duration:1300,flights:[{departure_airport:{id:'SGN',time:date+' 10:00'},arrival_airport:{id:'EWR',time:date+' 23:00'},airline:'Test airline',travel_class:'Business'}]};
 const normalized=normalizeFlights({other_flights:[offer]},query,city,now().toISOString());assert.equal(normalized.fare.origin,'SGN');assert.equal(normalized.fare.code,'EWR');assert.equal(normalized.fare.comparisonCode,'SGN');assert.equal(normalized.fare.city,'Ho Chi Minh City');
 assert.match(normalized.fare.googleUrl,/SGN\+to\+NYC/);
 const wrong=structuredClone(offer);wrong.flights[0].arrival_airport.id='BOS';assert.equal(normalizeFlights({other_flights:[wrong]},query,city,now().toISOString()).fare,null);
});
test('reverse regional results collapse by Asian origin, single-origin options expand and filter',()=>{
 const option=(origin,price,stops)=>({origin,code:'BOS',comparisonCode:origin,price,stops,hours:20,reverse:true});
 const sgn=[option('SGN',2200,1),option('SGN',3000,0)],hnd=[option('HND',2100,1)];
 const groups=[{...sgn[0],options:sgn},{...hnd[0],options:hnd}];
 assert.deepEqual(selectLiveFares(groups,{origin:'Asia',destination:'BOS'}).map(f=>f.origin),['HND','SGN']);
 assert.deepEqual(selectLiveFares(groups,{origin:'SGN',destination:'BOS'}).map(f=>f.price),[2200,3000]);
 assert.equal(selectLiveFares(groups,{origin:'SGN',destination:'BOS',nonstop:true})[0].price,3000);
});
test('regional reverse service normalizes all groups and caches reversed route independently',async()=>{
 const seen=[];const service=createFlightService({apiKey:'test-key',now,dailyLimit:100,request:async url=>{
  const from=url.searchParams.get('departure_id').split(',')[0],to=url.searchParams.get('arrival_id').split(',')[0];seen.push([from,to]);
  return {ok:true,json:async()=>({other_flights:[{price:2200,total_duration:1200,flights:[{departure_airport:{id:from,time:date+' 09:00'},arrival_airport:{id:to,time:date+' 20:00'},airline:'Test',travel_class:'Business'}]}]})};
 }});
 const result=await service.search({origin:'Asia',destination:'BOS',date,cabin:'business'});assert.equal(result.results.length,cities.length);assert.ok(result.results.every(f=>f.code==='BOS'));assert.equal(seen.length,cities.length);
 await service.search({origin:'SGN',destination:'BOS',date,cabin:'business'});assert.equal(seen.length,cities.length);
 await service.search({origin:'BOS',destination:'SGN',date,cabin:'business'});assert.equal(seen.length,cities.length+1);assert.deepEqual(seen.at(-1),['BOS','SGN']);
});

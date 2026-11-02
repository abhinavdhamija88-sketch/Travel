import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cities,airportCodes,getSearchPlan,expandSearchQueries,skyscannerUrl,searchFares} from '../public/search.js';
import {validateLiveQuery,providerParams,normalizeFlights,createFlightService} from '../lib/flights.js';
const now=()=>new Date('2026-11-02T12:00:00Z');
const date='2026-12-21';
test('catalogue has the approved 24 unique cities and correct region sizes',()=>{
 assert.equal(cities.length,24);assert.equal(new Set(cities.map(c=>c.code)).size,24);
 for(const city of ['Bengaluru','Hyderabad','Goa','Kolkata','Chiang Mai','Beijing','Shanghai','Guangzhou','Osaka','Colombo','Hanoi','Shenzhen'])assert.ok(cities.some(c=>c.city===city),city);
 for(const city of ['Jakarta','Dhaka','Kathmandu'])assert.ok(!cities.some(c=>c.city===city),city);
 for(const [region,count] of [['Asia',24],['East Asia',9],['Southeast Asia',8],['South Asia',7]])assert.equal(getSearchPlan({origin:'BOS',destination:region}).targets.length,count);
});
test('airport groups are automatic while Seoul, Bangkok and Taipei retain only their primary airport',()=>{
 for(const [code,airports] of Object.entries({HND:['HND','NRT'],KIX:['KIX','ITM'],PEK:['PEK','PKX'],PVG:['PVG','SHA'],GOI:['GOI','GOX'],ICN:['ICN'],BKK:['BKK'],TPE:['TPE']}))assert.deepEqual(airportCodes(code),airports);
 assert.equal(expandSearchQueries({origin:'BOS',destination:'Asia'}).length,24);
 assert.equal(expandSearchQueries({origin:'Asia',destination:'NYC'}).length,24);
});
function offer(from,to,price){return {price,total_duration:1300,flights:[{departure_airport:{id:from,time:date+' 10:00'},arrival_airport:{id:to,time:'2026-12-22 12:00'},travel_class:'Business',airline:'Test airline',flight_number:'TA 100'}]};}
test('one grouped Tokyo request includes both airports and accepts the cheaper Narita fare without losing city identity',async()=>{
 const query=validateLiveQuery({origin:'NYC',destination:'HND',date,cabin:'business'},now()),city=query.targets[0];
 const params=providerParams(query,city);assert.equal(params.departure_id,'JFK,EWR,LGA');assert.equal(params.arrival_id,'HND,NRT');
 const normalized=normalizeFlights({best_flights:[offer('JFK','HND',3000)],other_flights:[offer('EWR','NRT',2200)]},query,city,now().toISOString());
 assert.equal(normalized.fare.city,'Tokyo');assert.equal(normalized.fare.comparisonCode,'HND');assert.equal(normalized.fare.code,'NRT');assert.equal(normalized.fare.origin,'EWR');assert.equal(normalized.fare.price,2200);assert.equal(normalized.fare.options.length,2);assert.equal(normalized.fare.arrival,'2026-12-22 12:00');assert.match(skyscannerUrl(normalized.fare),/ewr\/nrt\/261221/);
 let calls=0;const service=createFlightService({apiKey:'test-key',now,request:async url=>{calls++;assert.equal(url.searchParams.get('arrival_id'),'HND,NRT');return {ok:true,json:async()=>({other_flights:[offer('EWR','NRT',2200)]})};}});
 await service.search({origin:'NYC',destination:'HND',date,cabin:'business'});assert.equal(calls,1);
});
test('all grouped cities accept secondary airports in both directions but reject unrelated airports',()=>{
 for(const code of ['HND','KIX','PEK','PVG','GOI']){
 const city=cities.find(c=>c.code===code),secondary=city.airports[1];
 const outbound=validateLiveQuery({origin:'BOS',destination:code,date,cabin:'business'},now());
 assert.equal(normalizeFlights({other_flights:[offer('BOS',secondary,2200)]},outbound,city,now().toISOString()).fare.code,secondary);
 const inbound=validateLiveQuery({origin:code,destination:'NYC',date,cabin:'business'},now());
 assert.equal(providerParams(inbound,city).departure_id,city.airports.join(','));assert.equal(providerParams(inbound,city).arrival_id,'JFK,EWR,LGA');
 const f=normalizeFlights({other_flights:[offer(secondary,'EWR',2200)]},inbound,city,now().toISOString()).fare;assert.equal(f.origin,secondary);assert.equal(f.comparisonCode,code);assert.equal(f.city,city.city);
 assert.equal(normalizeFlights({other_flights:[offer('BOS','SGN',2200)]},outbound,city,now().toISOString()).fare,null);
 }
});
test('sample grouped results also preserve actual airports and city grouping',()=>{
 for(const code of ['HND','KIX','PEK','PVG','GOI']){
 const f=searchFares({origin:'BOS',destination:code,date})[0];assert.ok(airportCodes(code).includes(f.code));assert.equal(f.comparisonCode,code);
 const r=searchFares({origin:code,destination:'BOS',date})[0];assert.ok(airportCodes(code).includes(r.origin));assert.equal(r.comparisonCode,code);
 }
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {searchFares,origins,cities} from '../public/search.js';
const query={origin:'BOS',date:'2026-12-15',cabin:'business'};
test('one-way search returns every listed destination on the exact requested day and sorts by total price',()=>{
 const results=searchFares(query);assert.equal(results.length,cities.length);
 assert.ok(results.every((f,i)=>f.date===query.date&&f.legs.length===1&&(!i||f.price>=results[i-1].price)));
});
test('every listed departure city returns sample results',()=>{
 assert.deepEqual(origins.map(o=>o.code),['NYC','CLT','MIA','ORD','PHL','IAD','BOS','RDU']);
 for(const origin of origins)assert.equal(searchFares({...query,origin:origin.code}).length,cities.length);
});
test('NYC picks the lowest trip total from its actual airports',()=>{
 const results=searchFares({...query,origin:'NYC',trip:'roundtrip',returnDate:'2026-12-29'});
 for(const f of results){assert.ok(['JFK','EWR','LGA'].includes(f.origin));assert.equal(f.legs[0].origin,f.origin);assert.equal(f.legs[1].code,f.origin);assert.equal(f.price,f.legs.reduce((n,l)=>n+l.price,0));}
});
test('round trip includes exact return date and full price',()=>{
 const results=searchFares({...query,trip:'roundtrip',returnDate:'2026-12-29'});assert.equal(results.length,cities.length);
 for(const f of results){assert.equal(f.legs.length,2);assert.equal(f.legs[1].origin,f.code);assert.equal(f.legs[1].code,'BOS');assert.equal(f.legs[1].date,'2026-12-29');assert.equal(f.price,f.legs[0].price+f.legs[1].price);}
});
test('multi-city connects each flight and returns home to the actual departure airport',()=>{
 const results=searchFares({...query,origin:'NYC',destination:'SGN',trip:'multicity',onward:[{code:'SIN',date:'2026-12-20'},{code:'HOME',date:'2026-12-29'}]});assert.equal(results.length,1);
 const f=results[0];assert.equal(f.legs.length,3);assert.equal(f.legs[1].origin,'SGN');assert.equal(f.legs[1].code,'SIN');assert.equal(f.legs[2].origin,'SIN');assert.equal(f.legs[2].code,f.origin);assert.equal(f.price,f.legs.reduce((n,l)=>n+l.price,0));
});
test('filters, specific destination, cabins and descending sorting',()=>{
 const results=searchFares({...query,nonstop:true,destination:'East Asia',budget:3000,sort:'highest'});assert.ok(results.length>0);
 assert.ok(results.every((f,i)=>f.stops===0&&f.region==='East Asia'&&f.price<=3000&&(!i||f.price<=results[i-1].price)));
 assert.equal(searchFares({...query,budget:1}).length,0);
 assert.equal(searchFares({...query,destination:'SGN'})[0].code,'SGN');
 assert.ok(searchFares({...query,cabin:'economy'})[0].price<searchFares(query)[0].price);
});
test('rejects invalid dates and reversed trips, and excludes identical consecutive airports',()=>{
 for(const change of [{date:''},{date:'2026-02-30'},{origin:'NE'},{trip:'roundtrip',returnDate:'2026-12-01'},{trip:'multicity',onward:[]},{trip:'multicity',onward:[{code:'SIN',date:'2026-12-01'}]}]) assert.throws(()=>searchFares({...query,...change}));
 assert.equal(searchFares({...query,destination:'SIN',trip:'multicity',onward:[{code:'SIN',date:'2026-12-20'}]}).length,0);
});

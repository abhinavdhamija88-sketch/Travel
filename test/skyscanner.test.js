import {test} from 'node:test';
import assert from 'node:assert/strict';
import {skyscannerUrl,searchFares} from '../public/search.js';
const query={origin:'BOS',date:'2026-12-15',cabin:'business',destination:'SGN'};
test('one way carries airports, date, cabin, and passenger',()=>{
 const url=new URL(skyscannerUrl({...query,code:'SGN'}));assert.equal(url.origin,'https://www.skyscanner.com');assert.equal(url.pathname,'/transport/flights/bos/sgn/261215/');assert.equal(url.searchParams.get('cabinclass'),'business');assert.equal(url.searchParams.get('adultsv2'),'1');assert.equal(url.searchParams.get('rtn'),'0');
});
test('round trip carries both selected dates',()=>{
 const url=new URL(skyscannerUrl({...query,code:'SGN',returnDate:'2026-12-29'}));assert.equal(url.pathname,'/transport/flights/bos/sgn/261215/261229/');assert.equal(url.searchParams.get('rtn'),'1');
});
test('multi-city links use each leg actual route, date and cabin',()=>{
 const f=searchFares({...query,origin:'NYC',cabin:'premium',trip:'multicity',onward:[{code:'SIN',date:'2026-12-20'},{code:'HOME',date:'2026-12-29'}]})[0];
 for(const l of f.legs){const url=new URL(skyscannerUrl(l));assert.equal(url.pathname,`/transport/flights/${l.origin.toLowerCase()}/${l.code.toLowerCase()}/${l.date.slice(2).replaceAll('-','')}/`);assert.equal(url.searchParams.get('cabinclass'),'premiumeconomy');assert.equal(url.searchParams.get('rtn'),'0');}
});
test('rejects unresolved airports and invalid dates',()=>{
 for(const change of [{origin:'NE'},{date:'2026-02-30'},{returnDate:'2026-01-01'},{cabin:'first'}])assert.throws(()=>skyscannerUrl({...query,code:'SGN',...change}));
});

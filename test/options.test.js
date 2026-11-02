import {test} from 'node:test';
import assert from 'node:assert/strict';
import {selectLiveFares} from '../public/search.js';
const cheap={code:'SGN',price:2269,stops:1,hours:25},expensive={code:'SGN',price:4475,stops:0,hours:20};
const group={...cheap,options:[cheap,expensive]};
test('single-city shows multiple options while regional search preserves lowest-per-city comparison',()=>{
 assert.deepEqual(selectLiveFares([group],{destination:'SGN'}).map(f=>f.price),[2269,4475]);
 assert.deepEqual(selectLiveFares([group],{destination:'Asia'}).map(f=>f.price),[2269]);
 assert.equal(selectLiveFares([group],{destination:'Asia'})[0].optionCount,2);
 assert.equal(selectLiveFares([group],{destination:'SGN',nonstop:true})[0].price,4475);
 assert.deepEqual(selectLiveFares([group],{destination:'SGN',sort:'highest'}).map(f=>f.price),[4475,2269]);
 assert.equal(selectLiveFares([group],{destination:'SGN',budget:3000}).length,1);
});
test('mixed-only offers require opt-in, and all business stays eligible',()=>{
 const mixed={...cheap,mixedCabin:true};const grouped={...expensive,options:[mixed,expensive]};
 assert.equal(selectLiveFares([grouped],{destination:'SGN'})[0].price,4475);
 assert.equal(selectLiveFares([grouped],{destination:'SGN',includeMixed:true})[0].price,2269);
 assert.equal(selectLiveFares([{...mixed,options:[mixed]}],{destination:'Asia'}).length,0);
});

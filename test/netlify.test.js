import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from '../netlify/functions/flights.mjs';
import status from '../netlify/functions/status.mjs';
const day=new Date(Date.now()+86400000*10).toISOString().slice(0,10);
const input={origin:'BOS',destination:'SGN',date:day,cabin:'business',trip:'oneway'};
const req=(data=input,headers={})=>new Request('https://atlas.example/api/flights',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(data)});
test('Netlify function accepts one city, bounds regions and validates origin',async()=>{
 let calls=0;const handler=createHandler({search:async q=>{calls++;return {results:[],coverage:[{code:q.destination,status:'no_matching_fare'}]};}});
 assert.equal((await handler(req())).status,200);assert.equal(calls,1);
 assert.equal((await handler(req({...input,destination:'Asia'}))).status,400);assert.equal(calls,1);
 assert.equal((await handler(req(input,{Origin:'https://other.example'}))).status,403);assert.equal(calls,1);
 assert.equal((await handler(req({...input,padding:'x'.repeat(9000)}))).status,413);
 const state=await (await status()).json();assert.equal(state.maxDestinationsPerRequest,1);assert.ok(!('apiKey' in state));
});

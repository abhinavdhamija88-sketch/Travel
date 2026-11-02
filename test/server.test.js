import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createApp} from '../server.js';
import {createFlightService} from '../lib/flights.js';
test('HTTP serves UI, reports missing connection, and fails live requests without exposing credentials',async()=>{
 const server=createApp({service:createFlightService({apiKey:''})});server.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
 try{
 assert.equal((await fetch(base+'/healthz')).status,200);
 const html=await (await fetch(base)).text();assert.match(html,/data-source/);assert.ok(!html.includes('api_key='));
 assert.deepEqual(await (await fetch(base+'/api/status')).json(),{configured:false,liveTrips:['oneway']});
 const response=await fetch(base+'/api/flights',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({})});assert.equal(response.status,503);assert.match((await response.json()).error,/not connected/);
 const cross=await fetch(base+'/api/flights',{method:'POST',headers:{Origin:'https://other.example','Content-Type':'application/json'},body:'{}'});assert.equal(cross.status,403);
 const invalid=await fetch(base+'/api/flights',{method:'POST',headers:{'Content-Type':'application/json'},body:'bad json'});assert.equal(invalid.status,400);
 const source=await fetch(base+'/.env');assert.equal(source.status,404);
 }finally{server.closeAllConnections();server.close();}
});

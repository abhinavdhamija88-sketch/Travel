import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createFlightService,FlightError} from './lib/flights.js';
const files={'/assets/singapore-banner.png':'assets/singapore-banner.png','/':'index.html','/app.js':'app.js','/style.css':'style.css','/search.js':'search.js'};
const types={html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',png:'image/png'};
export function createApp({service=createFlightService({dailyLimit:Number(process.env.SERPAPI_DAILY_LIMIT)||24})}={}){
 return http.createServer(async(req,res)=>{
  const json=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
  const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/api/status'&&req.method==='GET')return json(200,{configured:service.configured,liveTrips:['oneway']});
  if(path==='/healthz'&&req.method==='GET')return json(200,{ok:true});
  if(path==='/api/flights'&&req.method==='POST'){
   if(req.headers.origin){try{if(new URL(req.headers.origin).host!==req.headers.host)return json(403,{error:'Use the website to run this search.'});}catch{return json(403,{error:'Invalid request origin.'});}}
   if(!req.headers['content-type']?.startsWith('application/json'))return json(415,{error:'Send a JSON search request.'});
   try{
    let body='';for await(const part of req){body+=part;if(Buffer.byteLength(body)>8192)return json(413,{error:'Search request is too large.'});}
    let input;try{input=JSON.parse(body);}catch{return json(400,{error:'Invalid search request.'});}
    return json(200,await service.search(input));
   }catch(e){return json(e instanceof FlightError?e.status:500,{error:e instanceof FlightError?e.message:'The flight search could not be completed.'});}
  }
  if(req.method!=='GET'&&req.method!=='HEAD')return json(405,{error:'Method not allowed.'});
  const file=files[path];if(!file){res.writeHead(404);return res.end('Not found');}
  try{
   const body=await readFile(new URL(`./public/${file}`,import.meta.url));
   res.writeHead(200,{'Content-Type':types[file.split('.').pop()],'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:body);
  }catch{res.writeHead(500);res.end('Unable to load application');}
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){createApp().listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('Atlas listening on port '+(process.env.PORT||3000)));}

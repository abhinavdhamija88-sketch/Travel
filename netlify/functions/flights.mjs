import {createFlightService,FlightError,validateLiveQuery} from '../../lib/flights.js';
const service=createFlightService({dailyLimit:Number(process.env.SERPAPI_DAILY_LIMIT)||24});
export function createHandler(provider=service){
 return async request=>{
  const reply=(status,value)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
  if(request.method!=='POST')return reply(405,{error:'Method not allowed.'});
  const origin=request.headers.get('origin');
  if(origin&&origin!==new URL(request.url).origin)return reply(403,{error:'Use the website to run this search.'});
  if(!request.headers.get('content-type')?.startsWith('application/json'))return reply(415,{error:'Send a JSON search request.'});
  try{
   if(Number(request.headers.get('content-length'))>8192)return reply(413,{error:'Search request is too large.'});
   const reader=request.body?.getReader();let text='',size=0;
   if(reader){const decoder=new TextDecoder();for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>8192){await reader.cancel();return reply(413,{error:'Search request is too large.'});}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}
   let input;try{input=JSON.parse(text);}catch{return reply(400,{error:'Invalid search request.'});}
   const query=validateLiveQuery(input);
   // One destination per invocation keeps slow regional scans out of function timeouts.
   if(query.targets.length!==1)return reply(400,{error:'Search one destination per request. The website combines regional results automatically.'});
   return reply(200,await provider.search(input));
  }catch(e){return reply(e instanceof FlightError?e.status:500,{error:e instanceof FlightError?e.message:'The flight search could not be completed.'});}
 };
}
export default createHandler();

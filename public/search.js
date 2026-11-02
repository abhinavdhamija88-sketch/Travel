export const cities = [
 ['Tokyo','Japan','HND','East Asia',35.7,139.7,2480,'Japan Airlines',0,14.2],
 ['Seoul','South Korea','ICN','East Asia',37.5,127,2260,'Korean Air',0,14.8],
 ['Taipei','Taiwan','TPE','East Asia',25,121.5,2190,'EVA Air',1,19.5],
 ['Hong Kong','Hong Kong','HKG','East Asia',22.3,114.2,2350,'Cathay Pacific',0,15.8],
 ['Bangkok','Thailand','BKK','Southeast Asia',13.7,100.5,1980,'Qatar Airways',1,23.4],
 ['Singapore','Singapore','SIN','Southeast Asia',1.3,103.8,2690,'Singapore Airlines',1,22.1],
 ['Ho Chi Minh City','Vietnam','SGN','Southeast Asia',10.8,106.7,2070,'Turkish Airlines',1,24.5],
 ['Kuala Lumpur','Malaysia','KUL','Southeast Asia',3.1,101.7,2120,'Qatar Airways',1,24.1],
 ['Delhi','India','DEL','South Asia',28.6,77.2,1840,'Etihad Airways',1,19.2],
 ['Mumbai','India','BOM','South Asia',19.1,72.9,1920,'Etihad Airways',1,18.8],
 ['Manila','Philippines','MNL','Southeast Asia',14.6,121,2310,'Cathay Pacific',1,21.4],
 ['Bali','Indonesia','DPS','Southeast Asia',-8.7,115.2,2830,'Qatar Airways',1,27.3]
].map(([city,country,code,region,lat,lon,base,airline,stops,hours])=>({city,country,code,region,lat,lon,base,airline,stops,hours}));
export const origins = [
 {code:'NYC',label:'New York City · NYC (JFK, Newark, LaGuardia)',airports:['JFK','EWR','LGA']},
 {code:'CLT',label:'Charlotte · CLT'}, {code:'MIA',label:'Miami · MIA'},
 {code:'ORD',label:'Chicago · ORD'}, {code:'PHL',label:'Philadelphia · PHL'},
 {code:'IAD',label:'Washington Dulles · IAD'}, {code:'BOS',label:'Boston · BOS'},
 {code:'RDU',label:'Raleigh-Durham · RDU'}
];
const offsets={JFK:-140,EWR:-80,LGA:90,CLT:130,MIA:160,ORD:-20,PHL:70,IAD:40,BOS:0,RDU:150};
const cabins={business:'business',premium:'premiumeconomy',economy:'economy'};
const regions=['Asia','East Asia','Southeast Asia','South Asia'];
export function validDate(value){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return false;
 const d=new Date(value+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;
}
function airport(code){return Object.hasOwn(offsets,code)||cities.some(c=>c.code===code);}
function quote(origin,code,date,cabin){
 const target=cities.find(c=>c.code===code),source=cities.find(c=>c.code===origin);
 const base=target?.base||source?.base||700;
 const intra=Boolean(source&&target);
 const n=Math.floor(Date.parse(date)/86400000);
 const variation=(n+origin.charCodeAt(0)+code.charCodeAt(0))%17;
 const multiplier=cabin==='economy'?.34:cabin==='premium'?.62:1;
 const price=Math.round(((intra?base*.3:base)+(offsets[origin]||offsets[code]||0)+variation*23)*multiplier);
 const stops=intra?0:origin==='LGA'?1:(target||source)?.stops??1;
 return {origin,code,date,cabin,price,stops,hours:intra?5:(target||source)?.hours||12,airline:(target||source)?.airline||'Sample airline'};
}
export function searchFares({origin='NYC',destination='Asia',date,returnDate,trip='oneway',onward=[],cabin='business',nonstop=false,budget=Infinity,sort='price'}){
 if(!origins.some(o=>o.code===origin))throw new Error('Choose a departure city.');
 if(!Object.hasOwn(cabins,cabin))throw new Error('Choose a cabin.');
 if(!['oneway','roundtrip','multicity'].includes(trip))throw new Error('Choose a trip type.');
 if(!validDate(date))throw new Error('Choose a valid departure date.');
 if(!regions.includes(destination)&&!cities.some(c=>c.code===destination))throw new Error('Choose a destination.');
 if(trip==='roundtrip'&&(!validDate(returnDate)||returnDate<date))throw new Error('Choose a return date on or after departure.');
 if(trip==='multicity'){
  if(!Array.isArray(onward)||onward.length<1||onward.length>5)throw new Error('Add between two and six flights for a multi-city trip.');
  let previous=date;
  for(const leg of onward){if(!airport(leg.code)&&leg.code!=='HOME')throw new Error('Choose a destination for every flight.');if(!validDate(leg.date)||leg.date<previous)throw new Error('Flight dates must be in order.');previous=leg.date;}
 }
 const airports=origin==='NYC'?['JFK','EWR','LGA']:[origin];
 const candidates=cities.filter(c=>destination==='Asia'||c.region===destination||c.code===destination);
 const results=candidates.flatMap(c=>{
 const options=airports.flatMap(departure=>{
  const legs=[quote(departure,c.code,date,cabin)];
  if(trip==='roundtrip')legs.push(quote(c.code,departure,returnDate,cabin));
  if(trip==='multicity')for(const next of onward){const from=legs.at(-1).code,to=next.code==='HOME'?departure:next.code;if(from===to)return [];legs.push(quote(from,to,next.date,cabin));}
  return [{...c,origin:departure,date,cabin,trip,returnDate,legs,price:legs.reduce((n,l)=>n+l.price,0),hours:legs.reduce((n,l)=>n+l.hours,0),stops:legs.reduce((n,l)=>n+l.stops,0)}];
 }).filter(f=>f.price<=budget&&(!nonstop||f.legs.every(l=>l.stops===0)));
 options.sort((a,b)=>a.price-b.price);return options.length?[options[0]]:[];
 });
 return results.sort((a,b)=>sort==='highest'?b.price-a.price:sort==='duration'?a.hours-b.hours:a.price-b.price);
}
export function skyscannerUrl({origin,code,date,cabin,returnDate}){
 if(!/^[A-Z]{3}$/.test(origin||'')||!/^[A-Z]{3}$/.test(code||''))throw new Error('Specific airports are required.');
 if(!validDate(date)||returnDate&&(!validDate(returnDate)||returnDate<date))throw new Error('Valid travel dates are required.');
 if(!Object.hasOwn(cabins,cabin))throw new Error('Choose a cabin.');
 const compact=d=>d.slice(2).replaceAll('-','');
 const url=new URL(`https://www.skyscanner.com/transport/flights/${origin.toLowerCase()}/${code.toLowerCase()}/${compact(date)}/${returnDate?compact(returnDate)+'/':''}`);
 url.search=new URLSearchParams({adultsv2:'1',cabinclass:cabins[cabin],rtn:returnDate?'1':'0',currency:'USD',outboundaltsenabled:'false',inboundaltsenabled:'false'}).toString();return url.href;
}

import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {cities} from '../public/search.js';
const searches={HND:'Tokyo Tower skyline',ICN:'Seoul skyline N Seoul Tower',TPE:'Taipei 101 skyline',HKG:'Hong Kong Victoria Harbour skyline',BKK:'Bangkok Wat Arun temple',SIN:'Singapore Marina Bay skyline',SGN:'Ho Chi Minh City skyline',KUL:'Kuala Lumpur Petronas Towers',DEL:'New Delhi India Gate',BOM:'Mumbai Gateway of India',MNL:'Manila skyline',DPS:'Bali Ulun Danu Beratan temple'};
const plain=value=>String(value||'').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
const licensePattern=/^(CC BY(?:-SA)? (?:2\.0|2\.5|3\.0|4\.0)|CC0(?: 1\.0)?|Public domain)$/i;
export function selectPhoto(payload,rejected={}){
 const reject=reason=>{rejected[reason]=(rejected[reason]||0)+1;};
 const pages=Object.values(payload?.query?.pages||{}).sort((a,b)=>(a.index||0)-(b.index||0));
 for(const page of pages){
  const info=page.imageinfo?.[0],meta=info?.extmetadata||{};
  const license=plain(meta.LicenseShortName?.value),artist=plain(meta.Artist?.value);
  if(!info){reject('missing_image_info');continue;}
  if(!licensePattern.test(license)){reject('unsupported_or_missing_license');continue;}
  if(!artist){reject('missing_artist');continue;}
  if(!['image/jpeg','image/png','image/webp'].includes(info.mime)){reject('unsupported_image_type');continue;}
  if(plain(meta.Restrictions?.value)){reject('additional_reuse_restrictions');continue;}
  const description=plain(meta.ImageDescription?.value);
  if(/AI.generated|artificial intelligence|midjourney|stable diffusion|dall.e|painting|watercolou?r|illustration|rendering/i.test(page.title+' '+description)){reject('not_a_verified_photograph');continue;}
  if(info.width<info.height||info.width<300||info.height<150){reject('unsuitable_dimensions');continue;}
  try{
   const image=new URL(info.thumburl||''),source=new URL(info.descriptionurl||'');
   if(image.protocol!=='https:'||image.hostname!=='upload.wikimedia.org'||source.protocol!=='https:'||source.hostname!=='commons.wikimedia.org'){reject('untrusted_image_or_source_url');continue;}
   let licenseUrl=meta.LicenseUrl?.value||'';
   if(licenseUrl){const u=new URL(licenseUrl);if(!['http:','https:'].includes(u.protocol)||u.hostname!=='creativecommons.org'){reject('untrusted_license_url');continue;}u.protocol='https:';licenseUrl=u.href;}
   else if(/^Public domain$/i.test(license))licenseUrl='https://commons.wikimedia.org/wiki/Commons:Public_domain';
   else if(/^CC0/i.test(license))licenseUrl='https://creativecommons.org/publicdomain/zero/1.0/';
   else {reject('missing_license_url');continue;}
   return {title:plain(page.title.replace(/^File:/,'')),artist,license,licenseUrl,sourceUrl:source.href,imageUrl:image.href,mime:info.mime};
  }catch{reject('invalid_source_metadata');}
 }
 return null;
}
export async function fetchCityPhotos({request=globalThis.fetch,outputDir=new URL('../public/assets/cities/',import.meta.url),targets=cities,log=console.log}={}){
 await mkdir(outputDir,{recursive:true});const manifest={version:2,createdAt:new Date().toISOString(),requestedPhotoCount:targets.length,photoCount:0,status:'pending',failureSummary:{},firstFailure:null,photos:{},failures:[]};
 for(const city of targets){
  let stage='search',sourceStatus=null,imageStatus=null,candidateCount=0,rejectedCandidates={};
  try{
   const url=new URL('https://commons.wikimedia.org/w/api.php');
   url.search=new URLSearchParams({action:'query',format:'json',generator:'search',gsrsearch:searches[city.code]+' filetype:bitmap -drawing -map -logo',gsrnamespace:'6',gsrlimit:'15',prop:'imageinfo',iiprop:'url|mime|size|extmetadata',iiurlwidth:'160'}).toString();
   const headers={'User-Agent':'AtlasFlightCityPhotos/1.0 (https://github.com/abhinavdhamija88-sketch/Travel)'};
   const response=await request(url,{headers,signal:AbortSignal.timeout(15000)});
   sourceStatus=response.status;
   if(!response.ok)throw new Error('Wikimedia search returned HTTP '+response.status);
   const data=await response.json();
   if(data.error)throw new Error('Wikimedia search error: '+plain(data.error.code||'unknown')+' — '+plain(data.error.info||'').slice(0,180));
   candidateCount=Object.keys(data.query?.pages||{}).length;
   stage='license_selection';
   const photo=selectPhoto(data,rejectedCandidates);if(!photo)throw new Error(candidateCount?'All '+candidateCount+' photo candidates were rejected; see rejectedCandidates.':'Wikimedia returned no photo candidates.');
   stage='image_download';
   const image=await request(photo.imageUrl,{headers,signal:AbortSignal.timeout(15000),redirect:'error'});
   imageStatus=image.status;
   if(!image.ok)throw new Error('Image CDN returned HTTP '+image.status);
   if(!image.headers.get('content-type')?.split(';')[0].startsWith('image/'))throw new Error('Image CDN returned a non-image content type.');
   if(Number(image.headers.get('content-length'))>512000)throw new Error('thumbnail too large');
   const reader=image.body.getReader();const chunks=[];let size=0;
   for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>512000){await reader.cancel();throw new Error('thumbnail too large');}chunks.push(value);}
   const bytes=Buffer.concat(chunks);if(bytes.length<32)throw new Error('empty thumbnail');
   const receivedMime=image.headers.get('content-type').split(';')[0];
   if(!['image/jpeg','image/png','image/webp'].includes(receivedMime))throw new Error('unsupported thumbnail type');
   const ext=receivedMime==='image/jpeg'?'jpg':receivedMime==='image/png'?'png':'webp',name=city.code+'.'+ext;
   stage='local_write';
   await writeFile(new URL(name,outputDir),bytes);
   const {imageUrl,mime,...credit}=photo;
   manifest.photos[city.code]={city:city.city,src:'/assets/cities/'+name,...credit,display:'Resized thumbnail displayed with a circular crop.'};
   log('City photo ready: '+city.city);
  }catch(error){
   const reason=plain(error.message||'Unknown download error').slice(0,300);
   const failure={code:city.code,city:city.city,stage,reason,sourceStatus,imageStatus,candidateCount,rejectedCandidates};
   if(error.cause?.code)failure.networkCode=String(error.cause.code).slice(0,80);
   manifest.failures.push(failure);manifest.firstFailure ||= failure;
   const summary=stage+': '+reason;manifest.failureSummary[summary]=(manifest.failureSummary[summary]||0)+1;
   log('City photo unavailable: '+city.city+' ('+stage+': '+reason+'); keeping the illustrated fallback.');
  }
 }
 manifest.photoCount=Object.keys(manifest.photos).length;
 manifest.status=manifest.photoCount===targets.length?'complete':manifest.photoCount?'partial':'failed';
 await writeFile(new URL('photos.json',outputDir),JSON.stringify(manifest,null,2)+'\n');
 log('City photos prepared: '+Object.keys(manifest.photos).length+'/'+targets.length);
 return manifest;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await fetchCityPhotos();

import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {cities} from '../public/search.js';
const searches={HND:'Tokyo Tower skyline',ICN:'Seoul skyline N Seoul Tower',TPE:'Taipei 101 skyline',HKG:'Hong Kong Victoria Harbour skyline',BKK:'Bangkok Wat Arun temple',SIN:'Singapore Marina Bay skyline',SGN:'Ho Chi Minh City skyline',KUL:'Kuala Lumpur Petronas Towers',DEL:'New Delhi India Gate',BOM:'Mumbai Gateway of India',MNL:'Manila skyline',DPS:'Bali Ulun Danu Beratan temple'};
const plain=value=>String(value||'').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
const licensePattern=/^(CC BY(?:-SA)? (?:2\.0|2\.5|3\.0|4\.0)|CC0(?: 1\.0)?|Public domain)$/i;
export function selectPhoto(payload){
 const pages=Object.values(payload?.query?.pages||{}).sort((a,b)=>(a.index||0)-(b.index||0));
 for(const page of pages){
  const info=page.imageinfo?.[0],meta=info?.extmetadata||{};
  const license=plain(meta.LicenseShortName?.value),artist=plain(meta.Artist?.value);
  if(!info||!licensePattern.test(license)||!artist||!['image/jpeg','image/png','image/webp'].includes(info.mime))continue;
  if(plain(meta.Restrictions?.value))continue;
  const description=plain(meta.ImageDescription?.value);
  if(/AI.generated|artificial intelligence|midjourney|stable diffusion|dall.e|painting|watercolou?r|illustration|rendering/i.test(page.title+' '+description))continue;
  if(info.width<info.height||info.width<300||info.height<150)continue;
  try{
   const image=new URL(info.thumburl||''),source=new URL(info.descriptionurl||'');
   if(image.protocol!=='https:'||image.hostname!=='upload.wikimedia.org'||source.protocol!=='https:'||source.hostname!=='commons.wikimedia.org')continue;
   let licenseUrl=meta.LicenseUrl?.value||'';
   if(licenseUrl){const u=new URL(licenseUrl);if(!['http:','https:'].includes(u.protocol)||u.hostname!=='creativecommons.org')continue;u.protocol='https:';licenseUrl=u.href;}
   else if(/^Public domain$/i.test(license))licenseUrl='https://commons.wikimedia.org/wiki/Commons:Public_domain';
   else if(/^CC0/i.test(license))licenseUrl='https://creativecommons.org/publicdomain/zero/1.0/';
   else continue;
   return {title:plain(page.title.replace(/^File:/,'')),artist,license,licenseUrl,sourceUrl:source.href,imageUrl:image.href,mime:info.mime};
  }catch{}
 }
 return null;
}
export async function fetchCityPhotos({request=globalThis.fetch,outputDir=new URL('../public/assets/cities/',import.meta.url),targets=cities,log=console.log}={}){
 await mkdir(outputDir,{recursive:true});const manifest={version:1,createdAt:new Date().toISOString(),photos:{}};
 for(const city of targets){
  try{
   const url=new URL('https://commons.wikimedia.org/w/api.php');
   url.search=new URLSearchParams({action:'query',format:'json',generator:'search',gsrsearch:searches[city.code]+' filetype:bitmap -drawing -map -logo',gsrnamespace:'6',gsrlimit:'15',prop:'imageinfo',iiprop:'url|mime|size|extmetadata',iiurlwidth:'160'}).toString();
   const headers={'User-Agent':'AtlasFlightCityPhotos/1.0 (https://github.com/abhinavdhamija88-sketch/Travel)'};
   const response=await request(url,{headers,signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw new Error('source request failed');
   const photo=selectPhoto(await response.json());if(!photo)throw new Error('no eligible photo with verified reuse metadata');
   const image=await request(photo.imageUrl,{headers,signal:AbortSignal.timeout(15000),redirect:'error'});
   if(!image.ok||!image.headers.get('content-type')?.split(';')[0].startsWith('image/'))throw new Error('image download failed');
   if(Number(image.headers.get('content-length'))>512000)throw new Error('thumbnail too large');
   const reader=image.body.getReader();const chunks=[];let size=0;
   for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>512000){await reader.cancel();throw new Error('thumbnail too large');}chunks.push(value);}
   const bytes=Buffer.concat(chunks);if(bytes.length<32)throw new Error('empty thumbnail');
   const receivedMime=image.headers.get('content-type').split(';')[0];
   if(!['image/jpeg','image/png','image/webp'].includes(receivedMime))throw new Error('unsupported thumbnail type');
   const ext=receivedMime==='image/jpeg'?'jpg':receivedMime==='image/png'?'png':'webp',name=city.code+'.'+ext;
   await writeFile(new URL(name,outputDir),bytes);
   const {imageUrl,mime,...credit}=photo;
   manifest.photos[city.code]={city:city.city,src:'/assets/cities/'+name,...credit,display:'Resized thumbnail displayed with a circular crop.'};
   log('City photo ready: '+city.city);
  }catch(error){log('City photo unavailable: '+city.city+' ('+error.message+'); keeping the illustrated fallback.');}
 }
 await writeFile(new URL('photos.json',outputDir),JSON.stringify(manifest,null,2)+'\n');
 log('City photos prepared: '+Object.keys(manifest.photos).length+'/'+targets.length);
 return manifest;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await fetchCityPhotos();

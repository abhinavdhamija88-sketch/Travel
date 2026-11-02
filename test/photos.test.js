import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {selectPhoto,fetchCityPhotos,wikimediaUrl,fetchThumbnail} from '../scripts/fetch-city-photos.mjs';
const page={title:'File:Tokyo Tower skyline.jpg',index:1,imageinfo:[{width:2000,height:1000,mime:'image/jpeg',thumburl:'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/tokyo.jpg/160px-tokyo.jpg',descriptionurl:'https://commons.wikimedia.org/wiki/File:Tokyo_Tower_skyline.jpg',extmetadata:{Artist:{value:'<a href="//commons.wikimedia.org/wiki/User:Example">Example Photographer</a>'},LicenseShortName:{value:'CC BY-SA 4.0'},LicenseUrl:{value:'https://creativecommons.org/licenses/by-sa/4.0/'},ImageDescription:{value:'Tokyo skyline photographed at sunset.'}}}]};
const payload=p=>({query:{pages:{'123':p}}});
test('selects attribution-complete photography and rejects unclear licenses, generated imagery, and foreign hosts',()=>{
 const photo=selectPhoto(payload(page));assert.equal(photo.artist,'Example Photographer');assert.equal(photo.license,'CC BY-SA 4.0');
 for(const change of ['unlicensed','noartist','generated','foreign','portrait']){
  const p=structuredClone(page),i=p.imageinfo[0];
  if(change==='unlicensed')i.extmetadata.LicenseShortName.value='All rights reserved';
  if(change==='noartist')i.extmetadata.Artist.value='';
  if(change==='generated')i.extmetadata.ImageDescription.value='AI-generated image using Midjourney';
  if(change==='foreign')i.thumburl='https://untrusted.example/image.jpg';
  if(change==='portrait'){i.width=600;i.height=1200;}
  assert.equal(selectPhoto(payload(p)),null,change);
 }
});
test('downloads only a licensed thumbnail and writes local paths plus credits; failed cities retain fallbacks',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'atlas-photo-test-')),outputDir=pathToFileURL(dir+'/');let calls=0;
 const request=async url=>{calls++;if(String(url).includes('w/api.php')){
  if(new URL(url).searchParams.get('gsrsearch').startsWith('Singapore'))return new Response('source unavailable',{status:503});
  return new Response(JSON.stringify(payload(page)),{headers:{'Content-Type':'application/json'}});
 }
 return new Response(Buffer.alloc(64,0xff),{headers:{'Content-Type':'image/jpeg'}});
 };
 try{
 const manifest=await fetchCityPhotos({request,outputDir,targets:[{code:'HND',city:'Tokyo'},{code:'SIN',city:'Singapore'}],log:()=>{}});
 assert.equal(manifest.status,'partial');assert.equal(manifest.photoCount,1);assert.equal(manifest.firstFailure.sourceStatus,503);assert.equal(manifest.firstFailure.stage,'search');assert.match(manifest.firstFailure.reason,/HTTP 503/);assert.equal(calls,3);assert.deepEqual(Object.keys(manifest.photos),['HND']);assert.equal(manifest.photos.HND.src,'/assets/cities/HND.jpg');assert.equal(manifest.photos.HND.artist,'Example Photographer');assert.equal((await readFile(join(dir,'HND.jpg'))).length,64);assert.deepEqual(JSON.parse(await readFile(join(dir,'photos.json'),'utf8')),manifest);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('all-failed deployments expose the first actual source failure and its HTTP status',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'atlas-photo-failure-'));
 try{
 const report=await fetchCityPhotos({request:async()=>new Response('blocked',{status:403}),outputDir:pathToFileURL(dir+'/'),targets:[{code:'HND',city:'Tokyo'}],log:()=>{}});
 assert.equal(report.version,2);assert.equal(report.status,'failed');assert.equal(report.photoCount,0);assert.deepEqual(report.photos,{});assert.equal(report.firstFailure.sourceStatus,403);assert.match(report.firstFailure.reason,/HTTP 403/);assert.equal(report.firstFailure.stage,'search');
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('supports Commons thumbnail endpoints and normalizes official HTTP/relative source URLs to HTTPS',()=>{
 const p=structuredClone(page);p.imageinfo[0].thumburl='https://commons.wikimedia.org/w/thumb.php?f=Tokyo.jpg&w=250';p.imageinfo[0].descriptionurl='http://commons.wikimedia.org/wiki/File:Tokyo.jpg';
 const photo=selectPhoto(payload(p));assert.ok(photo);assert.equal(new URL(photo.imageUrl).hostname,'commons.wikimedia.org');assert.equal(new URL(photo.sourceUrl).protocol,'https:');
 assert.equal(wikimediaUrl('//upload.wikimedia.org/wikipedia/commons/a/a1/Tokyo.jpg').protocol,'https:');
 for(const value of ['https://evil.example/image.jpg','https://commons.wikimedia.org.evil.example/w/thumb.php','https://commons.wikimedia.org/w/api.php','https://user:password@upload.wikimedia.org/wikipedia/commons/a/a1/Tokyo.jpg','file:///tmp/photo.jpg'])assert.equal(wikimediaUrl(value),null,value);
});
test('follows a Commons thumbnail redirect to its image CDN and rejects redirects to other hosts',async()=>{
 const seen=[];const request=async url=>{seen.push(url);return seen.length===1?new Response(null,{status:302,headers:{Location:'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Tokyo.jpg/250px-Tokyo.jpg'}}):new Response(Buffer.alloc(64),{headers:{'Content-Type':'image/jpeg'}});};
 const result=await fetchThumbnail('https://commons.wikimedia.org/w/thumb.php?f=Tokyo.jpg&w=250',{request});assert.equal(result.status,200);assert.equal(seen.length,2);
 let calls=0;await assert.rejects(fetchThumbnail('https://commons.wikimedia.org/w/thumb.php?f=Tokyo.jpg&w=250',{request:async()=>{calls++;return new Response(null,{status:302,headers:{Location:'https://evil.example/image.jpg'}});}}),/outside/);assert.equal(calls,1);
});
test('build downloads a Commons-served thumbnail using a standard thumbnail width',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'atlas-commons-test-'));const p=structuredClone(page);p.imageinfo[0].thumburl='https://commons.wikimedia.org/w/thumb.php?f=Tokyo.jpg&w=250';let calls=0;
 try{
 const request=async value=>{calls++;const url=new URL(value);if(url.pathname==='/w/api.php'){assert.equal(url.searchParams.get('iiurlwidth'),'250');return new Response(JSON.stringify(payload(p)));}if(url.hostname==='commons.wikimedia.org')return new Response(null,{status:302,headers:{Location:'https://upload.wikimedia.org/wikipedia/commons/a/a1/Tokyo.jpg'}});return new Response(Buffer.alloc(64,0xff),{headers:{'Content-Type':'image/jpeg'}});};
 const report=await fetchCityPhotos({request,outputDir:pathToFileURL(dir+'/'),targets:[{code:'HND',city:'Tokyo'}],log:()=>{}});assert.equal(report.status,'complete');assert.equal(report.photoCount,1);assert.equal(calls,3);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('accepts the actual thumb.wikimedia.org URL reported by the deployed Tokyo search',()=>{
 const url='https://thumb.wikimedia.org/wikipedia/commons/thumb/9/98/Tokyo_skyline_seen_from_Tokyo_Skytree.jpg/250px-Tokyo_skyline_seen_from_Tokyo_Skytree.jpg';
 const p=structuredClone(page);p.imageinfo[0].thumburl=url;p.imageinfo[0].descriptionurl='https://commons.wikimedia.org/wiki/File:Tokyo_skyline_seen_from_Tokyo_Skytree.jpg';
 assert.equal(selectPhoto(payload(p)).imageUrl,url);
 assert.equal(wikimediaUrl('https://thumb.wikimedia.org.evil.example/wikipedia/commons/photo.jpg'),null);
 assert.equal(wikimediaUrl('https://thumb.wikimedia.org/w/api.php'),null);
});
test('downloads from the reported thumbnail CDN and retries the observed temporary busy search exactly once',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'atlas-thumb-cdn-'));const p=structuredClone(page);p.imageinfo[0].thumburl='https://thumb.wikimedia.org/wikipedia/commons/thumb/9/98/Tokyo_skyline_seen_from_Tokyo_Skytree.jpg/250px-Tokyo_skyline_seen_from_Tokyo_Skytree.jpg';let searches=0,images=0,pauses=0;
 try{
 const request=async value=>{const url=new URL(value);if(url.pathname==='/w/api.php'){searches++;return new Response(JSON.stringify(searches===1?{error:{code:'cirrussearch-too-busy-error',info:'Search is currently too busy.'}}:payload(p)));}assert.equal(url.hostname,'thumb.wikimedia.org');images++;return new Response(Buffer.alloc(64,0xff),{headers:{'Content-Type':'image/jpeg'}});};
 const report=await fetchCityPhotos({request,outputDir:pathToFileURL(dir+'/'),targets:[{code:'HND',city:'Tokyo'}],pause:async ms=>{assert.equal(ms,1000);pauses++;},log:()=>{}});
 assert.equal(report.pipelineRevision,4);assert.equal(report.status,'complete');assert.equal(report.photoCount,1);assert.equal(searches,2);assert.equal(images,1);assert.equal(pauses,1);
 }finally{await rm(dir,{recursive:true,force:true});}
});

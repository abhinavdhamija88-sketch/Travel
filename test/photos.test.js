import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {selectPhoto,fetchCityPhotos} from '../scripts/fetch-city-photos.mjs';
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

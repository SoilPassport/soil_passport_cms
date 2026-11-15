import { validateUpload, buildKey, safeFilename, isOwnKey } from '../functions/_shared/media-rules.ts';
import assert from 'node:assert';
const MB=1024*1024;
assert.equal(safeFilename('../../Évil File (1).JPG'),'vil-file-1.jpg');
assert.equal(safeFilename('C:\\x\\Report Q1.PDF'),'report-q1.pdf');
assert.ok(validateUpload('a.jpg','image/jpeg',5*MB).ok);
assert.ok(!validateUpload('a.jpg','image/jpeg',11*MB).ok);
assert.ok(!validateUpload('a.svg','image/svg+xml',100).ok);
assert.ok(!validateUpload('a.exe','application/x-msdownload',100).ok);
assert.ok(!validateUpload('a.png','image/jpeg',100).ok, 'ext/mime mismatch');
assert.ok(!validateUpload('a.jpg','image/jpeg',0).ok);
assert.ok(validateUpload('Clip.MP4','video/mp4',100*MB).ok);
assert.ok(!validateUpload('x.pdf','application/pdf',31*MB).ok);
const k=buildKey(new Date('2026-11-05T10:00:00Z'),'123e4567-e89b-12d3-a456-426614174000','My Photo.PNG');
assert.equal(k,'uploads/2026/11/123e4567-e89b-12d3-a456-426614174000-my-photo.png'); assert.ok(isOwnKey(k));
assert.ok(!isOwnKey('uploads/../../etc/passwd')); assert.ok(!isOwnKey('other/2026/11/x'));
console.log('rules OK');
// presign shape check with aws4fetch
const {AwsClient}=await import('aws4fetch').catch(()=>({}));
if(AwsClient){const r2=new AwsClient({accessKeyId:'AK',secretAccessKey:'SK',service:'s3',region:'auto'});
const s=await r2.sign(new Request(`https://acct.r2.cloudflarestorage.com/bkt/${k}?X-Amz-Expires=600`,{method:'PUT',headers:{'Content-Type':'image/png'}}),{aws:{signQuery:true}});
const u=new URL(s.url);console.log([...u.searchParams.keys()].join(','));assert.ok(u.searchParams.get('X-Amz-Signature'));console.log('presign shape OK');}
else console.log('aws4fetch unavailable - skipped');

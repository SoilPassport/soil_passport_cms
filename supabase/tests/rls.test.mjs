import {PGlite} from '@electric-sql/pglite';
import {citext} from '@electric-sql/pglite/contrib/citext';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import fs from 'fs';
const db=new PGlite({extensions:{citext,pgcrypto}});
await db.exec(`create schema auth; create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
create role anon; create role authenticated; create role service_role;`);
for (const f of ['0001_rbac_foundation','0002_content_modules','0003_seed_roles_permissions','0004_public_integration','0005_media_library','0006_forms_email_crm','0007_reminders_approvals_downloads_newsletter_analytics']) {
  try { await db.exec(fs.readFileSync(''+new URL('../migrations/',import.meta.url).pathname+''+f+'.sql','utf8')); console.log('OK',f);} catch(e){console.log('FAIL',f,e.message); process.exit(1)}
}
console.log('anon can execute record_download (expect false):', (await db.query("select has_function_privilege('anon','public.record_download(uuid,text,uuid,text)','execute') a, has_function_privilege('authenticated','public.approver_emails(text)','execute') b, has_function_privilege('authenticated','public.analytics_purge()','execute') c")).rows[0]);
await db.exec(`grant usage on schema public to anon, authenticated; grant select,insert,update,delete on all tables in schema public to anon, authenticated; grant execute on all functions in schema public to anon, authenticated;`);
// behaviour tests
const u=(n)=>`00000000-0000-0000-0000-00000000000${n}`;
await db.exec(`insert into auth.users values ('${u(1)}','sa@x.test','{}'),('${u(2)}','contrib@x.test','{}'),('${u(3)}','ir@x.test','{}');
update public.profiles set status='active';
insert into user_roles select '${u(1)}', id,null,now() from roles where key='super_admin';
insert into user_roles select '${u(2)}', id,null,now() from roles where key='contributor';
insert into user_roles select '${u(3)}', id,null,now() from roles where key='investor_relations';
insert into enquiries(kind,name,email,consent) values ('investment','A','a@x.test',true),('contact','B','b@x.test',true);`);
async function as(uid,aal,sql){ await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${uid}',false), set_config('request.jwt.claims','{"aal":"${aal}"}',false);`); try{ const r=await db.query(sql); return r.rows;}catch(e){return 'ERR: '+e.message}finally{await db.exec('reset role')} }
console.log('SA aal1 sees enquiries (MFA required -> expect 0):', (await as(u(1),'aal1','select count(*)::int c from enquiries'))[0].c);
console.log('SA aal2 sees enquiries (expect 2):', (await as(u(1),'aal2','select count(*)::int c from enquiries'))[0].c);
console.log('IR aal2 sees (expect 1 investment):', JSON.stringify(await as(u(3),'aal2','select kind from enquiries')));
console.log('IR aal1 (expect 0):', (await as(u(3),'aal1','select count(*)::int c from enquiries'))[0].c);
console.log('Contributor create draft article:', JSON.stringify(await as(u(2),'aal1',"insert into articles(slug,title,status) values ('t','T','draft') returning status")));
console.log('Contributor publish (expect ERR):', JSON.stringify(await as(u(2),'aal1',"insert into articles(slug,title,status) values ('t2','T','published') returning status")));
console.log('Contributor read enquiries (expect 0):', (await as(u(2),'aal1','select count(*)::int c from enquiries'))[0].c);
console.log('Audit immutable:', JSON.stringify(await as(u(1),'aal2',"update audit_logs set action='x'")));
await db.exec("select set_config('request.jwt.claim.sub','"+u(1)+"',false)");
console.log('Last super admin delete (expect ERR):', await db.query(`delete from user_roles where role_id=(select id from roles where key='super_admin')`).then(()=> 'NO ERROR (bad)').catch(e=>'ERR '+e.message));
await db.exec(`select set_config('request.jwt.claim.sub','',false), set_config('request.jwt.claims','',false); set role anon;`);
console.log('ANON draft article rows (expect 0):',(await db.query('select count(*)::int c from articles')).rows[0].c);
console.log('ANON enquiries (expect 0):',(await db.query('select count(*)::int c from enquiries')).rows[0].c);
console.log('ANON profiles (expect 0):',(await db.query('select count(*)::int c from profiles')).rows[0].c);
await db.exec('reset role');
await db.exec("select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false)");
await db.exec("select write_audit('test.action')");
console.log('audit update:', await db.query("update audit_logs set action='x'").then(()=>'NO ERROR (bad)').catch(e=>'ERR '+e.message));
console.log('has_permission for another user (expect false):', (await as(u(2),'aal1',`select public.has_permission('articles.edit','${u(1)}') as v`))[0].v);
console.log('anon write_audit (expect ERR):', await (async()=>{await db.exec("select set_config('request.jwt.claim.sub','',false); set role anon;");try{await db.query("select write_audit('spam')");return 'NO ERROR (bad)'}catch(e){return 'ERR '+e.message}finally{await db.exec('reset role')}})());

// ---- 0004: public visibility ----
await db.exec(`reset role; select set_config('request.jwt.claim.sub','',false), set_config('request.jwt.claims','',false);
insert into articles(slug,title,status,published_at) values ('pub','Pub','published', now() - interval '1 hour');
insert into articles(slug,title,status,publish_at) values ('due','Due','scheduled', now() - interval '1 minute');
insert into articles(slug,title,status,publish_at) values ('future','Future','scheduled', now() + interval '1 day');
insert into articles(slug,title,status) values ('draft1','Draft','draft');`);
await db.exec('set role anon');
const vis=(await db.query('select slug from articles order by slug')).rows.map(r=>r.slug);
await db.exec('reset role');
console.log('ANON sees articles (expect due,pub):', JSON.stringify(vis));
await db.exec(`insert into system_settings(key,category,value,is_public) values ('announcement','website','{"text":"hi"}',true),('secret_setting','general','{}',false);`);
await db.exec('set role anon');
console.log('ANON sees settings (expect announcement):', JSON.stringify((await db.query('select key from system_settings')).rows.map(r=>r.key)));
await db.exec('reset role');

// ---- 0005: media library ----
await db.exec(`reset role; select set_config('request.jwt.claim.sub','',false), set_config('request.jwt.claims','',false);
insert into media_assets(id,kind,filename,mime_type,size_bytes,storage_bucket,storage_key,visibility,public_url) values
 ('00000000-0000-0000-0000-0000000000a1','pdf','a.pdf','application/pdf',10,'b','uploads/2026/11/a','public','https://m.test/a.pdf'),
 ('00000000-0000-0000-0000-0000000000a2','pdf','b.pdf','application/pdf',10,'b','uploads/2026/11/b','public','https://m.test/b.pdf');
insert into videos(title,source,external_url,status) values ('PubVid','youtube','https://youtu.be/x','published'),('DraftVid','youtube','https://youtu.be/y','draft');
insert into documents(id,title,category,access_level,status) values ('00000000-0000-0000-0000-0000000000d1','PubDoc','corporate','public','published'),('00000000-0000-0000-0000-0000000000d2','DraftDoc','corporate','public','draft');
insert into document_versions(document_id,version_label,asset_id) values ('00000000-0000-0000-0000-0000000000d1','v1','00000000-0000-0000-0000-0000000000a1'),('00000000-0000-0000-0000-0000000000d2','v1','00000000-0000-0000-0000-0000000000a2');`);
await db.exec('set role anon');
console.log('ANON videos (expect PubVid):', JSON.stringify((await db.query('select title from videos')).rows.map(r=>r.title)));
console.log('ANON document versions (expect 1):', (await db.query('select count(*)::int c from document_versions')).rows[0].c);
await db.exec('reset role');
console.log('restricted doc may be saved published since 0007 (expect NO ERROR; anon still cannot see it):', await db.query(`insert into documents(title,category,access_level,status) values ('Inv','investor_presentation','investor_only','published')`).then(()=>'saved ok (intended)').catch(e=>'ERR '+e.message));
console.log('contributor publish video (expect ERR):', await as(u(2),'aal1',`insert into videos(title,source,external_url,status) values ('x','youtube','https://youtu.be/z','published')`));
console.log('contributor draft video (expect row ok):', await as(u(2),'aal1',`insert into videos(title,source,external_url,status) values ('x','youtube','https://youtu.be/z','draft') returning title`));

// ---- 0006: forms, email log, roadmap guard ----
await db.exec("reset role; select set_config('request.jwt.claim.sub','',false), set_config('request.jwt.claims','',false); insert into form_rate_limits(ip_hash,kind) values ('h','contact'); insert into enquiries(kind,name,email,consent) values ('contact','T','t@x.test',true);");
const hidden = async (sql) => { try { await db.exec('set role anon'); const r = await db.query(sql); await db.exec('reset role'); return r.rows[0].c; } catch (e) { await db.exec('reset role'); return 'ERR (also fine)'; } };
console.log('anon sees enquiries (expect 0 or ERR):', await hidden('select count(*)::int c from enquiries'));
console.log('anon sees rate limits (expect 0 or ERR):', await hidden('select count(*)::int c from form_rate_limits'));
console.log('staff sees rate limits (expect 0 or ERR):', JSON.stringify(await as(u(1),'aal2','select count(*)::int c from form_rate_limits')));
console.log('templates seeded (expect 6):', (await db.query('select count(*)::int c from email_templates')).rows[0].c);
console.log('contributor approve roadmap (expect ERR):', await as(u(2),'aal1',"insert into roadmap_items(title,approved,is_public) values ('x',true,true)"));
await db.exec("reset role; select set_config('request.jwt.claim.sub','',false), set_config('request.jwt.claims','',false); insert into roadmap_items(title,approved,is_public) values ('Shown',true,true),('Hidden',false,true),('Private',true,false); set role anon");
console.log('anon roadmap (expect ["Shown"]):', JSON.stringify((await db.query('select title from roadmap_items')).rows.map(r=>r.title)));
await db.exec('reset role');
console.log('event_availability callable by anon:', await db.exec('set role anon').then(()=>db.query("select * from event_availability('none')")).then(r=>'ok rows='+r.rows.length).catch(e=>'ERR '+e.message));
await db.exec('reset role');
// ---- 0007: approvals queue, private docs, downloads, campaigns, analytics ----
const svc = async (sql) => { await db.exec("reset role; select set_config('request.jwt.claim.sub','',false), set_config('request.jwt.claims','',false);"); return db.query(sql); };
console.log('templates seeded (expect 9):', (await svc('select count(*)::int c from email_templates')).rows[0].c);
await svc("insert into articles(slug,title,status,created_by) values ('q1','Queue test','draft','"+u(2)+"')");
await svc("update articles set status='pending_review' where slug='q1'");
await svc("update articles set status='approved' where slug='q1'");
console.log('queue (expect review_requested,review_result):', JSON.stringify((await svc("select kind from notification_queue order by id")).rows.map(r=>r.kind)));
console.log('queue owner is author (expect true):', (await svc("select bool_and(owner_id='"+u(2)+"') b from notification_queue")).rows[0].b);
console.log('approver_emails articles (expect sa only):', JSON.stringify((await svc("select approver_emails('articles') e")).rows[0].e));
await svc("insert into media_assets(kind,filename,mime_type,size_bytes,storage_bucket,storage_key,visibility,public_url) values ('pdf','pub.pdf','application/pdf',10,'b','k1','public','https://x/k1'),('pdf','priv.pdf','application/pdf',10,'pb','k2','private',null)");
await svc("insert into documents(id,slug,title,category,access_level,status) values ('11111111-1111-1111-1111-111111111111','d-pub','Pub','corporate','public','draft'),('22222222-2222-2222-2222-222222222222','d-priv','Priv','investor_presentation','investor_only','draft')");
await svc("insert into document_versions(id,document_id,version_label,asset_id) select '33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111','v1',id from media_assets where storage_key='k1'");
await svc("insert into document_versions(id,document_id,version_label,asset_id) select '44444444-4444-4444-4444-444444444444','22222222-2222-2222-2222-222222222222','v1',id from media_assets where storage_key='k2'");
console.log('restricted doc with PUBLIC file rejected earlier by version trigger (expect ERR):', await svc("insert into document_versions(document_id,version_label,asset_id) select '22222222-2222-2222-2222-222222222222','v2',id from media_assets where storage_key='k1'").then(()=>'NO ERROR (bad)').catch(e=>'ERR '+e.message));
await svc("update documents set current_version_id='33333333-3333-3333-3333-333333333333', status='published' where slug='d-pub'");
await svc("update documents set current_version_id='44444444-4444-4444-4444-444444444444', status='published' where slug='d-priv'");
console.log('restricted doc can be published (expect published):', (await svc("select status from documents where slug='d-priv'")).rows[0].status);
console.log('make public doc private-file (expect ERR):', await svc("update documents set current_version_id='44444444-4444-4444-4444-444444444444' where slug='d-pub'").then(()=>'NO ERROR (bad)').catch(e=>'ERR '+e.message));
console.log('flip restricted to public with private file (expect ERR):', await svc("update documents set access_level='public' where slug='d-priv'").then(()=>'NO ERROR (bad)').catch(e=>'ERR '+e.message));
await db.exec('set role anon');
console.log('anon sees documents (expect d-pub, not d-priv):', JSON.stringify((await db.query('select slug from documents')).rows.map(r=>r.slug)));
console.log('anon sees versions (expect 1):', (await db.query('select count(*)::int c from document_versions')).rows[0].c);
console.log('anon sees grants (expect 0 or ERR):', await hidden('select count(*)::int c from document_access_grants'));
await db.exec('reset role');
await svc("insert into document_access_grants(id,document_id,email,token_hash,expires_at) values ('55555555-5555-5555-5555-555555555555','22222222-2222-2222-2222-222222222222','i@x.test','hash',now()+interval '1 day')");
await svc("select record_download('22222222-2222-2222-2222-222222222222','h','55555555-5555-5555-5555-555555555555','i@x.test')");
await svc("select record_download('22222222-2222-2222-2222-222222222222','h','55555555-5555-5555-5555-555555555555','i@x.test')");
console.log('download counts (expect 2,2):', JSON.stringify((await svc("select d.download_count a, g.downloads b from documents d, document_access_grants g where d.slug='d-priv'")).rows[0]));
console.log('IR reads grants (no documents.grant -> expect 0):', JSON.stringify(await as(u(3),'aal2','select count(*)::int c from document_access_grants')));
console.log('super admin reads grants (expect 1):', JSON.stringify(await as(u(1),'aal2','select count(*)::int c from document_access_grants')));
console.log('contributor create campaign (expect ERR/0 rows):', JSON.stringify(await as(u(2),'aal1',"insert into newsletter_campaigns(subject) values ('x') returning id")));
console.log('SA create draft campaign:', JSON.stringify(await as(u(1),'aal2',"insert into newsletter_campaigns(id,subject,body_html) values ('66666666-6666-6666-6666-666666666666','Hello','<p>Hi</p>') returning status")));
console.log('SA set status sending directly (expect ERR):', JSON.stringify(await as(u(1),'aal2',"update newsletter_campaigns set status='sending' where subject='Hello' returning status")));
console.log('SA edit draft ok:', JSON.stringify(await as(u(1),'aal2',"update newsletter_campaigns set subject='Hello 2' where subject='Hello' returning subject")));
console.log('service starts sending (expect sending):', (await svc("update newsletter_campaigns set status='sending' where subject='Hello 2' returning status")).rows[0].status);
console.log('SA edit sent/sending campaign (expect ERR):', JSON.stringify(await as(u(1),'aal2',"update newsletter_campaigns set subject='Changed' where subject='Hello 2' returning subject")));
await svc("insert into analytics_pageviews(path,visitor_hash,device,referrer_host) values ('/index.html','a','desktop','google.com'),('/index.html','b','mobile',null),('/contact.html','a','desktop',null)");
console.log('anon reads pageviews (expect 0 or ERR):', await hidden('select count(*)::int c from analytics_pageviews'));
console.log('contributor analytics_summary (expect ERR):', JSON.stringify(await as(u(2),'aal1',"select analytics_summary(current_date-7,current_date) s")));
const sm = await as(u(1),'aal2',"select analytics_summary(current_date-7,current_date) s");
console.log('SA analytics (expect views 3, visitors 2, top /index.html):', sm[0]?.s?.views, sm[0]?.s?.visitors, sm[0]?.s?.pages?.[0]?.path);
await db.exec('reset role');

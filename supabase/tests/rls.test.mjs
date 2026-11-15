import {PGlite} from '@electric-sql/pglite';
import {citext} from '@electric-sql/pglite/contrib/citext';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import fs from 'fs';
const db=new PGlite({extensions:{citext,pgcrypto}});
await db.exec(`create schema auth; create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
create role anon; create role authenticated;`);
for (const f of ['0001_rbac_foundation','0002_content_modules','0003_seed_roles_permissions','0004_public_integration']) {
  try { await db.exec(fs.readFileSync(''+new URL('../migrations/',import.meta.url).pathname+''+f+'.sql','utf8')); console.log('OK',f);} catch(e){console.log('FAIL',f,e.message); process.exit(1)}
}
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

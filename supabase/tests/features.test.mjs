// Run: node --experimental-strip-types supabase/tests/features.test.mjs
import assert from 'node:assert/strict';
import { sanitizeEmailHtml, safeHttp } from '../functions/_shared/sanitize.ts';
import { cleanPath, hostOf, isBot, deviceOf, cleanSource } from '../functions/_shared/analytics.ts';
import { buildNewsletter } from '../functions/_shared/newsletter.ts';
import { headlineFor } from '../functions/_shared/jobs.ts';
import { dealProps, dealsEnabled, dealKinds } from '../functions/_shared/hubspot.ts';
import { safeEqual, sha256Hex, hmacHex, randomToken } from '../functions/_shared/crypto.ts';

// sanitiser
const bad = '<p onclick="x()">Hi <script>alert(1)</script><a href="javascript:alert(1)">x</a> <a href="https://ok.test/a?b=1&c=2" onmouseover="y">ok</a><img src="http://insecure/x.png"><img src="https://ok.test/i.png" alt="a&quot;b" onerror="z"><iframe src="https://evil"></iframe><style>p{}</style></p><div>d</div><svg onload=1></svg>';
const out = sanitizeEmailHtml(bad);
for (const x of ['<script', 'javascript:', 'onclick', 'onmouseover', 'onerror', 'iframe', '<style', '<svg', 'http://insecure', '<div']) assert.ok(!out.includes(x), 'leaked ' + x + ' in ' + out);
assert.ok(out.includes('href="https://ok.test/a?b=1&amp;c=2"') && out.includes('rel="noopener noreferrer"'), out);
assert.ok(out.includes('<img src="https://ok.test/i.png"'), out);
assert.equal(safeHttp('http://x.test'), null); assert.equal(safeHttp('https://x.test'), 'https://x.test'); assert.equal(safeHttp('mailto:a@b.test', true), 'mailto:a@b.test'); assert.equal(safeHttp('mailto:a@b.test'), null);
assert.equal(sanitizeEmailHtml('<p>Hello <strong>world</strong></p>'), '<p>Hello <strong>world</strong></p>');

// analytics helpers
assert.equal(cleanPath('/index.html'), '/index.html'); assert.equal(cleanPath('/article.html?slug=my-post&x=1'), '/article.html?slug=my-post');
assert.equal(cleanPath('/a?email=a@b.com'), '/a'); assert.equal(cleanPath('index.html'), null); assert.equal(cleanPath('/../etc'), null); assert.equal(cleanPath('/<script>'), null); assert.equal(cleanPath('/' + 'a'.repeat(300)), null);
assert.equal(hostOf('https://www.google.com/search?q=x', ['soilpassport.com']), 'google.com'); assert.equal(hostOf('https://soilpassport.com/about.html', ['soilpassport.com', 'www.soilpassport.com']), null); assert.equal(hostOf('not a url', []), null);
assert.ok(isBot('Googlebot/2.1') && isBot('') && !isBot('Mozilla/5.0 (Windows NT 10.0) Chrome/120'));
assert.equal(deviceOf('Mozilla/5.0 (iPhone; CPU iPhone OS 17) Mobile'), 'mobile'); assert.equal(deviceOf('Mozilla/5.0 (iPad)'), 'tablet'); assert.equal(deviceOf('Mozilla/5.0 (Windows)'), 'desktop');
assert.equal(cleanSource('LinkedIn'), 'linkedin'); assert.equal(cleanSource('<x>'), null);

// newsletter
const m = buildNewsletter({ subject: 'S', preheader: '<b>pre</b>', bodyHtml: '<p>Hi <a href="https://x.test">link</a></p><script>x</script>', unsubscribeUrl: 'https://u.test/?a=1&b=2', postalName: 'Soil Passport' });
assert.ok(m.html.includes('Unsubscribe') && !m.html.includes('<script') && m.html.includes('&lt;b&gt;pre') && m.html.includes('https://u.test/?a=1&amp;b=2'), m.html);
assert.ok(m.text.includes('link (https://x.test)') && m.text.includes('Unsubscribe:'), m.text);

// approvals wording
assert.equal(headlineFor('review_requested', 'pending_review'), 'Review requested'); assert.equal(headlineFor('review_result', 'published'), 'Published'); assert.equal(headlineFor('review_result', 'draft'), 'Returned to draft for changes');

// hubspot deals
const env = (o) => (k) => o[k] ?? '';
assert.equal(dealsEnabled(env({})), false); assert.equal(dealsEnabled(env({ HUBSPOT_DEAL_PIPELINE: 'p' })), false); assert.equal(dealsEnabled(env({ HUBSPOT_DEAL_PIPELINE: 'p', HUBSPOT_DEAL_STAGE: 's' })), true);
assert.deepEqual(dealKinds(env({})), ['investment']); assert.deepEqual(dealKinds(env({ HUBSPOT_DEAL_KINDS: 'investment, partnership' })), ['investment', 'partnership']);
const dp = dealProps({ kind: 'investment', name: 'Ann', organisation: 'Fund', description: 'x', pipeline: 'p', stage: 's' });
assert.equal(dp.dealname, 'Investment enquiry - Ann (Fund)'); assert.equal(dp.pipeline, 'p'); assert.equal(dp.dealstage, 's');

// crypto
assert.ok(safeEqual('abc', 'abc') && !safeEqual('abc', 'abd') && !safeEqual('abc', 'ab'));
assert.equal((await sha256Hex('a')).length, 64); assert.equal(await hmacHex('k', 'm'), await hmacHex('k', 'm')); assert.notEqual(await hmacHex('k', 'm'), await hmacHex('k2', 'm'));
const t = randomToken(); assert.ok(/^[A-Za-z0-9_-]{40,50}$/.test(t), t); assert.notEqual(t, randomToken());
console.log('features tests OK');

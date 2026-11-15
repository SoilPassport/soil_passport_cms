import assert from 'node:assert';
import { validate } from '../functions/_shared/forms.ts';
import { render, esc, stripTags, cleanSubject } from '../functions/_shared/email.ts';
import { contactProps, nextAttempt } from '../functions/_shared/hubspot.ts';
const base = { name: 'Ada Lovelace', email: 'Ada@Example.com', consent: true, message: 'Hello there' };
// contact
let r = validate('contact', base); assert.ok(r.ok); assert.equal(r.value.email, 'ada@example.com'); assert.equal(r.value.contact_category, 'general');
assert.ok(!validate('contact', { ...base, consent: false }).ok, 'consent required');
assert.ok(!validate('contact', { ...base, consent: 'true' }).ok, 'consent must be boolean true');
assert.ok(!validate('contact', { ...base, email: 'nope' }).ok);
assert.ok(!validate('contact', { ...base, email: 'a@b.c' }).ok);
assert.ok(!validate('contact', { ...base, email: 'a b@x.com' }).ok);
assert.ok(!validate('contact', { ...base, name: 'A' }).ok);
assert.ok(!validate('contact', { ...base, message: '' }).ok);
assert.ok(!validate('contact', { ...base, message: 'x'.repeat(5001) }).ok);
assert.ok(!validate('contact', { ...base, message: 'bad\u0000char' }).ok, 'control chars');
assert.ok(!validate('contact', { ...base, name: { $ne: 1 } }).ok, 'non-string rejected');
assert.ok(!validate('contact', { ...base, telephone: 'abc' }).ok);
assert.ok(validate('contact', { ...base, telephone: '+44 20 7946 0000' }).ok);
assert.ok(!validate('contact', { ...base, contact_category: 'hack' }).ok);
assert.equal(validate('demo', base).value.contact_category, 'book_demo');
assert.ok(!validate('bogus', base).ok);
// partnership
assert.ok(!validate('partnership', { ...base, partnership_category: 'technology' }).ok, 'organisation required');
assert.ok(!validate('partnership', { ...base, organisation: 'Org', partnership_category: 'x' }).ok);
assert.ok(validate('partnership', { ...base, organisation: 'Org', partnership_category: 'biochar', website: 'https://example.com' }).ok);
assert.ok(!validate('partnership', { ...base, organisation: 'Org', partnership_category: 'biochar', website: 'javascript:alert(1)' }).ok);
// investment
assert.ok(!validate('investment', { ...base, organisation: 'Fund', investor_type: 'whale' }).ok);
assert.ok(validate('investment', { ...base, organisation: 'Fund', investor_type: 'angel' }).ok);
// event registration & newsletter
assert.ok(validate('event_registration', { name: 'Bob', email: 'b@x.com', consent: true, event_slug: 'my-event' }).ok);
assert.ok(!validate('event_registration', { name: 'Bob', email: 'b@x.com', consent: true, event_slug: '../x' }).ok);
assert.ok(validate('newsletter', { email: 'n@x.com', consent: true }).ok);
assert.ok(!validate('newsletter', { email: 'n@x.com' }).ok);
// email templating
assert.equal(render('Hi {{name}}', { name: '<b>x</b>' }, true), 'Hi &lt;b&gt;x&lt;/b&gt;');
assert.equal(render('Hi {{name}}', { name: '<b>x</b>' }, false), 'Hi <b>x</b>');
assert.equal(render('{{message}}', { message: 'a\nb' }, true), 'a<br>b');
assert.equal(render('{{missing}}', {}, true), '');
assert.equal(cleanSubject('a\r\nBcc: evil@x.com'), 'a Bcc: evil@x.com');
assert.equal(stripTags('<p>Hello</p><p>You</p>'), 'Hello\nYou');
// hubspot
assert.deepEqual(contactProps({ email: 'a@b.com', name: 'Ada King Lovelace', organisation: 'X', country: 'UK' }), { email: 'a@b.com', firstname: 'Ada', lastname: 'King Lovelace', company: 'X', country: 'UK' });
assert.ok(new Date(nextAttempt(1, 0)).getTime() === 2 * 60_000 && new Date(nextAttempt(10, 0)).getTime() === 6 * 3600_000);
console.log('forms/email/hubspot tests OK');
// voucher codes in event registration
{ const { validate } = await import('../functions/_shared/forms.ts');
  const base = { kind: 'event_registration', name: 'Ann Lee', email: 'a@b.test', consent: true, event_slug: 'my-event' };
  const r1 = validate('event_registration', { ...base, voucher_code: ' early-20 ' }); assert.equal(r1.ok, true, JSON.stringify(r1)); assert.equal(r1.value.voucher_code, 'EARLY-20');
  assert.equal(validate('event_registration', { ...base, voucher_code: '' }).value.voucher_code, undefined);
  assert.equal(validate('event_registration', { ...base }).value.voucher_code, undefined);
  assert.equal(validate('event_registration', { ...base, voucher_code: 'ab' }).ok, false);
  assert.equal(validate('event_registration', { ...base, voucher_code: "x'; drop table" }).ok, false);
  assert.equal(validate('event_registration', { ...base, voucher_code: 'A'.repeat(33) }).ok, false);
  console.log('voucher validation OK'); }

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  breadcrumbJsonLd,
  escapeHtml,
  faqPageJsonLd,
  localBusinessJsonLd,
  serviceJsonLd,
  validateJsonLd,
} from '../src/schema.js';
import { makeConfig } from './fixtures.js';

function schemaInput() {
  const cfg = makeConfig();
  const service = cfg.services[0]!;
  const city = cfg.cities[0]!;
  return { site: cfg.site, service, city, url: `${cfg.site.baseUrl}/${service.slug}/${city.slug}` };
}

test('localBusinessJsonLd emits a valid LocalBusiness with address and geo', () => {
  const input = schemaInput();
  const doc = localBusinessJsonLd(input);
  assert.equal(doc['@type'], 'LocalBusiness');
  const address = doc.address as Record<string, unknown>;
  assert.equal(address.addressLocality, 'Springfield');
  assert.equal(address.addressRegion, 'IL');
  const geo = doc.geo as Record<string, unknown>;
  assert.equal(geo.latitude, 39.7817);
  assert.deepEqual(validateJsonLd(doc), { valid: true, errors: [] });
});

test('localBusinessJsonLd omits geo when the city has no coordinates', () => {
  const input = schemaInput();
  const cfg = makeConfig();
  const fairview = cfg.cities.find((c) => c.slug === 'fairview')!;
  const doc = localBusinessJsonLd({ ...input, city: fairview });
  assert.equal(doc.geo, undefined);
  assert.equal(validateJsonLd(doc).valid, true);
});

test('localBusinessJsonLd never emits fabricated aggregateRating', () => {
  const doc = localBusinessJsonLd(schemaInput());
  assert.equal(doc.aggregateRating, undefined);
});

test('serviceJsonLd carries price band and provider', () => {
  const doc = serviceJsonLd(schemaInput());
  assert.equal(doc['@type'], 'Service');
  assert.equal(doc.serviceType, 'Window Cleaning');
  const offers = doc.offers as Record<string, unknown>;
  assert.equal(offers.lowPrice, 150);
  assert.equal(offers.highPrice, 600);
  assert.equal(validateJsonLd(doc).valid, true);
});

test('faqPageJsonLd maps Q&As into mainEntity', () => {
  const doc = faqPageJsonLd([
    { question: 'How much?', answer: 'Between $150 and $600.' },
    { question: 'How fast?', answer: 'Same business day.' },
  ]);
  const main = doc.mainEntity as Record<string, unknown>[];
  assert.equal(main.length, 2);
  assert.equal(main[0]!['@type'], 'Question');
  assert.equal(validateJsonLd(doc).valid, true);
});

test('breadcrumbJsonLd builds a three-level trail', () => {
  const doc = breadcrumbJsonLd(schemaInput());
  const items = doc.itemListElement as Record<string, unknown>[];
  assert.equal(items.length, 3);
  assert.deepEqual(items.map((i) => i.position), [1, 2, 3]);
  assert.equal(validateJsonLd(doc).valid, true);
});

test('validateJsonLd rejects a document missing @context', () => {
  const result = validateJsonLd({ '@type': 'LocalBusiness', name: 'X', url: 'https://example.com' });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('@context')));
});

test('validateJsonLd rejects a FAQPage with an empty mainEntity', () => {
  const result = validateJsonLd({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [] });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('mainEntity')));
});

test('validateJsonLd flags aggregateRating on LocalBusiness as a policy violation', () => {
  const doc = localBusinessJsonLd(schemaInput());
  (doc as Record<string, unknown>).aggregateRating = { '@type': 'AggregateRating', ratingValue: 4.9 };
  const result = validateJsonLd(doc);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('aggregateRating')));
});

test('escapeHtml neutralizes markup-significant characters', () => {
  assert.equal(escapeHtml(`<a href="x">&'</a>`), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
});

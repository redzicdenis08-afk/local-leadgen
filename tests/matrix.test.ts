import assert from 'node:assert/strict';
import { test } from 'node:test';

import { validateConfig } from '../src/config.js';
import { buildMatrix, fnv1a, interpolate, TEMPLATE_BANK_SIZES } from '../src/matrix.js';
import { makeConfig, makeRawConfig } from './fixtures.js';

test('buildMatrix expands the full service x city matrix', () => {
  const cfg = makeConfig();
  const pages = buildMatrix(cfg);
  assert.equal(pages.length, cfg.services.length * cfg.cities.length);
});

test('page entries have correct paths and canonical URLs', () => {
  const pages = buildMatrix(makeConfig());
  const page = pages.find((p) => p.serviceSlug === 'gutter-cleaning' && p.citySlug === 'fairview');
  assert.ok(page);
  assert.equal(page.path, '/gutter-cleaning/fairview');
  assert.equal(page.canonicalUrl, 'https://example.com/gutter-cleaning/fairview');
});

test('matrix generation is deterministic', () => {
  const a = buildMatrix(makeConfig());
  const b = buildMatrix(makeConfig());
  assert.deepEqual(a, b);
});

test('every title, meta description, and H1 is unique across the matrix', () => {
  const pages = buildMatrix(makeConfig());
  for (const field of ['title', 'metaDescription', 'h1'] as const) {
    const values = pages.map((p) => p[field]);
    assert.equal(new Set(values).size, values.length, `duplicate ${field} found`);
  }
});

test('duplication avoidance: multiple templates are actually used across a larger matrix', () => {
  // Build a bigger synthetic matrix (2 services x 12 cities = 24 pages) so
  // template rotation has room to show up.
  const raw = makeRawConfig();
  const cities = [];
  for (let i = 0; i < 12; i++) {
    cities.push({ name: `Testburg ${String.fromCharCode(65 + i)}`, state: 'KS', population: 10000 + i });
  }
  raw.cities = cities;
  const pages = buildMatrix(validateConfig(raw));
  assert.equal(pages.length, 24);

  const titleIds = new Set(pages.map((p) => p.templateIds.title));
  const metaIds = new Set(pages.map((p) => p.templateIds.meta));
  const h1Ids = new Set(pages.map((p) => p.templateIds.h1));
  assert.ok(titleIds.size > 1, 'all pages used the same title template');
  assert.ok(metaIds.size > 1, 'all pages used the same meta template');
  assert.ok(h1Ids.size > 1, 'all pages used the same h1 template');
});

test('duplication avoidance: same city gets different copy across services beyond the service name', () => {
  const pages = buildMatrix(makeConfig());
  const springfield = pages.filter((p) => p.citySlug === 'springfield');
  assert.equal(springfield.length, 2);
  const [a, b] = springfield;
  // Strip the service names out; the remaining copy should still differ
  // (template rotation), not be a pure find-and-replace of the service.
  const normalize = (s: string) =>
    s.toLowerCase().replace(/window cleaning|gutter cleaning/g, '{svc}');
  assert.notEqual(normalize(a!.metaDescription), normalize(b!.metaDescription));
});

test('titles and metas contain the city and service (or a keyword for it)', () => {
  const pages = buildMatrix(makeConfig());
  const cfg = makeConfig();
  for (const page of pages) {
    const service = cfg.services.find((s) => s.slug === page.serviceSlug)!;
    const city = cfg.cities.find((c) => c.slug === page.citySlug)!;
    assert.ok(page.title.includes(city.name), `title missing city: ${page.title}`);
    const t = page.title.toLowerCase();
    const mentionsService =
      t.includes(service.name.toLowerCase()) || service.keywords.some((k) => t.includes(k.toLowerCase()));
    assert.ok(mentionsService, `title missing service/keyword: ${page.title}`);
  }
});

test('no unreplaced {placeholder} tokens leak into output', () => {
  const pages = buildMatrix(makeConfig());
  for (const page of pages) {
    for (const value of [page.title, page.metaDescription, page.h1]) {
      assert.ok(!/\{\w+\}/.test(value), `unreplaced placeholder in "${value}"`);
    }
  }
});

test('interpolate throws on unknown placeholders instead of leaking them', () => {
  assert.throws(() => interpolate('Hello {nope}', { city: 'X' }), /Unknown template placeholder/);
});

test('fnv1a is deterministic and spreads across template banks', () => {
  assert.equal(fnv1a('a|b'), fnv1a('a|b'));
  assert.notEqual(fnv1a('title:a|b'), fnv1a('meta:a|b'));
  assert.ok(TEMPLATE_BANK_SIZES.title >= 4);
  assert.ok(TEMPLATE_BANK_SIZES.meta >= 4);
  assert.ok(TEMPLATE_BANK_SIZES.h1 >= 3);
});

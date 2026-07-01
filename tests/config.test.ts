import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ConfigError, parseConfig, slugify, validateConfig } from '../src/config.js';
import { makeRawConfig } from './fixtures.js';

test('validateConfig accepts a well-formed config and fills in slugs', () => {
  const cfg = validateConfig(makeRawConfig());
  assert.equal(cfg.services.length, 2);
  assert.equal(cfg.cities.length, 3);
  assert.equal(cfg.services[0]?.slug, 'window-cleaning');
  assert.equal(cfg.cities[0]?.slug, 'springfield');
  assert.equal(cfg.site.baseUrl, 'https://example.com');
});

test('validateConfig rejects a missing services array', () => {
  const raw = makeRawConfig();
  delete raw.services;
  assert.throws(() => validateConfig(raw), ConfigError);
});

test('validateConfig reports every issue, not just the first', () => {
  const raw = makeRawConfig();
  delete raw.site;
  (raw.services as Record<string, unknown>[])[0]!.priceLow = -5;
  try {
    validateConfig(raw);
    assert.fail('expected ConfigError');
  } catch (err) {
    assert.ok(err instanceof ConfigError);
    assert.ok(err.issues.length >= 2, `expected >= 2 issues, got: ${err.issues.join('; ')}`);
  }
});

test('validateConfig rejects priceLow greater than priceHigh', () => {
  const raw = makeRawConfig();
  const svc = (raw.services as Record<string, unknown>[])[0]!;
  svc.priceLow = 900;
  svc.priceHigh = 100;
  assert.throws(() => validateConfig(raw), /priceLow/);
});

test('validateConfig rejects duplicate slugs (URL collisions)', () => {
  const raw = makeRawConfig();
  const cities = raw.cities as Record<string, unknown>[];
  cities.push({ ...cities[0], name: 'Springfield!!' }); // slugifies to the same slug
  assert.throws(() => validateConfig(raw), /duplicate city slug "springfield"/);
});

test('validateConfig rejects a baseUrl with a trailing path', () => {
  const raw = makeRawConfig();
  (raw.site as Record<string, unknown>).baseUrl = 'https://example.com/site';
  assert.throws(() => validateConfig(raw), /baseUrl/);
});

test('parseConfig rejects malformed JSON with a ConfigError', () => {
  assert.throws(() => parseConfig('{ not json'), ConfigError);
});

test('slugify produces URL-safe lowercase slugs', () => {
  assert.equal(slugify('Window Cleaning'), 'window-cleaning');
  assert.equal(slugify("Coeur d'Alene"), 'coeur-d-alene');
  assert.equal(slugify('  Pressure   Washing!  '), 'pressure-washing');
  assert.equal(slugify('San José'), 'san-jose');
  assert.equal(slugify('Deck & Fence'), 'deck-and-fence');
});

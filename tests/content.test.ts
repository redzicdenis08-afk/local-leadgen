import assert from 'node:assert/strict';
import { test } from 'node:test';

import { validateConfig } from '../src/config.js';
import { assemblePage, assembleSite, renderHtml } from '../src/content.js';
import { makeConfig, makeRawConfig } from './fixtures.js';

function firstPage() {
  const cfg = makeConfig();
  return { cfg, page: assemblePage(cfg, cfg.services[0]!, cfg.cities[0]!) };
}

test('assemblePage produces the four expected sections in order', () => {
  const { page } = firstPage();
  assert.deepEqual(
    page.sections.map((s) => s.id),
    ['intro', 'service-details', 'local-trust', 'faq'],
  );
});

test('assemblePage output is deterministic', () => {
  const cfg = makeConfig();
  const a = assemblePage(cfg, cfg.services[0]!, cfg.cities[0]!);
  const b = assemblePage(cfg, cfg.services[0]!, cfg.cities[0]!);
  assert.deepEqual(a, b);
});

test('faq section has at least four Q&As with non-empty text', () => {
  const { page } = firstPage();
  const faq = page.sections.find((s) => s.id === 'faq');
  assert.ok(faq?.faqs && faq.faqs.length >= 4);
  for (const item of faq.faqs) {
    assert.ok(item.question.length > 10);
    assert.ok(item.answer.length > 20);
  }
});

test('content interpolates concrete local data (population, price band, city fact)', () => {
  const { page } = firstPage();
  const text = JSON.stringify(page.sections);
  assert.ok(text.includes('114,000'), 'population missing');
  assert.ok(text.includes('$150') && text.includes('$600'), 'price band missing');
  assert.ok(text.includes('Freeze-thaw'), 'city fact missing');
});

test('assembleSite covers the whole matrix', () => {
  const cfg = makeConfig();
  const pages = assembleSite(cfg);
  assert.equal(pages.length, cfg.services.length * cfg.cities.length);
  const paths = new Set(pages.map((p) => p.entry.path));
  assert.equal(paths.size, pages.length);
});

test('duplication avoidance: FAQ ordering rotates across pages', () => {
  const cfg = makeConfig();
  const pages = assembleSite(cfg);
  const firstQuestions = pages.map((p) => p.sections.find((s) => s.id === 'faq')!.faqs![0]!.question);
  // Across 6 pages, at least two different FAQs should lead the section.
  const leads = new Set(firstQuestions.map((q) => q.split(' ').slice(0, 3).join(' ')));
  assert.ok(leads.size > 1, 'every page leads with the same FAQ');
});

test('no unreplaced placeholders anywhere in assembled content', () => {
  const pages = assembleSite(makeConfig());
  for (const page of pages) {
    const text = JSON.stringify(page.sections);
    assert.ok(!/\{\w+\}/.test(text), `unreplaced placeholder in ${page.entry.path}`);
  }
});

test('renderHtml emits a complete document with title, meta, canonical, and h1', () => {
  const { cfg, page } = firstPage();
  const html = renderHtml(cfg, page);
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes(`<title>${page.entry.title}</title>`));
  assert.ok(html.includes(`content="${page.entry.metaDescription}"`));
  assert.ok(html.includes(`<link rel="canonical" href="${page.entry.canonicalUrl}">`));
  assert.ok(html.includes(`<h1>${page.entry.h1}</h1>`));
});

test('renderHtml embeds LocalBusiness, Service, and FAQPage JSON-LD', () => {
  const { cfg, page } = firstPage();
  const html = renderHtml(cfg, page);
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)];
  assert.equal(scripts.length, 3);
  const types = scripts.map((m) => (JSON.parse(m[1]!) as { '@type': string })['@type']);
  assert.deepEqual(types.sort(), ['FAQPage', 'LocalBusiness', 'Service']);
});

test('renderHtml escapes HTML-sensitive characters from config data', () => {
  const raw = makeRawConfig();
  (raw.cities as Record<string, unknown>[])[0]!.name = 'Spring & <Field>';
  const cfg = validateConfig(raw);
  const page = assemblePage(cfg, cfg.services[0]!, cfg.cities[0]!);
  const html = renderHtml(cfg, page);
  const body = html.slice(html.indexOf('<body>'));
  assert.ok(!body.includes('<Field>'), 'raw markup leaked into HTML body');
  assert.ok(body.includes('&amp;') && body.includes('&lt;Field&gt;'));
});

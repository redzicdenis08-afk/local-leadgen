import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildRobotsTxt,
  buildSitemapFiles,
  SITEMAP_MAX_URLS,
  sitemapUrlsFromConfig,
  type SitemapUrl,
} from '../src/sitemap.js';
import { makeConfig } from './fixtures.js';

function urls(n: number): SitemapUrl[] {
  const out: SitemapUrl[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ loc: `https://example.com/page-${i}`, lastmod: '2026-07-01' });
  }
  return out;
}

test('a small URL set produces a single sitemap.xml', () => {
  const files = buildSitemapFiles(urls(10), { baseUrl: 'https://example.com' });
  assert.equal(files.length, 1);
  assert.equal(files[0]!.filename, 'sitemap.xml');
  assert.ok(files[0]!.xml.includes('<urlset'));
  assert.equal((files[0]!.xml.match(/<url>/g) ?? []).length, 10);
});

test('sitemap entries include loc, lastmod, changefreq, and priority', () => {
  const files = buildSitemapFiles(
    [{ loc: 'https://example.com/a', lastmod: '2026-07-01', changefreq: 'monthly', priority: 0.8 }],
    { baseUrl: 'https://example.com' },
  );
  const xml = files[0]!.xml;
  assert.ok(xml.includes('<loc>https://example.com/a</loc>'));
  assert.ok(xml.includes('<lastmod>2026-07-01</lastmod>'));
  assert.ok(xml.includes('<changefreq>monthly</changefreq>'));
  assert.ok(xml.includes('<priority>0.8</priority>'));
});

test('exactly 50,000 URLs still fits in one file (protocol boundary)', () => {
  const files = buildSitemapFiles(urls(SITEMAP_MAX_URLS), { baseUrl: 'https://example.com' });
  assert.equal(files.length, 1);
  assert.equal(files[0]!.filename, 'sitemap.xml');
  assert.ok(files[0]!.xml.includes('<urlset'));
});

test('50,001 URLs chunk into two sitemaps plus an index', () => {
  const files = buildSitemapFiles(urls(SITEMAP_MAX_URLS + 1), { baseUrl: 'https://example.com' });
  assert.equal(files.length, 3);
  assert.equal(files[0]!.filename, 'sitemap.xml');
  assert.ok(files[0]!.xml.includes('<sitemapindex'));
  assert.ok(files[0]!.xml.includes('https://example.com/sitemap-1.xml'));
  assert.ok(files[0]!.xml.includes('https://example.com/sitemap-2.xml'));
  assert.equal(files[1]!.filename, 'sitemap-1.xml');
  assert.equal((files[1]!.xml.match(/<url>/g) ?? []).length, SITEMAP_MAX_URLS);
  assert.equal(files[2]!.filename, 'sitemap-2.xml');
  assert.equal((files[2]!.xml.match(/<url>/g) ?? []).length, 1);
});

test('chunking respects a custom maxUrlsPerFile', () => {
  const files = buildSitemapFiles(urls(25), { baseUrl: 'https://example.com', maxUrlsPerFile: 10 });
  // index + 3 chunks (10, 10, 5)
  assert.equal(files.length, 4);
  assert.equal((files[3]!.xml.match(/<url>/g) ?? []).length, 5);
});

test('index lastmod defaults to the newest URL lastmod', () => {
  const list = urls(15);
  list[7]!.lastmod = '2026-07-02';
  const files = buildSitemapFiles(list, { baseUrl: 'https://example.com', maxUrlsPerFile: 10 });
  assert.ok(files[0]!.xml.includes('<lastmod>2026-07-02</lastmod>'));
});

test('XML-escapes special characters in URLs', () => {
  const files = buildSitemapFiles([{ loc: 'https://example.com/a?x=1&y=2' }], {
    baseUrl: 'https://example.com',
  });
  assert.ok(files[0]!.xml.includes('https://example.com/a?x=1&amp;y=2'));
  assert.ok(!files[0]!.xml.includes('x=1&y'));
});

test('sitemapUrlsFromConfig covers homepage, service hubs, and the matrix', () => {
  const cfg = makeConfig();
  const list = sitemapUrlsFromConfig(cfg, '2026-07-01');
  // 1 homepage + 2 service hubs + 6 matrix pages
  assert.equal(list.length, 1 + 2 + 6);
  assert.equal(list[0]!.loc, 'https://example.com');
  assert.ok(list.some((u) => u.loc === 'https://example.com/window-cleaning'));
  assert.ok(list.some((u) => u.loc === 'https://example.com/gutter-cleaning/franklin'));
  assert.ok(list.every((u) => u.lastmod === '2026-07-01'));
});

test('robots.txt advertises the sitemap and honors disallow rules', () => {
  const robots = buildRobotsTxt({
    baseUrl: 'https://example.com',
    disallow: ['/admin', '/api'],
    sitemaps: ['sitemap.xml'],
  });
  assert.ok(robots.includes('User-agent: *'));
  assert.ok(robots.includes('Disallow: /admin'));
  assert.ok(robots.includes('Disallow: /api'));
  assert.ok(robots.includes('Sitemap: https://example.com/sitemap.xml'));
  assert.ok(!robots.includes('Allow: /'));
});

test('robots.txt allows everything by default', () => {
  const robots = buildRobotsTxt({ baseUrl: 'https://example.com' });
  assert.ok(robots.includes('Allow: /'));
  assert.ok(robots.includes('Sitemap: https://example.com/sitemap.xml'));
});

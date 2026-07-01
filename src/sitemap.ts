/**
 * sitemap.xml + robots.txt generation.
 *
 * The sitemap protocol caps a single file at 50,000 URLs (and 50 MB).
 * Below the cap this module emits one `sitemap.xml`; above it, the URL
 * set is chunked into `sitemap-1.xml`, `sitemap-2.xml`, … plus a
 * `sitemap.xml` index that references every chunk — the layout large
 * programmatic sites actually need.
 *
 * lastmod matters: emitting "today" for every URL on every build tells
 * crawlers everything changed, which burns crawl budget. Callers should
 * pass real per-page modification times where they have them.
 */

import type { LeadGenConfig } from './config.js';
import { buildMatrix } from './matrix.js';

/** Hard limit from sitemaps.org protocol. */
export const SITEMAP_MAX_URLS = 50_000;

export type ChangeFreq = 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';

export interface SitemapUrl {
  loc: string;
  /** ISO 8601 date or datetime. */
  lastmod?: string;
  changefreq?: ChangeFreq;
  /** 0.0–1.0 */
  priority?: number;
}

export interface SitemapFile {
  /** File name relative to the site root, e.g. "sitemap.xml". */
  filename: string;
  xml: string;
}

function xmlEscape(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function renderUrlEntry(url: SitemapUrl): string {
  const parts = [`    <loc>${xmlEscape(url.loc)}</loc>`];
  if (url.lastmod) parts.push(`    <lastmod>${xmlEscape(url.lastmod)}</lastmod>`);
  if (url.changefreq) parts.push(`    <changefreq>${url.changefreq}</changefreq>`);
  if (url.priority !== undefined) parts.push(`    <priority>${url.priority.toFixed(1)}</priority>`);
  return `  <url>\n${parts.join('\n')}\n  </url>`;
}

function renderUrlSet(urls: SitemapUrl[]): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map(renderUrlEntry),
    '</urlset>',
    '',
  ].join('\n');
}

function renderIndex(baseUrl: string, chunkNames: string[], lastmod: string): string {
  const entries = chunkNames.map(
    (name) =>
      `  <sitemap>\n    <loc>${xmlEscape(`${baseUrl}/${name}`)}</loc>\n    <lastmod>${xmlEscape(lastmod)}</lastmod>\n  </sitemap>`,
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    '</sitemapindex>',
    '',
  ].join('\n');
}

export interface BuildSitemapOptions {
  /** Site origin used for index entries, e.g. "https://example.com". */
  baseUrl: string;
  /** Override the 50k protocol cap (mainly for tests). */
  maxUrlsPerFile?: number;
  /** lastmod stamped on index entries. Defaults to the max URL lastmod or today. */
  indexLastmod?: string;
}

/**
 * Turn a URL list into sitemap file(s).
 *
 * - `urls.length <= max`  → `[sitemap.xml]`
 * - `urls.length >  max`  → `[sitemap.xml (index), sitemap-1.xml, …]`
 */
export function buildSitemapFiles(urls: SitemapUrl[], options: BuildSitemapOptions): SitemapFile[] {
  const max = options.maxUrlsPerFile ?? SITEMAP_MAX_URLS;
  if (max < 1) throw new Error('maxUrlsPerFile must be >= 1');

  if (urls.length <= max) {
    return [{ filename: 'sitemap.xml', xml: renderUrlSet(urls) }];
  }

  const chunks: SitemapFile[] = [];
  for (let i = 0; i < urls.length; i += max) {
    const n = chunks.length + 1;
    chunks.push({ filename: `sitemap-${n}.xml`, xml: renderUrlSet(urls.slice(i, i + max)) });
  }

  const lastmod =
    options.indexLastmod ??
    urls.reduce<string | undefined>((acc, u) => (u.lastmod && (!acc || u.lastmod > acc) ? u.lastmod : acc), undefined) ??
    new Date().toISOString().slice(0, 10);

  const index: SitemapFile = {
    filename: 'sitemap.xml',
    xml: renderIndex(options.baseUrl, chunks.map((c) => c.filename), lastmod),
  };
  return [index, ...chunks];
}

/**
 * Derive the sitemap URL list for a config: homepage, one hub per
 * service, and every service × city page.
 */
export function sitemapUrlsFromConfig(cfg: LeadGenConfig, lastmod?: string): SitemapUrl[] {
  const stamp = lastmod ?? new Date().toISOString().slice(0, 10);
  const urls: SitemapUrl[] = [
    { loc: cfg.site.baseUrl, lastmod: stamp, changefreq: 'weekly', priority: 1.0 },
  ];
  for (const service of cfg.services) {
    urls.push({
      loc: `${cfg.site.baseUrl}/${service.slug}`,
      lastmod: stamp,
      changefreq: 'weekly',
      priority: 0.7,
    });
  }
  for (const page of buildMatrix(cfg)) {
    urls.push({ loc: page.canonicalUrl, lastmod: stamp, changefreq: 'monthly', priority: 0.8 });
  }
  return urls;
}

export interface RobotsOptions {
  baseUrl: string;
  /** Paths to disallow for all agents (e.g. "/admin"). */
  disallow?: string[];
  /** Sitemap filenames to advertise. Defaults to ["sitemap.xml"]. */
  sitemaps?: string[];
}

/** Render robots.txt advertising the sitemap(s). */
export function buildRobotsTxt(options: RobotsOptions): string {
  const lines = ['User-agent: *'];
  const disallow = options.disallow ?? [];
  if (disallow.length === 0) {
    lines.push('Allow: /');
  } else {
    for (const path of disallow) lines.push(`Disallow: ${path}`);
  }
  lines.push('');
  for (const name of options.sitemaps ?? ['sitemap.xml']) {
    lines.push(`Sitemap: ${options.baseUrl}/${name}`);
  }
  lines.push('');
  return lines.join('\n');
}

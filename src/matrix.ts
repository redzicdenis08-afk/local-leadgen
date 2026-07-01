/**
 * Page-matrix generator.
 *
 * Expands a config into the full service × city page matrix. Every page
 * gets a slug, canonical URL, and title/meta/H1 copy chosen from rotating
 * template banks.
 *
 * Doorway-page avoidance: search engines demote large sets of pages that
 * are identical except for a swapped city name. Two mechanisms fight that
 * here:
 *
 *   1. Rotating templates — title, meta description, and H1 each come
 *      from a bank of distinct templates. The pick is a deterministic
 *      hash of (service, city, field), so the same config always yields
 *      the same output, but neighboring pages phrase things differently.
 *   2. Fact interpolation — templates pull in city facts, service facts,
 *      price bands, and population so pages contain concrete local
 *      information rather than find-and-replace boilerplate.
 */

import type { CityConfig, LeadGenConfig, ServiceConfig } from './config.js';

export interface PageEntry {
  serviceSlug: string;
  citySlug: string;
  /** URL path, e.g. "/window-cleaning/springfield". */
  path: string;
  /** Absolute canonical URL. */
  canonicalUrl: string;
  title: string;
  metaDescription: string;
  h1: string;
  /** Which template index produced each field (useful for audits). */
  templateIds: { title: number; meta: number; h1: number };
  keywords: string[];
}

/** FNV-1a 32-bit — small, fast, deterministic across platforms. */
export function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Template context available to every template bank. */
interface TemplateContext {
  service: string;
  serviceLower: string;
  city: string;
  state: string;
  stateName: string;
  priceLow: string;
  priceHigh: string;
  population: string;
  siteName: string;
  keyword: string;
  keywordTitle: string;
  cityFact: string;
  serviceFact: string;
}

const TITLE_TEMPLATES: readonly string[] = [
  '{service} in {city}, {state} | Free Local Quotes',
  '{city} {service} — Compare Local Pricing ({priceLow}–{priceHigh})',
  '{service} {city} {state}: Get a Same-Day Quote',
  'Trusted {service} for {city} Homeowners | {siteName}',
  '{keywordTitle} in {city}, {stateName} — Request a Free Quote',
  '{city}, {state} {service} Quotes | No-Commitment Estimates',
];

const META_TEMPLATES: readonly string[] = [
  'Request a free {serviceLower} quote in {city}, {state}. Typical local jobs run {priceLow}–{priceHigh}. No commitment, same-day routing to a local provider.',
  'Compare {serviceLower} pricing in {city} ({stateName}). Most homeowners pay {priceLow}–{priceHigh}. Submit one request and get connected locally.',
  'Looking for {keyword} in {city}? Serving a community of {population} residents with transparent {priceLow}–{priceHigh} pricing and free quotes.',
  '{city} homeowners: get {serviceLower} quotes without the phone-tag. Local pricing runs {priceLow}–{priceHigh}. Free, fast, no obligation.',
  'Free {serviceLower} quote requests for {city}, {state}. {serviceFact} Typical range {priceLow}–{priceHigh}.',
  'Get matched with {serviceLower} help in {city}, {stateName}. One short form, typical pricing {priceLow}–{priceHigh}, reviewed the same business day.',
];

const H1_TEMPLATES: readonly string[] = [
  '{service} in {city}, {state}',
  '{service} Quotes for {city} Homeowners',
  '{city} {service}: Free Local Quotes',
  'Get {service} Pricing in {city}, {stateName}',
  '{service} in {city} — Compare Local Options',
];

function titleCase(input: string): string {
  return input.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function buildContext(cfg: LeadGenConfig, service: ServiceConfig, city: CityConfig): TemplateContext {
  const pairHash = fnv1a(`${service.slug}|${city.slug}`);
  const cityFacts = city.facts ?? [];
  const serviceFacts = service.facts ?? [];
  const keywords = service.keywords;
  const keyword = keywords[pairHash % keywords.length] ?? service.name.toLowerCase();
  return {
    service: service.name,
    serviceLower: service.name.toLowerCase(),
    city: city.name,
    state: city.state,
    stateName: city.stateName ?? city.state,
    priceLow: `$${service.priceLow}`,
    priceHigh: `$${service.priceHigh}`,
    population: city.population.toLocaleString('en-US'),
    siteName: cfg.site.name,
    keyword,
    keywordTitle: titleCase(keyword),
    cityFact: cityFacts.length > 0 ? (cityFacts[pairHash % cityFacts.length] as string) : '',
    serviceFact: serviceFacts.length > 0 ? (serviceFacts[pairHash % serviceFacts.length] as string) : '',
  };
}

/** Replace {placeholder} tokens; unknown tokens throw so bugs surface early. */
export function interpolate(template: string, ctx: TemplateContext | Record<string, string>): string {
  return template
    .replace(/\{(\w+)\}/g, (_, key: string) => {
      const value = (ctx as Record<string, string>)[key];
      if (value === undefined) {
        throw new Error(`Unknown template placeholder {${key}} in "${template}"`);
      }
      return value;
    })
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Deterministic template pick. The field salt decorrelates the picks so a
 * page that gets title template 2 does not automatically get meta
 * template 2 — combinations vary across the matrix.
 */
function pickTemplate(banks: readonly string[], serviceSlug: string, citySlug: string, salt: string): number {
  return fnv1a(`${salt}:${serviceSlug}|${citySlug}`) % banks.length;
}

/** Build one page entry for a service × city pair. */
export function buildPageEntry(cfg: LeadGenConfig, service: ServiceConfig, city: CityConfig): PageEntry {
  const serviceSlug = service.slug as string;
  const citySlug = city.slug as string;
  const ctx = buildContext(cfg, service, city);

  const titleId = pickTemplate(TITLE_TEMPLATES, serviceSlug, citySlug, 'title');
  const metaId = pickTemplate(META_TEMPLATES, serviceSlug, citySlug, 'meta');
  const h1Id = pickTemplate(H1_TEMPLATES, serviceSlug, citySlug, 'h1');

  const path = `/${serviceSlug}/${citySlug}`;
  return {
    serviceSlug,
    citySlug,
    path,
    canonicalUrl: `${cfg.site.baseUrl}${path}`,
    title: interpolate(TITLE_TEMPLATES[titleId] as string, ctx),
    metaDescription: interpolate(META_TEMPLATES[metaId] as string, ctx),
    h1: interpolate(H1_TEMPLATES[h1Id] as string, ctx),
    templateIds: { title: titleId, meta: metaId, h1: h1Id },
    keywords: [...service.keywords],
  };
}

/**
 * Expand the full matrix: one page per service × city, ordered
 * service-major so output is stable and diffable.
 */
export function buildMatrix(cfg: LeadGenConfig): PageEntry[] {
  const pages: PageEntry[] = [];
  for (const service of cfg.services) {
    for (const city of cfg.cities) {
      pages.push(buildPageEntry(cfg, service, city));
    }
  }
  return pages;
}

/** Number of distinct templates in each bank (exported for tests/docs). */
export const TEMPLATE_BANK_SIZES = {
  title: TITLE_TEMPLATES.length,
  meta: META_TEMPLATES.length,
  h1: H1_TEMPLATES.length,
} as const;

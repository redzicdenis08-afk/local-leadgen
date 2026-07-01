/**
 * Deterministic page-content assembler.
 *
 * Produces structured page content (sections + FAQs) from template banks
 * and config data, then optionally renders it to an HTML string. The same
 * config always produces byte-identical output — content is a pure
 * function of the data, which makes builds reproducible and diffs
 * reviewable.
 *
 * The section templates rotate the same way the matrix templates do (see
 * matrix.ts) and lean on city/service facts so pages across the matrix
 * differ in substance, not just in the city token.
 */

import type { CityConfig, LeadGenConfig, ServiceConfig } from './config.js';
import { buildPageEntry, fnv1a, interpolate, type PageEntry } from './matrix.js';
import { escapeHtml, faqPageJsonLd, localBusinessJsonLd, serviceJsonLd } from './schema.js';

export interface FaqItem {
  question: string;
  answer: string;
}

export interface PageSection {
  id: 'intro' | 'service-details' | 'local-trust' | 'faq';
  heading: string;
  /** Paragraph copy (all sections except FAQ). */
  paragraphs?: string[];
  /** Bullet items (service-details and local-trust). */
  items?: string[];
  /** FAQ entries (faq section only). */
  faqs?: FaqItem[];
}

export interface PageContent {
  entry: PageEntry;
  sections: PageSection[];
}

const INTRO_TEMPLATES: readonly string[] = [
  'If you are comparing {serviceLower} options in {city}, {stateName}, this page is built for you. {serviceFact} Typical {city} jobs run {priceLow} to {priceHigh}, and a quote request takes about thirty seconds.',
  'Finding reliable {serviceLower} in {city} should not require ten phone calls. {cityFact} Submit one request and get connected with local help — typical pricing runs {priceLow} to {priceHigh}.',
  '{city} is home to {population} people, and demand for {serviceLower} here is steady year-round. {serviceFact} Local pricing usually lands between {priceLow} and {priceHigh} depending on scope.',
  'Homeowners across {city}, {state} use this page to request {serviceLower} quotes without pressure or spam. {cityFact} Expect quotes in the {priceLow}–{priceHigh} range for most jobs.',
];

const DETAILS_TEMPLATES: readonly string[] = [
  '{description} In {city}, the final price depends on property size, condition, and access — the {priceLow}–{priceHigh} band covers the large majority of local jobs.',
  '{description} Most {city} homeowners pay between {priceLow} and {priceHigh}; larger properties or heavy buildup push toward the top of the range.',
  '{description} Pricing in {city}, {stateName} typically falls between {priceLow} and {priceHigh}. A quick walkthrough or photos are usually enough for an accurate quote.',
];

const TRUST_TEMPLATES: readonly string[] = [
  'This service covers {city} and the surrounding {stateName} area{nearbyClause}. {cityFact}',
  'Requests from {city}{neighborhoodClause} are matched to providers who actually work in the area{nearbyClause}. {cityFact}',
  'Coverage is local by design: {city} requests go to {city}-area providers, not a national call center{nearbyClause}. {cityFact}',
];

/** FAQ bank — each builder returns a deterministic Q&A for the pair. */
type FaqBuilder = (ctx: Record<string, string>) => FaqItem;

const FAQ_BUILDERS: readonly FaqBuilder[] = [
  (ctx) => ({
    question: interpolate('How much does {serviceLower} cost in {city}?', ctx),
    answer: interpolate(
      'Most {city} homes fall in the {priceLow}–{priceHigh} range. The exact number depends on property size, condition, and access, so a quote request gets you a real figure instead of a national average.',
      ctx,
    ),
  }),
  (ctx) => ({
    question: interpolate('How fast will someone contact me in {city}?', ctx),
    answer: interpolate(
      'Requests are reviewed and routed the same business day. A local {serviceLower} provider covering {city} typically reaches out within one business day.',
      ctx,
    ),
  }),
  (ctx) => ({
    question: interpolate('Is this site the company doing the work?', ctx),
    answer: interpolate(
      'No — this is a quote-request service. It connects {city} homeowners with an independent local provider. Scheduling, pricing, insurance, and the work itself are handled by that provider, and you can verify their credentials before committing.',
      ctx,
    ),
  }),
  (ctx) => ({
    question: interpolate('What areas around {city} are covered?', ctx),
    answer: interpolate(
      'Coverage centers on {city}, {stateName}{nearbyClause}. If your address is outside the area, you are told up front instead of having your details passed around.',
      ctx,
    ),
  }),
  (ctx) => ({
    question: interpolate('Am I committing to anything by requesting a quote?', ctx),
    answer: interpolate(
      'No. A quote request is free and carries no obligation. You compare the quote, ask questions, and decide your own timeline — or walk away.',
      ctx,
    ),
  }),
];

function pick(banks: readonly unknown[], serviceSlug: string, citySlug: string, salt: string): number {
  return fnv1a(`${salt}:${serviceSlug}|${citySlug}`) % banks.length;
}

function buildContentContext(cfg: LeadGenConfig, service: ServiceConfig, city: CityConfig): Record<string, string> {
  const pairHash = fnv1a(`${service.slug}|${city.slug}`);
  const cityFacts = city.facts ?? [];
  const serviceFacts = service.facts ?? [];
  const nearby = (city.nearbyCities ?? []).slice(0, 3);
  const neighborhoods = (city.neighborhoods ?? []).slice(0, 2);
  return {
    service: service.name,
    serviceLower: service.name.toLowerCase(),
    description: service.description,
    city: city.name,
    state: city.state,
    stateName: city.stateName ?? city.state,
    priceLow: `$${service.priceLow}`,
    priceHigh: `$${service.priceHigh}`,
    population: city.population.toLocaleString('en-US'),
    siteName: cfg.site.name,
    cityFact: cityFacts.length > 0 ? (cityFacts[pairHash % cityFacts.length] as string) : '',
    serviceFact: serviceFacts.length > 0 ? (serviceFacts[pairHash % serviceFacts.length] as string) : '',
    nearbyClause: nearby.length > 0 ? `, including ${nearby.join(', ')}` : '',
    neighborhoodClause: neighborhoods.length > 0 ? ` (${neighborhoods.join(', ')} and beyond)` : '',
  };
}

/**
 * Assemble the structured content for one service × city page.
 * Deterministic: same inputs, same output.
 */
export function assemblePage(cfg: LeadGenConfig, service: ServiceConfig, city: CityConfig): PageContent {
  const entry = buildPageEntry(cfg, service, city);
  const ctx = buildContentContext(cfg, service, city);
  const serviceSlug = service.slug as string;
  const citySlug = city.slug as string;

  const intro: PageSection = {
    id: 'intro',
    heading: entry.h1,
    paragraphs: [interpolate(INTRO_TEMPLATES[pick(INTRO_TEMPLATES, serviceSlug, citySlug, 'intro')] as string, ctx)],
  };

  const details: PageSection = {
    id: 'service-details',
    heading: interpolate('What {service} in {city} Involves', ctx),
    paragraphs: [interpolate(DETAILS_TEMPLATES[pick(DETAILS_TEMPLATES, serviceSlug, citySlug, 'details')] as string, ctx)],
    items: service.keywords.map((k) => interpolate('{k} in {city}, {state}', { ...ctx, k })),
  };

  const trust: PageSection = {
    id: 'local-trust',
    heading: interpolate('Local to {city}, {stateName}', ctx),
    paragraphs: [interpolate(TRUST_TEMPLATES[pick(TRUST_TEMPLATES, serviceSlug, citySlug, 'trust')] as string, ctx)],
    items: [
      interpolate('Serving a community of {population} residents', ctx),
      interpolate('Typical {city} pricing shown before you submit ({priceLow}–{priceHigh})', ctx),
      'Free quote request, no commitment',
    ],
  };

  // Rotate the FAQ order (not just wording) so page structure varies too:
  // start at a hash-picked offset and take all five in rotated order.
  const offset = pick(FAQ_BUILDERS, serviceSlug, citySlug, 'faq');
  const faqs = FAQ_BUILDERS.map((_, i) => (FAQ_BUILDERS[(offset + i) % FAQ_BUILDERS.length] as FaqBuilder)(ctx));

  const faq: PageSection = {
    id: 'faq',
    heading: interpolate('{service} in {city}: Common Questions', ctx),
    faqs,
  };

  return { entry, sections: [intro, details, trust, faq] };
}

/** Assemble content for every page in the matrix. */
export function assembleSite(cfg: LeadGenConfig): PageContent[] {
  const pages: PageContent[] = [];
  for (const service of cfg.services) {
    for (const city of cfg.cities) {
      pages.push(assemblePage(cfg, service, city));
    }
  }
  return pages;
}

/**
 * Render a page to a standalone HTML document string, including the
 * JSON-LD blocks (LocalBusiness, Service, FAQPage) in <head>.
 */
export function renderHtml(cfg: LeadGenConfig, page: PageContent): string {
  const { entry } = page;
  const service = cfg.services.find((s) => s.slug === entry.serviceSlug);
  const city = cfg.cities.find((c) => c.slug === entry.citySlug);
  if (!service || !city) {
    throw new Error(`Page ${entry.path} references unknown service/city`);
  }

  const faqSection = page.sections.find((s) => s.id === 'faq');
  const jsonLd = [
    localBusinessJsonLd({ site: cfg.site, service, city, url: entry.canonicalUrl }),
    serviceJsonLd({ site: cfg.site, service, city, url: entry.canonicalUrl }),
    ...(faqSection?.faqs ? [faqPageJsonLd(faqSection.faqs)] : []),
  ];

  const bodySections = page.sections
    .map((section) => {
      const heading = `<h2>${escapeHtml(section.heading)}</h2>`;
      const paragraphs = (section.paragraphs ?? []).map((p) => `<p>${escapeHtml(p)}</p>`).join('\n      ');
      const items =
        section.items && section.items.length > 0
          ? `<ul>\n        ${section.items.map((i) => `<li>${escapeHtml(i)}</li>`).join('\n        ')}\n      </ul>`
          : '';
      const faqs =
        section.faqs && section.faqs.length > 0
          ? section.faqs
              .map(
                (f) =>
                  `<details>\n        <summary>${escapeHtml(f.question)}</summary>\n        <p>${escapeHtml(f.answer)}</p>\n      </details>`,
              )
              .join('\n      ')
          : '';
      return `    <section id="${section.id}">\n      ${[heading, paragraphs, items, faqs].filter(Boolean).join('\n      ')}\n    </section>`;
    })
    .join('\n');

  const scripts = jsonLd
    .map((obj) => `  <script type="application/ld+json">${JSON.stringify(obj)}</script>`)
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(entry.title)}</title>
  <meta name="description" content="${escapeHtml(entry.metaDescription)}">
  <link rel="canonical" href="${escapeHtml(entry.canonicalUrl)}">
${scripts}
</head>
<body>
  <main>
    <h1>${escapeHtml(entry.h1)}</h1>
${bodySections}
  </main>
</body>
</html>
`;
}

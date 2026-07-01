/**
 * schema.org JSON-LD generators.
 *
 * Local SEO lives and dies on structured data: LocalBusiness feeds the
 * map pack, Service describes the offering, FAQPage drives rich
 * snippets, BreadcrumbList shows in mobile SERPs.
 *
 * Policy notes baked in:
 *   - No fabricated aggregateRating — review markup without real,
 *     on-page reviews violates Google's review-snippet policy and risks
 *     a structured-data manual action, so this module never emits it.
 *   - Geo markup is only emitted when the config actually has
 *     coordinates; guessing coordinates is worse than omitting them.
 */

import type { CityConfig, ServiceConfig, SiteConfig } from './config.js';

export type JsonLd = Record<string, unknown>;

export interface SchemaInput {
  site: SiteConfig;
  service: ServiceConfig;
  city: CityConfig;
  /** Canonical URL of the page embedding this markup. */
  url: string;
}

/** LocalBusiness — the anchor entity for local-pack eligibility. */
export function localBusinessJsonLd(input: SchemaInput): JsonLd {
  const { site, service, city, url } = input;
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': `${url}#business`,
    name: site.name,
    url,
    ...(site.phone ? { telephone: site.phone } : {}),
    address: {
      '@type': 'PostalAddress',
      addressLocality: city.name,
      addressRegion: city.state,
      addressCountry: 'US',
    },
    ...(typeof city.lat === 'number' && typeof city.lng === 'number'
      ? {
          geo: {
            '@type': 'GeoCoordinates',
            latitude: city.lat,
            longitude: city.lng,
          },
        }
      : {}),
    areaServed: [
      { '@type': 'City', name: city.name },
      ...(city.nearbyCities ?? []).map((name) => ({ '@type': 'City', name })),
    ],
    knowsAbout: service.keywords,
    makesOffer: {
      '@type': 'Offer',
      itemOffered: { '@type': 'Service', name: service.name },
      priceSpecification: {
        '@type': 'PriceSpecification',
        priceCurrency: 'USD',
        minPrice: service.priceLow,
        maxPrice: service.priceHigh,
      },
    },
  };
}

/** Service — describes the specific offering on this page. */
export function serviceJsonLd(input: SchemaInput): JsonLd {
  const { site, service, city, url } = input;
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    '@id': `${url}#service`,
    serviceType: service.name,
    description: service.description,
    provider: {
      '@type': 'LocalBusiness',
      name: site.name,
      ...(site.phone ? { telephone: site.phone } : {}),
    },
    areaServed: { '@type': 'City', name: city.name },
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'USD',
      lowPrice: service.priceLow,
      highPrice: service.priceHigh,
    },
  };
}

/** FAQPage — each Q&A can surface as a rich snippet. */
export function faqPageJsonLd(faqs: ReadonlyArray<{ question: string; answer: string }>): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer },
    })),
  };
}

/** BreadcrumbList — Home > Service > Service in City. */
export function breadcrumbJsonLd(input: SchemaInput): JsonLd {
  const { site, service, city, url } = input;
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: site.baseUrl },
      { '@type': 'ListItem', position: 2, name: service.name, item: `${site.baseUrl}/${service.slug}` },
      { '@type': 'ListItem', position: 3, name: `${service.name} in ${city.name}`, item: url },
    ],
  };
}

export interface SchemaValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Structural validation for the JSON-LD this package emits (and anything
 * shaped like it). Not a full schema.org validator — it checks the
 * invariants that break rich results in practice: @context/@type
 * present, and the per-type required members populated.
 */
export function validateJsonLd(doc: unknown): SchemaValidationResult {
  const errors: string[] = [];
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) {
    return { valid: false, errors: ['document must be a JSON object'] };
  }
  const obj = doc as Record<string, unknown>;

  if (obj['@context'] !== 'https://schema.org') {
    errors.push('@context must be "https://schema.org"');
  }
  const type = obj['@type'];
  if (typeof type !== 'string' || type.length === 0) {
    errors.push('@type must be a non-empty string');
    return { valid: false, errors };
  }

  const requireString = (key: string) => {
    if (typeof obj[key] !== 'string' || (obj[key] as string).length === 0) {
      errors.push(`${type}.${key} must be a non-empty string`);
    }
  };

  switch (type) {
    case 'LocalBusiness': {
      requireString('name');
      requireString('url');
      const address = obj.address as Record<string, unknown> | undefined;
      if (!address || address['@type'] !== 'PostalAddress' || typeof address.addressLocality !== 'string') {
        errors.push('LocalBusiness.address must be a PostalAddress with addressLocality');
      }
      if (obj.aggregateRating !== undefined) {
        errors.push(
          'LocalBusiness.aggregateRating present — only emit review markup backed by real, on-page reviews',
        );
      }
      break;
    }
    case 'Service': {
      requireString('serviceType');
      const provider = obj.provider as Record<string, unknown> | undefined;
      if (!provider || typeof provider.name !== 'string') {
        errors.push('Service.provider must include a name');
      }
      break;
    }
    case 'FAQPage': {
      const main = obj.mainEntity;
      if (!Array.isArray(main) || main.length === 0) {
        errors.push('FAQPage.mainEntity must be a non-empty array');
        break;
      }
      main.forEach((q, i) => {
        const question = q as Record<string, unknown>;
        if (question['@type'] !== 'Question' || typeof question.name !== 'string') {
          errors.push(`FAQPage.mainEntity[${i}] must be a Question with a name`);
        }
        const answer = question.acceptedAnswer as Record<string, unknown> | undefined;
        if (!answer || answer['@type'] !== 'Answer' || typeof answer.text !== 'string' || answer.text.length === 0) {
          errors.push(`FAQPage.mainEntity[${i}].acceptedAnswer must be an Answer with text`);
        }
      });
      break;
    }
    case 'BreadcrumbList': {
      const items = obj.itemListElement;
      if (!Array.isArray(items) || items.length === 0) {
        errors.push('BreadcrumbList.itemListElement must be a non-empty array');
        break;
      }
      items.forEach((item, i) => {
        const li = item as Record<string, unknown>;
        if (li['@type'] !== 'ListItem' || typeof li.position !== 'number' || typeof li.name !== 'string') {
          errors.push(`BreadcrumbList.itemListElement[${i}] must be a ListItem with position and name`);
        }
      });
      break;
    }
    default:
      // Unknown types only need the universal invariants checked above.
      break;
  }

  return { valid: errors.length === 0, errors };
}

/** Minimal HTML escaping for text nodes and attribute values. */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

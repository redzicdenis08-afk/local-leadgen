/**
 * Configuration model + validation.
 *
 * Everything the engine produces (page matrix, content, schema, sitemap,
 * lead routing) is derived from one declarative config object. The config
 * is plain JSON so it can live in a repo, be diffed, and be reviewed like
 * any other code.
 */

export interface ServiceConfig {
  /** URL-safe identifier. Derived from `name` when omitted. */
  slug?: string;
  /** Display name, e.g. "Window Cleaning". */
  name: string;
  /** One-sentence description of the service. */
  description: string;
  /** Typical price band in whole currency units. */
  priceLow: number;
  priceHigh: number;
  /** Primary keywords this service targets. */
  keywords: string[];
  /**
   * Service-specific facts interpolated into templates so each page says
   * something concrete instead of boilerplate ("soft washing protects
   * siding from high-pressure damage").
   */
  facts?: string[];
}

export interface CityConfig {
  /** URL-safe identifier. Derived from `name` when omitted. */
  slug?: string;
  name: string;
  /** Two-letter region code, e.g. "IL". */
  state: string;
  /** Full region name, e.g. "Illinois". Falls back to `state`. */
  stateName?: string;
  population: number;
  /** City-specific facts used for template interpolation. */
  facts?: string[];
  /** Neighborhood names referenced in local-trust content. */
  neighborhoods?: string[];
  /** Nearby towns listed in the service-area description. */
  nearbyCities?: string[];
  /** Optional coordinates for LocalBusiness geo markup. */
  lat?: number;
  lng?: number;
}

export interface SiteConfig {
  /** Canonical origin, e.g. "https://example.com". No trailing slash. */
  baseUrl: string;
  /** Public site name used in titles and schema markup. */
  name: string;
  /** Optional public phone in E.164-ish form. */
  phone?: string;
}

/** A renter business that buys leads for specific service/city combos. */
export interface RoutingRule {
  id: string;
  businessName: string;
  /** Where routed leads are delivered (email/webhook — synthetic here). */
  contactEmail: string;
  /** Service slugs this renter covers, or ["*"] for all. */
  serviceSlugs: string[];
  /** City slugs this renter covers, or ["*"] for all. */
  citySlugs: string[];
  /** Lower number wins when multiple rules match. Default 100. */
  priority?: number;
  /** Inactive rules are skipped entirely. Default true. */
  active?: boolean;
}

export interface LeadGenConfig {
  site: SiteConfig;
  services: ServiceConfig[];
  cities: CityConfig[];
  routing?: RoutingRule[];
  /** Fallback delivery address when no routing rule matches. */
  fallbackEmail?: string;
}

/** A config error carries every problem found, not just the first. */
export class ConfigError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(`Invalid config:\n  - ${issues.join('\n  - ')}`);
    this.name = 'ConfigError';
    this.issues = issues;
  }
}

/** Lowercase, ASCII-ish, dash-separated slug. */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((s) => typeof s === 'string');
}

/**
 * Validate an untrusted object (e.g. parsed JSON) into a LeadGenConfig.
 * Throws ConfigError listing every issue. Slugs are filled in and
 * normalized; duplicate slugs are rejected because they would collide
 * into the same URL.
 */
export function validateConfig(raw: unknown): LeadGenConfig {
  const issues: string[] = [];

  if (!isRecord(raw)) {
    throw new ConfigError(['config must be a JSON object']);
  }

  // --- site ---
  let site: SiteConfig = { baseUrl: '', name: '' };
  if (!isRecord(raw.site)) {
    issues.push('site: required object with baseUrl and name');
  } else {
    const s = raw.site;
    if (!isNonEmptyString(s.baseUrl) || !/^https?:\/\/[^\s/]+$/i.test(s.baseUrl.trim())) {
      issues.push('site.baseUrl: must be an origin like "https://example.com" (no trailing slash or path)');
    }
    if (!isNonEmptyString(s.name)) issues.push('site.name: required non-empty string');
    site = {
      baseUrl: isNonEmptyString(s.baseUrl) ? s.baseUrl.trim().replace(/\/+$/, '') : '',
      name: isNonEmptyString(s.name) ? s.name.trim() : '',
      ...(isNonEmptyString(s.phone) ? { phone: s.phone.trim() } : {}),
    };
  }

  // --- services ---
  const services: ServiceConfig[] = [];
  if (!Array.isArray(raw.services) || raw.services.length === 0) {
    issues.push('services: required non-empty array');
  } else {
    raw.services.forEach((entry, i) => {
      const where = `services[${i}]`;
      if (!isRecord(entry)) {
        issues.push(`${where}: must be an object`);
        return;
      }
      if (!isNonEmptyString(entry.name)) issues.push(`${where}.name: required non-empty string`);
      if (!isNonEmptyString(entry.description)) issues.push(`${where}.description: required non-empty string`);
      const low = entry.priceLow;
      const high = entry.priceHigh;
      if (typeof low !== 'number' || !Number.isFinite(low) || low < 0) {
        issues.push(`${where}.priceLow: required non-negative number`);
      }
      if (typeof high !== 'number' || !Number.isFinite(high) || high < 0) {
        issues.push(`${where}.priceHigh: required non-negative number`);
      }
      if (typeof low === 'number' && typeof high === 'number' && low > high) {
        issues.push(`${where}: priceLow (${low}) must not exceed priceHigh (${high})`);
      }
      if (!isStringArray(entry.keywords) || entry.keywords.length === 0) {
        issues.push(`${where}.keywords: required non-empty string array`);
      }
      if (entry.facts !== undefined && !isStringArray(entry.facts)) {
        issues.push(`${where}.facts: must be a string array when present`);
      }
      if (!isNonEmptyString(entry.name)) return;
      const slug = isNonEmptyString(entry.slug) ? slugify(entry.slug) : slugify(entry.name);
      if (!slug) {
        issues.push(`${where}: could not derive a slug from "${entry.name}"`);
        return;
      }
      services.push({
        slug,
        name: entry.name.trim(),
        description: isNonEmptyString(entry.description) ? entry.description.trim() : '',
        priceLow: typeof low === 'number' ? low : 0,
        priceHigh: typeof high === 'number' ? high : 0,
        keywords: isStringArray(entry.keywords) ? entry.keywords : [],
        ...(isStringArray(entry.facts) ? { facts: entry.facts } : {}),
      });
    });
  }

  // --- cities ---
  const cities: CityConfig[] = [];
  if (!Array.isArray(raw.cities) || raw.cities.length === 0) {
    issues.push('cities: required non-empty array');
  } else {
    raw.cities.forEach((entry, i) => {
      const where = `cities[${i}]`;
      if (!isRecord(entry)) {
        issues.push(`${where}: must be an object`);
        return;
      }
      if (!isNonEmptyString(entry.name)) issues.push(`${where}.name: required non-empty string`);
      if (!isNonEmptyString(entry.state)) issues.push(`${where}.state: required non-empty string`);
      if (typeof entry.population !== 'number' || !Number.isFinite(entry.population) || entry.population <= 0) {
        issues.push(`${where}.population: required positive number`);
      }
      for (const key of ['facts', 'neighborhoods', 'nearbyCities'] as const) {
        if (entry[key] !== undefined && !isStringArray(entry[key])) {
          issues.push(`${where}.${key}: must be a string array when present`);
        }
      }
      if (!isNonEmptyString(entry.name)) return;
      const slug = isNonEmptyString(entry.slug) ? slugify(entry.slug) : slugify(entry.name);
      if (!slug) {
        issues.push(`${where}: could not derive a slug from "${entry.name}"`);
        return;
      }
      cities.push({
        slug,
        name: entry.name.trim(),
        state: isNonEmptyString(entry.state) ? entry.state.trim() : '',
        ...(isNonEmptyString(entry.stateName) ? { stateName: entry.stateName.trim() } : {}),
        population: typeof entry.population === 'number' ? entry.population : 0,
        ...(isStringArray(entry.facts) ? { facts: entry.facts } : {}),
        ...(isStringArray(entry.neighborhoods) ? { neighborhoods: entry.neighborhoods } : {}),
        ...(isStringArray(entry.nearbyCities) ? { nearbyCities: entry.nearbyCities } : {}),
        ...(typeof entry.lat === 'number' ? { lat: entry.lat } : {}),
        ...(typeof entry.lng === 'number' ? { lng: entry.lng } : {}),
      });
    });
  }

  // --- slug collisions ---
  for (const [label, list] of [
    ['service', services.map((s) => s.slug as string)],
    ['city', cities.map((c) => c.slug as string)],
  ] as const) {
    const seen = new Set<string>();
    for (const slug of list) {
      if (seen.has(slug)) issues.push(`duplicate ${label} slug "${slug}" — every ${label} must map to a unique URL segment`);
      seen.add(slug);
    }
  }

  // --- routing ---
  const routing: RoutingRule[] = [];
  if (raw.routing !== undefined) {
    if (!Array.isArray(raw.routing)) {
      issues.push('routing: must be an array when present');
    } else {
      raw.routing.forEach((entry, i) => {
        const where = `routing[${i}]`;
        if (!isRecord(entry)) {
          issues.push(`${where}: must be an object`);
          return;
        }
        if (!isNonEmptyString(entry.id)) issues.push(`${where}.id: required non-empty string`);
        if (!isNonEmptyString(entry.businessName)) issues.push(`${where}.businessName: required non-empty string`);
        if (!isNonEmptyString(entry.contactEmail) || !entry.contactEmail.includes('@')) {
          issues.push(`${where}.contactEmail: required email-shaped string`);
        }
        if (!isStringArray(entry.serviceSlugs) || entry.serviceSlugs.length === 0) {
          issues.push(`${where}.serviceSlugs: required non-empty string array (use ["*"] for all)`);
        }
        if (!isStringArray(entry.citySlugs) || entry.citySlugs.length === 0) {
          issues.push(`${where}.citySlugs: required non-empty string array (use ["*"] for all)`);
        }
        if (!isNonEmptyString(entry.id) || !isNonEmptyString(entry.businessName)) return;
        routing.push({
          id: entry.id.trim(),
          businessName: entry.businessName.trim(),
          contactEmail: isNonEmptyString(entry.contactEmail) ? entry.contactEmail.trim() : '',
          serviceSlugs: isStringArray(entry.serviceSlugs) ? entry.serviceSlugs : [],
          citySlugs: isStringArray(entry.citySlugs) ? entry.citySlugs : [],
          ...(typeof entry.priority === 'number' ? { priority: entry.priority } : {}),
          ...(typeof entry.active === 'boolean' ? { active: entry.active } : {}),
        });
      });
    }
  }

  if (raw.fallbackEmail !== undefined && (!isNonEmptyString(raw.fallbackEmail) || !raw.fallbackEmail.includes('@'))) {
    issues.push('fallbackEmail: must be an email-shaped string when present');
  }

  if (issues.length > 0) throw new ConfigError(issues);

  return {
    site,
    services,
    cities,
    ...(routing.length > 0 ? { routing } : {}),
    ...(isNonEmptyString(raw.fallbackEmail) ? { fallbackEmail: raw.fallbackEmail.trim() } : {}),
  };
}

/** Parse a JSON string and validate it into a LeadGenConfig. */
export function parseConfig(json: string): LeadGenConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (err) {
    throw new ConfigError([`not valid JSON: ${(err as Error).message}`]);
  }
  return validateConfig(raw);
}

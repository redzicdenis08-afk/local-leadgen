/**
 * local-leadgen — programmatic local-SEO page engine (reference
 * implementation). See README.md for the full story.
 */

export {
  ConfigError,
  parseConfig,
  slugify,
  validateConfig,
  type CityConfig,
  type LeadGenConfig,
  type RoutingRule,
  type ServiceConfig,
  type SiteConfig,
} from './config.js';

export {
  buildMatrix,
  buildPageEntry,
  fnv1a,
  interpolate,
  TEMPLATE_BANK_SIZES,
  type PageEntry,
} from './matrix.js';

export {
  assemblePage,
  assembleSite,
  renderHtml,
  type FaqItem,
  type PageContent,
  type PageSection,
} from './content.js';

export {
  breadcrumbJsonLd,
  escapeHtml,
  faqPageJsonLd,
  localBusinessJsonLd,
  serviceJsonLd,
  validateJsonLd,
  type JsonLd,
  type SchemaInput,
  type SchemaValidationResult,
} from './schema.js';

export {
  buildRobotsTxt,
  buildSitemapFiles,
  SITEMAP_MAX_URLS,
  sitemapUrlsFromConfig,
  type BuildSitemapOptions,
  type ChangeFreq,
  type RobotsOptions,
  type SitemapFile,
  type SitemapUrl,
} from './sitemap.js';

export {
  routeLead,
  validateLead,
  type AuditEvent,
  type Lead,
  type LeadChannel,
  type LeadPayload,
  type LeadValidationResult,
  type RoutingResult,
} from './leads.js';

# local-leadgen

**Programmatic local-SEO page engine for the rank-and-rent model — page-matrix generation, deterministic content assembly, schema.org markup, sitemap chunking, and lead routing.**

[![CI](https://github.com/redzicdenis08-afk/local-leadgen/actions/workflows/ci.yml/badge.svg)](https://github.com/redzicdenis08-afk/local-leadgen/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node 18+](https://img.shields.io/badge/node-18%2B-brightgreen.svg)](https://nodejs.org/)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

> This is the open-source **reference implementation** of the engine behind a production rank-and-rent operation (Next.js sites on AWS, AI content pipeline, voice receptionist, renter billing). The production sites, domains, datasets, and deploy configs stay private; this repo contains the core generation and routing logic, rebuilt cleanly as a zero-dependency TypeScript package.

## What this is

Give it one JSON config — services, cities, a site identity, and routing rules — and it produces everything a programmatic local-services site needs:

- **Page matrix** — one page per service × city, with slugs, canonical URLs, and title/meta/H1 copy that *varies* across the matrix instead of find-and-replacing the city name.
- **Page content** — structured sections (intro, service details, local trust block, FAQ) assembled deterministically from template banks + local facts, output as JSON and rendered HTML.
- **schema.org JSON-LD** — LocalBusiness, Service, FAQPage, and BreadcrumbList markup per page, with a structural validator.
- **sitemap.xml + robots.txt** — including automatic chunking + index generation past the 50,000-URL protocol cap.
- **Lead routing** — validate a captured lead (form or call) and route it to the renter business covering that city + service, with priority rules, fallback delivery, and a full audit trail.

Zero runtime dependencies. Pure `node:*` standard library. The only devDependencies are `typescript` and `@types/node`; tests run on the built-in `node:test` runner.

## The rank-and-rent model, honestly

Rank-and-rent is straightforward: build a local-services website that ranks organically for searches like *"gutter cleaning franklin tn"*, capture the quote requests it generates, and route those leads to a real local business that pays for them — per lead or as flat monthly "rent" for the site.

It works when it's done as **real arbitrage on real demand**: the homeowner gets a working path to a local provider, the provider gets customers cheaper than buying ads, and the site owner is paid for having built and ranked the asset. It fails — and deserves to fail — when it's done as doorway-page spam: thousands of identical pages with swapped city names, fake reviews, and fabricated business details. Search engines actively demote that (Google's scaled-content-abuse and doorway policies), and it burns the very rankings the model depends on.

This engine encodes the non-spam version as design constraints:

- **Template rotation + fact interpolation** instead of city-name find-and-replace (see below).
- **No fabricated review markup.** The schema validator *rejects* `aggregateRating` on LocalBusiness because emitting star ratings without real on-page reviews violates Google's review-snippet policy and risks a manual action.
- **Honest page framing.** The content templates present the site as a quote-request service that connects homeowners with an independent local provider — not as a fake contractor with fake credentials.
- **Leads are never silently dropped.** Routing has explicit fallback and an audit trail for every decision.

## Architecture

```
                       config.json  (services x cities, site, routing rules)
                            |
              +-------------+--------------+
              |                            |
              v                            v
        [ matrix.ts ]                [ leads.ts ]
   service x city expansion       validate + normalize
   slugs, canonical URLs          route by city+service
   rotating title/meta/H1         priority -> fallback
              |                   audit trail
              v                            |
        [ content.ts ]                     v
   deterministic sections          renter business
   intro / details / trust / FAQ   (or fallback inbox)
              |
      +-------+--------+
      |                |
      v                v
 [ schema.ts ]    [ sitemap.ts ]
 LocalBusiness    sitemap.xml
 Service          50k chunking + index
 FAQPage          robots.txt
 BreadcrumbList
      |                |
      +-------+--------+
              v
     JSON + HTML pages, ready for any renderer
     (Next.js, Astro, static files, ...)
```

The engine is renderer-agnostic on purpose: it emits structured JSON and plain HTML, so the production deployment can be a Next.js app today and something else tomorrow without touching the generation logic.

## Quickstart

```bash
git clone https://github.com/redzicdenis08-afk/local-leadgen.git
cd local-leadgen
npm install
npm run build
npm test          # 72 tests on node:test
```

Then point the CLI at the bundled synthetic example (3 services × 5 cities):

```bash
node dist/src/cli.js generate examples/config.json --out out
```

### Library usage

```ts
import { parseConfig, buildMatrix, assemblePage, renderHtml, routeLead, validateLead } from 'local-leadgen';
import { readFileSync } from 'node:fs';

const cfg = parseConfig(readFileSync('examples/config.json', 'utf8'));

const pages = buildMatrix(cfg);              // 15 PageEntry objects
const page  = assemblePage(cfg, cfg.services[0], cfg.cities[0]);
const html  = renderHtml(cfg, page);         // full document with JSON-LD in <head>

const { lead } = validateLead(JSON.parse(readFileSync('examples/lead.json', 'utf8')));
const result = routeLead(lead!, cfg);        // -> delivered, rule, audit[]
```

## CLI

### `generate` — expand the page matrix

```bash
node dist/src/cli.js generate examples/config.json --out out
```

```
Generated 15 pages (3 services x 5 cities) -> out/pages
  /window-cleaning/springfield  "Window Cleaning Springfield IL: Get a Same-Day Quote"
  /window-cleaning/fairview  "Residential Window Cleaning in Fairview, Oregon — Request a Free Quote"
  /window-cleaning/franklin  "Window Cleaning in Franklin, Tennessee — Request a Free Quote"
  /window-cleaning/greenville  "Window Cleaning in Greenville, SC | Free Local Quotes"
  /window-cleaning/bristol  "Window Cleaning Bristol CT: Get a Same-Day Quote"
  ... and 10 more
```

Note the titles: same service, five cities, and the copy rotates through distinct templates instead of repeating one pattern. Each page is written as both `pages/<service>/<city>.json` (structured sections) and `.html` (rendered document with LocalBusiness + Service + FAQPage JSON-LD). Add `--json` for machine-readable output.

A slice of the generated page JSON:

```json
{
  "path": "/gutter-cleaning/franklin",
  "title": "Franklin, TN Gutter Cleaning Quotes | No-Commitment Estimates",
  "metaDescription": "Free gutter cleaning quote requests for Franklin, TN. Most gutter damage happens in the first freeze after a leaf-filled autumn. Typical range $120–$450.",
  "h1": "Franklin Gutter Cleaning: Free Local Quotes",
  "templateIds": { "title": 5, "meta": 4, "h1": 2 }
}
```

That meta description contains a *city-specific fact* pulled from the config — this is the interpolation that keeps pages from being interchangeable.

### `sitemap` — sitemap.xml + robots.txt

```bash
node dist/src/cli.js sitemap examples/config.json --out out
```

```
Wrote 1 sitemap file(s) covering 19 URLs + robots.txt -> out
```

Below 50,000 URLs you get a single `sitemap.xml`. Above it, the engine emits `sitemap-1.xml`, `sitemap-2.xml`, … plus a `sitemap.xml` index that references every chunk — the layout the sitemap protocol requires and large programmatic sites actually need. Both boundaries (exactly 50,000 and 50,001) are covered by tests.

### `route` — deliver a lead

```bash
node dist/src/cli.js route examples/lead.json --config examples/config.json
```

```
Lead lead_20260701143000_0001: Franklin Gutter Co. <office@franklin-gutter.example.com>
  [received] lead lead_20260701143000_0001 (form) for gutter-cleaning in franklin
  [rule_no_match] rule springfield-pro-exteriors does not cover gutter-cleaning/franklin
  [rule_matched] rule franklin-gutter-co (Franklin Gutter Co.) covers gutter-cleaning/franklin, priority 10
  [rule_no_match] rule statewide-wash-network does not cover gutter-cleaning/franklin
  [rule_skipped_inactive] rule paused-renter is inactive
  [routed] delivered to Franklin Gutter Co. <office@franklin-gutter.example.com> via rule franklin-gutter-co
```

Every routing decision is recorded — when a renter asks "why did I get this lead?" (or "why didn't I?"), the answer is in the audit trail, not a log archaeology session. Rules match on service + city (`"*"` wildcards supported), lowest priority number wins, inactive rules are skipped, and unmatched leads fall back to a configured inbox instead of disappearing.

## Design principles

1. **Deterministic by construction.** Output is a pure function of the config: no randomness, no clock reads in the generation path, no environment sniffing. The same config yields byte-identical pages, which makes builds reproducible, diffs reviewable, and caching trivial. Template "rotation" is a deterministic FNV-1a hash of `(service, city, field)` — variety across the matrix, stability across builds.

2. **Duplication avoidance is a first-class feature, not an afterthought.** Titles, metas, H1s, section copy, and even FAQ ordering rotate through independent template banks, and templates interpolate concrete local data (population, price bands, city facts, service facts, neighborhoods). Tests assert that every title/meta/H1 in a matrix is unique and that multiple templates are actually exercised.

3. **SEO-correct markup over SEO-aggressive markup.** JSON-LD follows the rules that keep rich results alive long-term: no fabricated `aggregateRating`, geo coordinates only when the config really has them, breadcrumbs that match the actual URL hierarchy. `validateJsonLd` enforces the invariants that break rich results in practice.

4. **Zero runtime dependencies.** Everything is `node:*` built-ins. Nothing to audit, nothing to break on install, runs anywhere Node 18+ runs.

5. **Fail loud, fail listed.** Config validation reports *every* problem at once (not just the first), unknown template placeholders throw instead of leaking `{braces}` into production pages, and undeliverable leads are explicit, audited outcomes.

## Repository layout

```
src/
  config.ts    config model, validation, slug generation
  matrix.ts    service x city expansion, template rotation, canonical URLs
  content.ts   section assembly (intro/details/trust/FAQ) + HTML rendering
  schema.ts    JSON-LD generators + structural validator + HTML escaping
  sitemap.ts   sitemap chunking/index + robots.txt
  leads.ts     lead validation, normalization, routing + audit trail
  cli.ts       generate / sitemap / route commands
  index.ts     public exports
tests/         node:test suite (72 tests)
examples/      synthetic config (3 services x 5 cities), sample lead,
               and generated sample output
```

Everything in `examples/` is synthetic: `example.com` domains, fictional businesses, placeholder phone numbers. No production domains, keys, or lead data appear anywhere in this repo.

## What the production system adds (and keeps private)

This reference implementation is the deterministic core. The production operation layers on top of it: AI-generated long-form content per page (with shape and safety validation before anything ships), Next.js rendering with internal linking and localization, IndexNow pings, Lighthouse budgets, an AI voice receptionist for call leads, renter acquisition outreach, billing, and multi-site EC2 deployment. Those stay private because they embody the operational edge — but every one of them consumes the same data shapes you see here.

## Contributing

Issues and PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Run the whole suite with `npm test`.

## Demo script

A short demo plan for launch screenshots and GIFs lives in [docs/DEMO.md](docs/DEMO.md).

## Star this repo if

- You build in this niche and want a small reference engine instead of a black-box demo.
- You want synthetic examples that run locally.
- You care about readable implementation details, not just screenshots.

Launch notes and topic suggestions live in [docs/LAUNCH_PACK.md](docs/LAUNCH_PACK.md).

## Repository health

This repo now includes GitHub issue templates, a PR checklist, Dependabot checks for GitHub Actions, and a public boundary checklist in [docs/REPO_HEALTH.md](docs/REPO_HEALTH.md).

## License

[MIT](LICENSE) © Denis Redzic

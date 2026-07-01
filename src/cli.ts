#!/usr/bin/env node
/**
 * local-leadgen CLI.
 *
 *   local-leadgen generate <config.json> [--out <dir>] [--json]
 *   local-leadgen sitemap  <config.json> [--out <dir>] [--json]
 *   local-leadgen route    <lead.json> --config <config.json> [--json]
 *
 * `--json` prints machine-readable output to stdout instead of the
 * human summary (and skips writing files for `generate`/`sitemap`
 * unless `--out` is also given).
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { ConfigError, parseConfig, type LeadGenConfig } from './config.js';
import { buildMatrix } from './matrix.js';
import { assembleSite, renderHtml } from './content.js';
import { buildRobotsTxt, buildSitemapFiles, sitemapUrlsFromConfig } from './sitemap.js';
import { routeLead, validateLead } from './leads.js';

const USAGE = `local-leadgen — programmatic local-SEO page engine (reference implementation)

Usage:
  local-leadgen generate <config.json> [--out <dir>] [--json]
  local-leadgen sitemap  <config.json> [--out <dir>] [--json]
  local-leadgen route    <lead.json> --config <config.json> [--json]

Commands:
  generate   Expand the service x city page matrix and write page JSON + HTML
  sitemap    Write sitemap.xml (chunked past 50k URLs) and robots.txt
  route      Validate a captured lead and route it to a renter business

Options:
  --out <dir>       Output directory (default: ./out)
  --config <file>   Config file for the route command
  --json            Print machine-readable JSON to stdout
  --help            Show this help
`;

interface ParsedArgs {
  command?: string;
  positional: string[];
  out?: string;
  config?: string;
  json: boolean;
  help: boolean;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = { positional: [], json: false, help: false };
  const rest = [...argv];
  while (rest.length > 0) {
    const arg = rest.shift() as string;
    if (arg === '--json') parsed.json = true;
    else if (arg === '--help' || arg === '-h') parsed.help = true;
    else if (arg === '--out') parsed.out = rest.shift();
    else if (arg === '--config') parsed.config = rest.shift();
    else if (arg.startsWith('--')) throw new Error(`Unknown option: ${arg}`);
    else if (!parsed.command) parsed.command = arg;
    else parsed.positional.push(arg);
  }
  return parsed;
}

function loadConfigFile(file: string): LeadGenConfig {
  return parseConfig(fs.readFileSync(file, 'utf8'));
}

function writeFile(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

function commandGenerate(args: ParsedArgs): number {
  const configPath = args.positional[0] ?? args.config;
  if (!configPath) {
    process.stderr.write('generate: missing <config.json>\n');
    return 2;
  }
  const cfg = loadConfigFile(configPath);
  const pages = assembleSite(cfg);

  if (args.json && !args.out) {
    process.stdout.write(JSON.stringify({ pageCount: pages.length, pages }, null, 2) + '\n');
    return 0;
  }

  const outDir = args.out ?? 'out';
  for (const page of pages) {
    const base = path.join(outDir, 'pages', page.entry.serviceSlug, page.entry.citySlug);
    writeFile(`${base}.json`, JSON.stringify(page, null, 2) + '\n');
    writeFile(`${base}.html`, renderHtml(cfg, page));
  }

  if (args.json) {
    process.stdout.write(
      JSON.stringify(
        { pageCount: pages.length, outDir, paths: pages.map((p) => p.entry.path) },
        null,
        2,
      ) + '\n',
    );
  } else {
    process.stdout.write(
      `Generated ${pages.length} pages (${cfg.services.length} services x ${cfg.cities.length} cities) -> ${outDir}${path.sep}pages\n`,
    );
    for (const page of pages.slice(0, 5)) {
      process.stdout.write(`  ${page.entry.path}  "${page.entry.title}"\n`);
    }
    if (pages.length > 5) process.stdout.write(`  ... and ${pages.length - 5} more\n`);
  }
  return 0;
}

function commandSitemap(args: ParsedArgs): number {
  const configPath = args.positional[0] ?? args.config;
  if (!configPath) {
    process.stderr.write('sitemap: missing <config.json>\n');
    return 2;
  }
  const cfg = loadConfigFile(configPath);
  const urls = sitemapUrlsFromConfig(cfg);
  const files = buildSitemapFiles(urls, { baseUrl: cfg.site.baseUrl });
  const robots = buildRobotsTxt({
    baseUrl: cfg.site.baseUrl,
    sitemaps: [files[0]?.filename ?? 'sitemap.xml'],
  });

  if (args.json && !args.out) {
    process.stdout.write(
      JSON.stringify(
        { urlCount: urls.length, files: files.map((f) => f.filename), robots },
        null,
        2,
      ) + '\n',
    );
    return 0;
  }

  const outDir = args.out ?? 'out';
  for (const file of files) writeFile(path.join(outDir, file.filename), file.xml);
  writeFile(path.join(outDir, 'robots.txt'), robots);

  if (args.json) {
    process.stdout.write(
      JSON.stringify({ urlCount: urls.length, outDir, files: files.map((f) => f.filename) }, null, 2) + '\n',
    );
  } else {
    process.stdout.write(
      `Wrote ${files.length} sitemap file(s) covering ${urls.length} URLs + robots.txt -> ${outDir}\n`,
    );
  }
  return 0;
}

function commandRoute(args: ParsedArgs): number {
  const leadPath = args.positional[0];
  if (!leadPath) {
    process.stderr.write('route: missing <lead.json>\n');
    return 2;
  }
  if (!args.config) {
    process.stderr.write('route: missing --config <config.json>\n');
    return 2;
  }
  const cfg = loadConfigFile(args.config);

  let rawLead: unknown;
  try {
    rawLead = JSON.parse(fs.readFileSync(leadPath, 'utf8'));
  } catch (err) {
    process.stderr.write(`route: could not read lead file: ${(err as Error).message}\n`);
    return 2;
  }

  const validation = validateLead(rawLead);
  if (!validation.ok || !validation.lead) {
    if (args.json) {
      process.stdout.write(JSON.stringify({ ok: false, errors: validation.errors }, null, 2) + '\n');
    } else {
      process.stderr.write(`route: invalid lead:\n  - ${validation.errors.join('\n  - ')}\n`);
    }
    return 1;
  }

  const result = routeLead(validation.lead, cfg);
  if (args.json) {
    process.stdout.write(JSON.stringify({ ok: true, result }, null, 2) + '\n');
  } else {
    const dest = result.delivered
      ? result.usedFallback
        ? `FALLBACK <${result.deliveredTo}>`
        : `${result.rule?.businessName} <${result.deliveredTo}>`
      : 'UNDELIVERABLE (no matching rule, no fallback configured)';
    process.stdout.write(`Lead ${result.leadId}: ${dest}\n`);
    for (const event of result.audit) {
      process.stdout.write(`  [${event.event}] ${event.detail}\n`);
    }
  }
  return result.delivered ? 0 : 1;
}

export function main(argv: string[]): number {
  let args: ParsedArgs;
  try {
    args = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n\n${USAGE}`);
    return 2;
  }

  if (args.help || !args.command) {
    process.stdout.write(USAGE);
    return args.help ? 0 : 2;
  }

  try {
    switch (args.command) {
      case 'generate':
        return commandGenerate(args);
      case 'sitemap':
        return commandSitemap(args);
      case 'route':
        return commandRoute(args);
      default:
        process.stderr.write(`Unknown command: ${args.command}\n\n${USAGE}`);
        return 2;
    }
  } catch (err) {
    if (err instanceof ConfigError) {
      process.stderr.write(`${err.message}\n`);
      return 1;
    }
    process.stderr.write(`Error: ${(err as Error).message}\n`);
    return 1;
  }
}

// Only run when executed directly (not when imported by tests).
const isDirectRun = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  process.exit(main(process.argv.slice(2)));
}

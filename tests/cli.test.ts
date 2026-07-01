import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// dist/tests/cli.test.js -> repo root is two levels up.
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const CLI = path.join(ROOT, 'dist', 'src', 'cli.js');
const CONFIG = path.join(ROOT, 'examples', 'config.json');
const LEAD = path.join(ROOT, 'examples', 'lead.json');

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

function runCli(args: string[]): RunResult {
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
    return { status: 0, stdout, stderr: '' };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { status: e.status ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

test('cli --help prints usage and exits 0', () => {
  const result = runCli(['--help']);
  assert.equal(result.status, 0);
  assert.ok(result.stdout.includes('Usage:'));
  assert.ok(result.stdout.includes('generate'));
});

test('cli with no command prints usage and exits non-zero', () => {
  const result = runCli([]);
  assert.notEqual(result.status, 0);
});

test('cli generate --json emits the full page matrix', () => {
  const result = runCli(['generate', CONFIG, '--json']);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout) as { pageCount: number; pages: unknown[] };
  assert.equal(parsed.pageCount, 15); // 3 services x 5 cities
  assert.equal(parsed.pages.length, 15);
});

test('cli generate writes page JSON and HTML files', () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'leadgen-gen-'));
  try {
    const result = runCli(['generate', CONFIG, '--out', outDir]);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.includes('Generated 15 pages'));
    const json = path.join(outDir, 'pages', 'window-cleaning', 'springfield.json');
    const html = path.join(outDir, 'pages', 'window-cleaning', 'springfield.html');
    assert.ok(fs.existsSync(json), 'page JSON missing');
    assert.ok(fs.existsSync(html), 'page HTML missing');
    assert.ok(fs.readFileSync(html, 'utf8').includes('application/ld+json'));
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

test('cli sitemap --json reports URL count and files', () => {
  const result = runCli(['sitemap', CONFIG, '--json']);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout) as { urlCount: number; files: string[]; robots: string };
  assert.equal(parsed.urlCount, 1 + 3 + 15); // homepage + service hubs + matrix
  assert.deepEqual(parsed.files, ['sitemap.xml']);
  assert.ok(parsed.robots.includes('Sitemap: https://example.com/sitemap.xml'));
});

test('cli sitemap writes sitemap.xml and robots.txt', () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'leadgen-map-'));
  try {
    const result = runCli(['sitemap', CONFIG, '--out', outDir]);
    assert.equal(result.status, 0, result.stderr);
    const xml = fs.readFileSync(path.join(outDir, 'sitemap.xml'), 'utf8');
    assert.ok(xml.includes('<urlset'));
    assert.ok(xml.includes('https://example.com/gutter-cleaning/bristol'));
    assert.ok(fs.existsSync(path.join(outDir, 'robots.txt')));
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

test('cli route --json routes the example lead to the right renter', () => {
  const result = runCli(['route', LEAD, '--config', CONFIG, '--json']);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout) as {
    ok: boolean;
    result: { delivered: boolean; rule?: { id: string }; audit: unknown[] };
  };
  assert.equal(parsed.ok, true);
  assert.equal(parsed.result.delivered, true);
  assert.equal(parsed.result.rule?.id, 'franklin-gutter-co');
  assert.ok(parsed.result.audit.length >= 2);
});

test('cli route rejects an invalid lead with exit code 1', () => {
  const tmp = path.join(os.tmpdir(), `leadgen-bad-lead-${Date.now()}.json`);
  fs.writeFileSync(tmp, JSON.stringify({ channel: 'form', phone: '123' }), 'utf8');
  try {
    const result = runCli(['route', tmp, '--config', CONFIG, '--json']);
    assert.equal(result.status, 1);
    const parsed = JSON.parse(result.stdout) as { ok: boolean; errors: string[] };
    assert.equal(parsed.ok, false);
    assert.ok(parsed.errors.length >= 2);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
});

test('cli rejects unknown options with usage help', () => {
  const result = runCli(['generate', CONFIG, '--bogus']);
  assert.equal(result.status, 2);
  assert.ok(result.stderr.includes('Unknown option: --bogus'));
});

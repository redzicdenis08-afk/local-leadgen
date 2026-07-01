# Contributing

Issues and pull requests are welcome. This is a reference implementation, so the bar for changes is: does it make the engine clearer, more correct, or better tested?

## Setup

```bash
git clone https://github.com/redzicdenis08-afk/local-leadgen.git
cd local-leadgen
npm install
npm run build
npm test
```

No runtime dependencies — the only devDependencies are `typescript` and `@types/node`, and tests run on the built-in `node:test` runner. Please keep it that way; PRs that add runtime dependencies will be asked to justify them hard.

## Ground rules

- **Determinism is a feature.** The same config must always produce byte-identical output. If your change introduces randomness, clock reads, or environment-dependent behavior in the generation path, gate it behind an explicit parameter (see how `routeLead` accepts an injectable `now`).
- **Tests come with the change.** New behavior needs a test in `tests/`; bug fixes need a regression test that fails without the fix.
- **No real-world data.** Examples and fixtures must stay synthetic: `example.com` domains, fictional businesses, no real phone numbers, no scraped city datasets.
- **SEO claims must be defensible.** If you add markup or content behavior, keep it inside search-engine guidelines (no fabricated review markup, no doorway-page shortcuts). Comments in `src/schema.ts` and `src/matrix.ts` explain the existing policy decisions.

## Workflow

1. Fork and branch from `main`.
2. Make the change; run `npm test` (build + full suite).
3. Open a PR describing what changed and why.

CI runs the suite on Node 18, 20, and 22 — a PR needs all three green.

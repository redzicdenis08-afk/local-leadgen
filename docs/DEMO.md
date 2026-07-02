# Demo

This is the fastest way to show why local-leadgen is worth starring. Use fictional example data only.

## Run it

```bash
npm install
npm run build
node dist/src/cli.js generate examples/config.json --out out
node dist/src/cli.js sitemap examples/config.json --out out
node dist/src/cli.js route examples/lead.json --config examples/config.json
```

## What to screenshot

Generated service-city pages, unique metadata, JSON-LD, sitemap, robots file, and lead routing audit trail.

A good launch screenshot should show the command and the useful output in one image. Avoid giant terminal dumps.

## 30-second narration

1. Say the pain this repo solves.
2. Run the command.
3. Point at the output that proves it works.
4. Mention that the examples are fictional and the engine is inspectable.

## Good caption

This is the whole point of local-leadgen: small input in, useful decision output, no black-box dashboard needed.

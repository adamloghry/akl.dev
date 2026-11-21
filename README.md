# akl.dev

https://akl.dev

Astro static site, Nix flake dev env, deployed as a Cloudflare Worker serving static assets.

```
nix develop --impure
npm run dev
npm run build
npm run verify
npm run test:bombadil
```

The Bombadil run explores theme, build-info, reload, and viewport transitions for 30 seconds against the local `dist/` build. It saves a replayable trace under ignored `tmp/`; set `BOMBADIL_TIME_LIMIT` to run longer.

See [AGENTS.md](AGENTS.md) for the full layout, CSP, deploy, and dev-environment details, and [docs/runbook.md](docs/runbook.md) for the owner's cutover checklist.

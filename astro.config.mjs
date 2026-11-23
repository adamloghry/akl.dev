// astro.config.mjs — static output for Cloudflare Pages (no adapter needed for a static site).
// Stylesheets are never inlined so style-src can stay 'self'; inline script hashes are written
// into dist/_headers by integrations/csp-hashes.mjs.
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import cspHashes from './integrations/csp-hashes.mjs';

export default defineConfig({
  site: 'https://akl.dev',
  output: 'static',
  trailingSlash: 'ignore',
  integrations: [sitemap(), cspHashes()],
  // format 'preserve' emits keys.astro as keys.html, which Cloudflare serves at /keys with no redirect
  // (Mastodon's rel="me" check fetches exactly https://akl.dev/keys).
  build: { inlineStylesheets: 'never', format: 'preserve' },
});

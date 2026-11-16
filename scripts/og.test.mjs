// The X link card: every tag a card needs, and an image that is a real 1200x630 PNG served from our own origin.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
const png = readFileSync(new URL('../web/public/og.png', import.meta.url));
const meta = (key) => new RegExp(`<meta (?:property|name)="${key}" content="([^"]+)"`).exec(html)?.[1];

test('link card tags are present and point at our origin', () => {
  for (const key of ['og:title', 'og:description', 'og:image', 'og:url', 'twitter:card', 'theme-color']) assert.ok(meta(key), `${key} missing`);
  assert.equal(meta('twitter:card'), 'summary_large_image');
  assert.match(meta('og:image'), /^https:\/\/cart-checkout-near\.vercel\.app\/og\.png$/);
});

test('og.png is a 1200x630 PNG', () => {
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
});

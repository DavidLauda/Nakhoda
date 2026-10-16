/**
 * Rebuild exact-size PWA assets without changing the supplied logo artwork.
 * First import: node scripts/generate-pwa-icons.mjs <dark-logo.png> <light-logo.png>
 * Rebuild from checked-in originals: node scripts/generate-pwa-icons.mjs
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const brand = new URL('../public/brand/', import.meta.url);
const icons = new URL('../public/icons/', import.meta.url);
mkdirSync(brand, { recursive: true });
mkdirSync(icons, { recursive: true });
const originals = ['nakhoda-dark.png', 'nakhoda-light.png'];
const inputs = process.argv.slice(2);
if (inputs.length !== 0 && inputs.length !== 2) throw new Error('Supply both dark and light PNG paths, or neither.');
for (const [i, input] of inputs.entries()) copyFileSync(input, new URL(originals[i], brand));

const source = fileURLToPath(new URL('nakhoda-light.png', brand));
const background = '#0b2a3c';
for (const size of [32, 180, 192, 512]) {
  const name = size === 32 ? 'favicon-32.png' : size === 180 ? 'apple-touch-icon.png' : `pwa-${size}.png`;
  await sharp(source).resize(size, size).flatten({ background }).png().toFile(fileURLToPath(new URL(name, icons)));
}
// The complete helm stays inside the circular safe zone (radius 40% of width).
const inset = await sharp(source).resize(384, 384).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 3, background } })
  .composite([{ input: inset, left: 64, top: 64 }]).png()
  .toFile(fileURLToPath(new URL('pwa-maskable-512.png', icons)));
console.log('Generated 192px, 512px, maskable, Apple touch and favicon PNG assets.');

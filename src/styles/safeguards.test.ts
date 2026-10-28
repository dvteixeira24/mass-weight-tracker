import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const css = (p: string) => readFileSync(join(root, p), 'utf8');
const all = () =>
  css('src/styles/tokens.css') +
  css('src/styles/globals.css') +
  css('src/components/AppShell.css') +
  css('src/components/PeriodPicker.css');

describe('responsive/a11y safeguards', () => {
  test('palette matches artboards; no horizontal-overflow risks', () => {
    const s = all();
    for (const hex of ['#151917', '#1d2420', '#343d35', '#f2f3eb', '#c5f17c']) {
      expect(s).toContain(hex);
    }
    expect(s).toMatch(/max-width:\s*var\(--mass-content-max\)/); // shell capped at 480
    expect(s).toMatch(/\.chart-wrap svg\s*\{[^}]*width:\s*100%/); // chart fluid
    expect(s).toContain('env(safe-area-inset-bottom)'); // nav/sheet clearance
  });
  test('touch targets, focus, reduced motion', () => {
    const s = all();
    expect(s).toContain('--mass-touch-target: 44px');
    expect(s).toContain(':focus-visible');
    expect(s).toContain('prefers-reduced-motion');
    expect(s).toContain('tabular-nums');
  });
  test('viewport meta + no external fonts', () => {
    const html = css('index.html');
    expect(html).toContain('width=device-width');
    expect(html).toContain('viewport-fit=cover');
    expect(html).toContain('rel="manifest"');
    expect(html).toContain('name="theme-color"');
    expect(all()).not.toMatch(/googleapis|gstatic/);
  });
  test('pwa basics present', () => {
    const manifest = JSON.parse(css('public/manifest.webmanifest'));
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/');
    expect(manifest.theme_color).toBe('#151917');
    const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
    expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true);
    const sw = css('public/sw.js');
    expect(sw).toContain('skipWaiting');
    expect(sw).toContain("caches.match('/')");
    expect(sw).not.toMatch(/push|sync|analytics/);
  });
});

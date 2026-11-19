// Builds Vercel "Build Output API" v3 for the DEMO deployment:
//   .vercel/output/static            ← apps/web/dist (SPA)
//   .vercel/output/functions/api.func ← bundled Fastify API (demo data, simulated payments)
import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'esbuild';

const out = '.vercel/output';
const fn = join(out, 'functions/api.func');
rmSync(out, { recursive: true, force: true });

console.log('[vercel-build] web');
execSync('npm run build -w @ebooking/web', { stdio: 'inherit' });
mkdirSync(join(out, 'static'), { recursive: true });
cpSync('apps/web/dist', join(out, 'static'), { recursive: true });

console.log('[vercel-build] api function');
await build({
  entryPoints: ['apps/api/src/vercel-handler.ts'],
  outfile: join(fn, 'index.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: ['@electric-sql/pglite', 'pg', 'pg-native'],
  banner: { js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" },
  logLevel: 'warning',
});
// PGlite loads its WASM/data files relative to its package, so ship the package as-is
cpSync('node_modules/@electric-sql/pglite', join(fn, 'node_modules/@electric-sql/pglite'), { recursive: true });
cpSync('supabase', join(fn, 'supabase'), { recursive: true, filter: (p) => !p.includes('tests') });
writeFileSync(join(fn, 'package.json'), JSON.stringify({ type: 'module' }));
writeFileSync(
  join(fn, '.vc-config.json'),
  JSON.stringify({ runtime: 'nodejs22.x', handler: 'index.mjs', launcherType: 'Nodejs', shouldAddHelpers: false, maxDuration: 60, memory: 1024, environment: { EBK_ROOT: '/var/task' } }, null, 2),
);

const security = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; manifest-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests",
};
writeFileSync(
  join(out, 'config.json'),
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: '^/api/(.*)$', dest: '/api' },
        { src: '^/(.*)$', headers: security, continue: true },
        { src: '^/assets/(.*)$', headers: { 'Cache-Control': 'public, max-age=31536000, immutable' }, continue: true },
        { handle: 'filesystem' },
        { src: '^/(.*)$', dest: '/index.html' },
      ],
    },
    null,
    2,
  ),
);
const kb = Math.round(readFileSync(join(fn, 'index.mjs')).length / 1024);
console.log(`[vercel-build] done (function bundle ${kb} KB)`);

import { readFileSync, writeFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { CALENDARKIT_BASE } from './src/data/address';

// gauntlet GT-5: the Slate kit (src/slate/kit.ts) as one ES module and its stylesheet in dist/slatekit/, with
// dist/slatekit/manifest.json ({ api, version, js, css }), built after the app (`npm run build`, emptyOutDir off).
// The gauntlet's whiteboard imports it at run time, so calendarkit's deploys reach its Slate widgets without a new pin.
//
// React is NOT bundled: the cards must render inside the page's own React tree (one React per page), so `react`,
// `react/jsx-runtime` and `react-dom` read the page's copies from globalThis.__calendarkitHost, which the page sets
// before importing the kit. Their names are listed here from this repo's React, the same major version (19).

const HOST = 'globalThis.__calendarkitHost';
const ident = (k: string) => /^[A-Za-z_$][\w$]*$/.test(k) && k !== 'default';
const named = (mod: object) => Object.keys(mod).filter(ident);
const SHIMS: Record<string, string> = {
  react: `const m = ${HOST}.react; export default m; export const { ${named(React).join(', ')} } = m;`,
  'react/jsx-runtime': `const m = ${HOST}.jsxRuntime; export const { jsx, jsxs, Fragment } = m;`,
  'react-dom': `const m = ${HOST}.reactDom; export default m; export const { ${named(ReactDOM).join(', ')} } = m;`,
};

function hostReact(): Plugin {
  return {
    name: 'calendarkit-host-react',
    enforce: 'pre',
    resolveId: (id) => (id in SHIMS ? `\0host:${id}` : null),
    load: (id) => (id.startsWith('\0host:') ? SHIMS[id.slice(6)] : null),
  };
}

function manifest(): Plugin {
  const version = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version;
  return {
    name: 'calendarkit-slatekit-manifest',
    // after the files are written (the stylesheet is only in the bundle by then)
    writeBundle(o, bundle) {
      const files = Object.values(bundle);
      const js = files.find((f) => f.type === 'chunk' && f.isEntry)?.fileName;
      const css = files.find((f) => f.type === 'asset' && f.fileName.endsWith('.css'))?.fileName;
      if (!js) throw new Error('slatekit: no entry chunk');
      const api = Number(/SLATEKIT_API = (\d+)/.exec(readFileSync('src/slate/kit.ts', 'utf8'))?.[1]);
      writeFileSync(`${o.dir}/slatekit/manifest.json`, JSON.stringify({ api, version, js: CALENDARKIT_BASE + js, css: css ? CALENDARKIT_BASE + css : null }, null, 1));
    },
  };
}

export default defineConfig({
  base: CALENDARKIT_BASE,
  plugins: [hostReact(), react({ jsxRuntime: 'automatic' }), manifest()],
  build: {
    // public/ is seen (the font's address resolves to /calendar/fonts/…) but not copied: the app's build did that
    copyPublicDir: false,
    outDir: 'dist',
    emptyOutDir: false,
    cssCodeSplit: false,
    rollupOptions: {
      input: { slatekit: 'src/slate/kit.ts' },
      preserveEntrySignatures: 'strict',
      output: {
        format: 'es',
        entryFileNames: 'slatekit/[name]-[hash].js',
        chunkFileNames: 'slatekit/[name]-[hash].js',
        assetFileNames: 'slatekit/[name]-[hash][extname]',
        inlineDynamicImports: true,
      },
    },
  },
});

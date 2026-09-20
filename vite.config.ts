import { defineConfig, loadEnv, build as viteBuild, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

import { cloudflare } from "@cloudflare/vite-plugin";
import { legalRollupInput, writeLegalHtmlPages } from './scripts/render-legal-pages.mjs';

const mpaInput = {
  main: 'index.html',
  marketing: 'marketing.html',
} as const;

/**
 * Rollup erzeugt bei zwei HTML-Entries in einem Durchlauf Shared-Chunks (React).
 * Das würde das App-Bundle (index-*.js) um >100 kB ändern. Deshalb: erst die App
 * allein, danach Marketing allein in denselben Client-Ausgabeordner.
 */
function isolatedMarketingBuild(): Plugin {
  let started = false;
  return {
    name: 'isolated-marketing-build',
    apply: 'build',
    enforce: 'post',
    async closeBundle() {
      if (process.env.OMLIFY_MARKETING_BUILD === '1' || started) return;
      // Mit Worker-Entry schliesst Vite die Worker-Umgebung vor der Client-Umgebung.
      // Marketing darf erst nach dem Client-Build laufen, sonst leert emptyOutDir es.
      const environmentName = this.environment?.name;
      if (environmentName && environmentName !== 'client') return;
      started = true;
      process.env.OMLIFY_MARKETING_BUILD = '1';
      await viteBuild();
    },
  };
}

/** Legal HTML has no JS entry; strip any script Vite might still inject. */
function stripLegalScripts(): Plugin {
  return {
    name: 'strip-legal-scripts',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const file = (ctx.filename ?? ctx.path ?? '').replaceAll('\\', '/');
        if (!file.includes('/legal/')) return html;
        return html.replace(/<script\b[\s\S]*?<\/script>/gi, '');
      },
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const supabaseUrl = env.VITE_SUPABASE_URL || 'https://mufxhtctutfpzklwqnze.supabase.co';
  const marketingBuild = process.env.OMLIFY_MARKETING_BUILD === '1';
  const includeLegalPages = command === 'serve' || marketingBuild;
  if (includeLegalPages) {
    writeLegalHtmlPages();
  }

  // Legal-HTML nur in Dev und im Marketing-Zweitbuild. Im App-Durchlauf
  // bleiben sie draussen, sonst entstaenden Shared-Chunks und das App-Bundle
  // wuerde sich aendern.
  const input =
    command === 'serve'
      ? { ...mpaInput, ...legalRollupInput }
      : marketingBuild
        ? { marketing: mpaInput.marketing, ...legalRollupInput }
        : { main: mpaInput.main };

  const clientRollupOptions = {
    input,
    output: {
      entryFileNames(chunkInfo: { name: string }) {
        if (chunkInfo.name === 'main') return 'assets/index-[hash].js';
        return 'assets/[name]-[hash].js';
      },
      assetFileNames(assetInfo: { names?: string[]; name?: string }) {
        const names = assetInfo.names ?? (assetInfo.name ? [assetInfo.name] : []);
        if (names.some((name) => name === 'main.css')) {
          return 'assets/index-[hash][extname]';
        }
        return 'assets/[name]-[hash][extname]';
      },
    },
  };

  return {
    plugins: [
      react(),
      ...(includeLegalPages ? [stripLegalScripts()] : []),
      ...(marketingBuild ? [] : [cloudflare(), isolatedMarketingBuild()]),
    ],
    optimizeDeps: {
      exclude: ['lucide-react'],
    },
    server: {
      // Tenant-Subdomains lokal: http://<slug>.localhost:5173 trifft denselben Dev-Server,
      // wird von Vite aber ohne diesen Eintrag wegen abweichendem Host-Header abgelehnt.
      allowedHosts: ['.localhost'],
      proxy: {
        '/api-supabase': {
          target: supabaseUrl,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api-supabase/, ''),
          secure: true,
        },
      },
    },
    build: {
      emptyOutDir: !marketingBuild,
      // Mit Worker-Entry schreibt das Cloudflare-Plugin die Client-Assets nach
      // dist/client/. Der isolierte Marketing-Build laeuft ohne das Plugin und
      // muss denselben Ordner treffen, sonst fehlt marketing.html im Deploy.
      outDir: marketingBuild ? 'dist/client' : 'dist',
      // Nur der Marketing-Zweitbuild (ohne Cloudflare-Plugin) nutzt die Root-rollupOptions.
      // Im ersten Durchlauf gehoeren sie in environments.client, sonst erbt die
      // Worker-Umgebung index.html als Entry und der Build bricht ab.
      ...(marketingBuild ? { rollupOptions: clientRollupOptions } : {}),
    },
    ...(!marketingBuild
      ? {
          environments: {
            client: {
              build: { rollupOptions: clientRollupOptions },
            },
          },
        }
      : {}),
  };
});

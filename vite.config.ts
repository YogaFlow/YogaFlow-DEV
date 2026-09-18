import { defineConfig, loadEnv, build as viteBuild, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

import { cloudflare } from "@cloudflare/vite-plugin";

const mpaInput = {
  main: 'index.html',
  marketing: 'marketing.html',
} as const;

/**
 * Rollup erzeugt bei zwei HTML-Entries in einem Durchlauf Shared-Chunks (React).
 * Das würde das App-Bundle (index-*.js) um >100 kB ändern. Deshalb: erst die App
 * allein, danach Marketing allein in dasselbe dist/.
 */
function isolatedMarketingBuild(): Plugin {
  let started = false;
  return {
    name: 'isolated-marketing-build',
    apply: 'build',
    enforce: 'post',
    async closeBundle() {
      if (process.env.OMLIFY_MARKETING_BUILD === '1' || started) return;
      started = true;
      process.env.OMLIFY_MARKETING_BUILD = '1';
      await viteBuild();
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const supabaseUrl = env.VITE_SUPABASE_URL || 'https://mufxhtctutfpzklwqnze.supabase.co';
  const marketingBuild = process.env.OMLIFY_MARKETING_BUILD === '1';

  const input =
    command === 'serve'
      ? mpaInput
      : marketingBuild
        ? { marketing: mpaInput.marketing }
        : { main: mpaInput.main };

  return {
    plugins: [
      react(),
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
      rollupOptions: {
        input,
        output: {
          entryFileNames(chunkInfo) {
            if (chunkInfo.name === 'main') return 'assets/index-[hash].js';
            return 'assets/[name]-[hash].js';
          },
          assetFileNames(assetInfo) {
            const names = assetInfo.names ?? (assetInfo.name ? [assetInfo.name] : []);
            if (names.some((name) => name === 'main.css')) {
              return 'assets/index-[hash][extname]';
            }
            return 'assets/[name]-[hash][extname]';
          },
        },
      },
    },
  };
});

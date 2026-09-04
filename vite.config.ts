import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

import { cloudflare } from "@cloudflare/vite-plugin";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const supabaseUrl = env.VITE_SUPABASE_URL || 'https://mufxhtctutfpzklwqnze.supabase.co';

  return {
    plugins: [react(), cloudflare()],
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
  };
});
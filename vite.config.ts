import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const landingSource = 'src/landing/plan-b.html';
const landingPage = 'plan-b.html';
// El prototipo de facturación se aparcó el 23/11/2026 (mega plan 2, fase C): queda en el commit 65a8e97.
const publicPages = new Map([[landingPage, landingSource]]);

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'plan-b-public-pages',
      configureServer(server) {
        server.middlewares.use((request, _response, next) => {
          const path = request.url?.split('?')[0] ?? '';
          const page = path.slice(1);
          const source = page && publicPages.get(page);
          if (source) request.url = request.url!.replace('/' + page, '/' + source);
          // Verifica tiene direcciones propias (/verifica, /verifica/encargos/:id/…): todas sirven su página, como en server/app.ts.
          else if (path === '/verifica' || path.startsWith('/verifica/')) request.url = '/verifica.html';
          next();
        });
      },
      generateBundle: {
        order: 'post',
        handler(_options, bundle) {
          for (const [output, source] of publicPages) {
            const page = bundle[source];
            if (page?.type !== 'asset') this.error(`No se generó el HTML de ${output}.`);
            this.emitFile({ type: 'asset', fileName: output, source: page.source });
            delete bundle[source];
          }
        },
      },
    },
  ],
  server: { host: '127.0.0.1', port: 5187, proxy: { '/api': 'http://127.0.0.1:4317' } },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: { input: { app: 'index.html', landing: landingSource, verifica: 'verifica.html' } },
  },
});

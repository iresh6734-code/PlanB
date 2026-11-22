import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const landingSource = 'src/landing/plan-b.html';
const landingPage = 'plan-b.html';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'plan-b-landing',
      configureServer(server) {
        server.middlewares.use((request, _response, next) => {
          if (request.url?.split('?')[0] === '/' + landingPage) {
            request.url = request.url.replace('/' + landingPage, '/' + landingSource);
          }
          next();
        });
      },
      generateBundle: {
        order: 'post',
        handler(_options, bundle) {
          const page = bundle[landingSource];
          if (page?.type !== 'asset') this.error('No se generó el HTML de la landing de Plan B.');
          this.emitFile({ type: 'asset', fileName: landingPage, source: page.source });
          delete bundle[landingSource];
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

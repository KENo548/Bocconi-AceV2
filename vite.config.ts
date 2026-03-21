import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import geminiHandler from './api/gemini';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  // Ensure API key is available to dev middleware
  if (env.GEMINI_API_KEY) process.env.GEMINI_API_KEY = env.GEMINI_API_KEY;
  if (env.GROQ_API_KEY) process.env.GROQ_API_KEY = env.GROQ_API_KEY;
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'local-api-gemini',
        configureServer(server) {
          server.middlewares.use('/api/gemini', async (req, res, next) => {
            // Helpful for browser devtools noise / CORS preflight
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

            if (req.method === 'OPTIONS') {
              res.statusCode = 204;
              res.end();
              return;
            }

            if (req.method === 'GET') {
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: true, message: 'Use POST for /api/gemini' }));
              return;
            }

            if (req.method !== 'POST') {
              res.statusCode = 405;
              res.end('Method Not Allowed');
              return;
            }
            try {
              const startedAt = Date.now();
              console.log(`[dev] /api/gemini ${req.method} start`);
              const chunks: Buffer[] = [];
              let ended = false;
              const timeout = setTimeout(() => {
                if (ended) return;
                ended = true;
                res.statusCode = 504;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Timeout in local /api/gemini middleware' }));
                console.warn('[dev] /api/gemini timeout after 300s');
              }, 300_000);

              req.on('data', (c) => chunks.push(Buffer.from(c)));
              req.on('error', (e) => {
                if (ended) return;
                ended = true;
                clearTimeout(timeout);
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: String(e) }));
                console.error('[dev] /api/gemini request stream error', e);
              });
              req.on('end', async () => {
                if (ended) return;
                const body = Buffer.concat(chunks).toString('utf8');
                console.log(`[dev] /api/gemini body bytes=${body.length}`);
                try {
                  const request = new Request('http://localhost/api/gemini', {
                    method: 'POST',
                    headers: { 'Content-Type': (req.headers['content-type'] as string) || 'application/json' },
                    body,
                  });
                  const response = await geminiHandler(request);
                  if (ended) return;
                  ended = true;
                  clearTimeout(timeout);
                  res.statusCode = response.status;
                  response.headers.forEach((value, key) => res.setHeader(key, value));
                  const text = await response.text();
                  res.end(text);
                  console.log(`[dev] /api/gemini done status=${response.status} in ${Date.now() - startedAt}ms`);
                } catch (e) {
                  if (ended) return;
                  ended = true;
                  clearTimeout(timeout);
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: String(e) }));
                  console.error('[dev] /api/gemini handler error', e);
                }
              });
            } catch (err) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: String(err) }));
            }
          });
        },
      },
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GROQ_API_KEY': JSON.stringify(env.GROQ_API_KEY ?? ''),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR can be disabled via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});

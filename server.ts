import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { initDatabase } from './server/db.ts';
import apiRoutes from './server/routes.ts';

async function startServer() {
  initDatabase();

  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  // Security headers compatible with embedded preview iframe
  app.use(
    helmet({
      contentSecurityPolicy: false,
      frameguard: false,
      crossOriginEmbedderPolicy: false,
    })
  );

  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'dinesense-feedback', timestamp: new Date().toISOString() });
  });

  app.use('/api', apiRoutes);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`DineSense Feedback server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start DineSense server:', err);
  process.exit(1);
});

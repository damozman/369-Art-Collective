// routes/index.ts
import { Application } from 'express';
import grokRoutes from './grok';

// You can add more routes here later
// import stripeRoutes from './stripe';
// import shopifyRoutes from './shopify';

export async function registerRoutes(app: Application) {
  // Register all API routes under /api
  app.use('/api', grokRoutes);

  // Add other route groups here
  // app.use('/api', stripeRoutes);
  // app.use('/api', shopifyRoutes);

  return app;
}
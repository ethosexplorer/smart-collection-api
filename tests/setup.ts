import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { collectionsRoutes } from '../src/routes/collections';

// Create a test-specific app instance
export function createTestApp() {
  const app = new Hono();

  // Global middleware
  app.use('*', cors());
  
  // Routes
  app.route('/collections', collectionsRoutes);

  // Health check
  app.get('/', (c) => c.json({ message: 'Test API' }));

  return app;
}

export const testApp = createTestApp();
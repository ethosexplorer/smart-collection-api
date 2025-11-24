import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { collectionsRoutes } from '../src/routes/collections';

// Create a test-specific app instance
export function createTestApp() {
  const app = new Hono();

  // Global middleware
  app.use('*', cors());
  
  // Test-specific middleware - USE REAL DATABASE for tests
  app.use('*', async (c, next) => {
    // Force real database for tests by not setting USE_MOCK_DB
    process.env.NODE_ENV = 'test';
    // Don't set USE_MOCK_DB so it uses real database
    await next();
  });
  
  // Routes
  app.route('/collections', collectionsRoutes);

  // Health check
  app.get('/', (c) => c.json({ message: 'Test API' }));

  return app;
}

export const testApp = createTestApp();
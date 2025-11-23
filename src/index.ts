import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { collectionsRoutes } from './routes/collections';

const app = new Hono();

// Global middleware
app.use('*', cors());
app.use('*', async (c, next) => {
  console.log(`${c.req.method} ${c.req.url}`);
  await next();
});

// Health check
app.get('/', (c) => c.json({ 
  message: 'Smart Collections API', 
  timestamp: new Date().toISOString() 
}));

// Routes
app.route('/collections', collectionsRoutes);

// 404 handler
app.notFound((c) => c.json({ error: 'Endpoint not found' }, 404));

// Global error handler
app.onError((err, c) => {
  console.error('Global error handler:', err);
  return c.json({ error: 'Internal server error' }, 500);
});

export default {
  port: 3000,
  fetch: app.fetch,
};

console.log('Smart Collections API running on http://localhost:3000');
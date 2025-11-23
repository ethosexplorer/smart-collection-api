import { createMiddleware } from 'hono/factory';

type Variables = {
  userId: string;
};

export const authMiddleware = createMiddleware<{ Variables: Variables }>(async (c, next) => {
  const userId = c.req.header('X-User-ID');
  
  if (!userId) {
    return c.json({ error: 'X-User-ID header is required' }, 401);
  }

  if (userId.length > 255) {
    return c.json({ error: 'User ID too long' }, 400);
  }

  c.set('userId', userId);
  await next();
});
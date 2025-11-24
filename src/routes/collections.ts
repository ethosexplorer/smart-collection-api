import { Hono } from 'hono';
import { db } from '../db';
import { collections, collectionItems, users } from '../db/schema';
import { eq, and, sql, count, desc, inArray } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth';
import { CreateCollectionSchema, AddItemSchema, MoveItemSchema } from '../models/types';
import { generateUniqueCollectionName } from '../utils/helpers';

type Variables = {
  userId: string;
};

// Error response helper
const errorResponse = (message: string, status: number = 400) => {
  return { error: message };
};

// Success response helper
const successResponse = (data: any, status: number = 200) => {
  return data;
};

export const collectionsRoutes = new Hono<{ Variables: Variables }>()
  .use('*', authMiddleware)

  // Create Collection
  .post('/', async (c) => {
    const userId = c.get('userId');
    
    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.json(errorResponse('Invalid JSON body'), 400);
    }

    const result = CreateCollectionSchema.safeParse(body);
    if (!result.success) {
      const firstError = result.error.issues[0];
      return c.json(errorResponse(firstError?.message || 'Invalid input'), 400);
    }

    const { name, description } = result.data;

    try {
      // Ensure user exists
      await db.insert(users).values({ id: userId }).onConflictDoNothing();

      const uniqueName = await generateUniqueCollectionName(userId, name);

      const [collection] = await db.insert(collections).values({
        name: uniqueName,
        description: description || null,
        userId,
      }).returning();

      return c.json(successResponse(collection), 201);

    } catch (error: any) {
      console.error('Error creating collection:', error);
      
      // Handle unique constraint violation
      if (error.code === '23505') {
        return c.json(errorResponse('Collection name already exists'), 409);
      }
      
      return c.json(errorResponse('Failed to create collection'), 500);
    }
  })

// List Collections with Relevance Score 
.get('/', async (c) => {
  const userId = c.get('userId');

  try {
    const collectionsWithScores = await db
      .select({
        id: collections.id,
        name: collections.name,
        description: collections.description,
        userId: collections.userId,
        createdAt: collections.createdAt,
        updatedAt: collections.updatedAt,
        itemCount: count(collectionItems.id),
        relevanceScore: sql<number>`
          COALESCE(
            SUM(
              CASE 
                WHEN ${collectionItems.note} IS NOT NULL AND TRIM(${collectionItems.note}) != '' THEN 2 
                ELSE 1 
              END
            ), 0
          )
        `,
      })
      .from(collections)
      .leftJoin(collectionItems, eq(collections.id, collectionItems.collectionId))
      .where(eq(collections.userId, userId))
      .groupBy(collections.id);

    // Sort in JavaScript by relevanceScore (descending) and then by updatedAt (descending)
    const sortedCollections = collectionsWithScores.sort((a:any, b:any) => {
      if (b.relevanceScore !== a.relevanceScore) {
        return b.relevanceScore - a.relevanceScore;
      }
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    return c.json(successResponse(sortedCollections));

  } catch (error: any) {
    console.error('Error listing collections:', error);
    return c.json(errorResponse('Failed to fetch collections'), 500);
  }
})

  // Get Collection by ID
  .get('/:id', async (c) => {
    const userId = c.get('userId');
    const collectionId = parseInt(c.req.param('id'));

    if (isNaN(collectionId) || collectionId <= 0) {
      return c.json(errorResponse('Invalid collection ID'), 400);
    }

    try {
      const collectionResults = await db
        .select()
        .from(collections)
        .where(and(
          eq(collections.userId, userId),
          eq(collections.id, collectionId)
        ));

      const collection = collectionResults[0];

      if (!collection) {
        return c.json(errorResponse('Collection not found'), 404);
      }

      // Get items for this collection
      const items = await db
        .select()
        .from(collectionItems)
        .where(eq(collectionItems.collectionId, collectionId))
        .orderBy(collectionItems.createdAt);

      return c.json(successResponse({
        ...collection,
        items,
        itemCount: items.length,
      }));

    } catch (error: any) {
      console.error('Error fetching collection:', error);
      return c.json(errorResponse('Failed to fetch collection'), 500);
    }
  })

  // Add Item to Collection
  .post('/:id/items', async (c) => {
    const userId = c.get('userId');
    const collectionId = parseInt(c.req.param('id'));
    
    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.json(errorResponse('Invalid JSON body'), 400);
    }

    const result = AddItemSchema.safeParse(body);
    if (!result.success) {
      const firstError = result.error.issues[0];
      return c.json(errorResponse(firstError?.message || 'Invalid input'), 400);
    }

    const { itemId, note } = result.data;

    if (isNaN(collectionId) || collectionId <= 0) {
      return c.json(errorResponse('Invalid collection ID'), 400);
    }

    try {
      // Verify collection exists and belongs to user
      const collectionResults = await db
        .select()
        .from(collections)
        .where(and(
          eq(collections.userId, userId),
          eq(collections.id, collectionId)
        ));

      const collection = collectionResults[0];

      if (!collection) {
        return c.json(errorResponse('Collection not found'), 404);
      }

      // Check if item already exists in collection
      const existingItems = await db
        .select()
        .from(collectionItems)
        .where(and(
          eq(collectionItems.collectionId, collectionId),
          eq(collectionItems.itemId, itemId)
        ));

      if (existingItems.length > 0) {
        return c.json(errorResponse('Item already exists in collection'), 409);
      }

      // Check current item count
      const itemCountResult = await db
        .select({ count: count() })
        .from(collectionItems)
        .where(eq(collectionItems.collectionId, collectionId));

      const currentCount = itemCountResult[0]?.count ?? 0;

      if (currentCount >= 5) {
        return c.json(errorResponse('Collection is full (maximum 5 items)'), 400);
      }

      // Add item
      const [item] = await db.insert(collectionItems).values({
        collectionId,
        itemId,
        note: note?.trim() || null,
      }).returning();

      // Update collection updatedAt
      await db.update(collections)
        .set({ updatedAt: new Date() })
        .where(eq(collections.id, collectionId));

      return c.json(successResponse(item), 201);

    } catch (error: any) {
      console.error('Error adding item:', error);
      
      // Handle unique constraint violation
      if (error.code === '23505') {
        return c.json(errorResponse('Item already exists in collection'), 409);
      }
      
      return c.json(errorResponse('Failed to add item to collection'), 500);
    }
  })

// Move Item between Collections
.put('/move-item', async (c) => {
  const userId = c.get('userId');
  
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json(errorResponse('Invalid JSON body'), 400);
  }

  const result = MoveItemSchema.safeParse(body);
  if (!result.success) {
    const firstError = result.error.issues[0];
    return c.json(errorResponse(firstError?.message || 'Invalid input'), 400);
  }

  const { itemId, sourceCollectionId, targetCollectionId } = result.data;

  if (sourceCollectionId === targetCollectionId) {
    return c.json(errorResponse('Source and target collections cannot be the same'), 400);
  }

  if (sourceCollectionId <= 0 || targetCollectionId <= 0) {
    return c.json(errorResponse('Invalid collection ID'), 400);
  }

  try {
    const moveResult = await db.transaction(async (tx: any) => {
      console.log(`Starting atomic move for item: ${itemId}`);

      // Use FOR UPDATE to lock both collections and prevent race conditions
      const collectionsResult = await tx
        .select()
        .from(collections)
        .where(and(
          eq(collections.userId, userId),
          inArray(collections.id, [sourceCollectionId, targetCollectionId])
        ))
        .for('update');

      const sourceCollection = collectionsResult.find((c: any) => c.id === sourceCollectionId);
      const targetCollection = collectionsResult.find((c: any) => c.id === targetCollectionId);

      if (!sourceCollection) {
        throw new Error(`Source collection ${sourceCollectionId} not found or access denied`);
      }

      if (!targetCollection) {
        throw new Error(`Target collection ${targetCollectionId} not found or access denied`);
      }

      // Get item from source collection with lock
      const [itemToMove] = await tx
        .select()
        .from(collectionItems)
        .where(and(
          eq(collectionItems.collectionId, sourceCollectionId),
          eq(collectionItems.itemId, itemId)
        ))
        .for('update');

      if (!itemToMove) {
        throw new Error(`Item "${itemId}" not found in source collection`);
      }

      // Check target collection capacity with current lock
      const [targetCountResult] = await tx
        .select({ count: count() })
        .from(collectionItems)
        .where(eq(collectionItems.collectionId, targetCollectionId));

      const targetCount = targetCountResult?.count ?? 0;

      if (targetCount >= 5) {
        throw new Error(`Target collection "${targetCollection.name}" is full (${targetCount}/5 items)`);
      }

      // Check if item already exists in target (shouldn't happen with locks, but safe)
      const [existingInTarget] = await tx
        .select()
        .from(collectionItems)
        .where(and(
          eq(collectionItems.collectionId, targetCollectionId),
          eq(collectionItems.itemId, itemId)
        ));

      if (existingInTarget) {
        throw new Error(`Item already exists in target collection`);
      }

      // ATOMIC OPERATION: Delete from source and insert into target
      console.log(`Moving item from collection ${sourceCollectionId} to ${targetCollectionId}`);
      
      const [deletedItem] = await tx
        .delete(collectionItems)
        .where(and(
          eq(collectionItems.collectionId, sourceCollectionId),
          eq(collectionItems.itemId, itemId)
        ))
        .returning();

      if (!deletedItem) {
        throw new Error('Failed to remove item from source collection');
      }

      const [movedItem] = await tx
        .insert(collectionItems)
        .values({
          collectionId: targetCollectionId,
          itemId: itemToMove.itemId,
          note: itemToMove.note,
          createdAt: new Date()
        })
        .returning();

      // Update both collections' timestamps
      await Promise.all([
        tx.update(collections)
          .set({ updatedAt: new Date() })
          .where(eq(collections.id, sourceCollectionId)),
        tx.update(collections)
          .set({ updatedAt: new Date() })
          .where(eq(collections.id, targetCollectionId))
      ]);

      console.log(`Item moved successfully`);
      
      return {
        success: true,
        message: `Item "${itemId}" moved successfully from "${sourceCollection.name}" to "${targetCollection.name}"`,
        movedItem
      };
    });

    return c.json(successResponse(moveResult));

  } catch (error: any) {
    console.error('Error in atomic move:', error);
    
    // Handle database constraint violations
    if (error.code === 'P0001' && error.message.includes('cannot have more than 5 items')) {
      return c.json(errorResponse('Target collection is full'), 400);
    }
    
    const errorMessage = error instanceof Error ? error.message : 'Failed to move item';
    const status = errorMessage.includes('not found') || errorMessage.includes('full') || errorMessage.includes('already exists') ? 400 : 500;
    return c.json(errorResponse(errorMessage), status);
  }
})

  // Delete Collection
  .delete('/:id', async (c) => {
    const userId = c.get('userId');
    const collectionId = parseInt(c.req.param('id'));

    if (isNaN(collectionId) || collectionId <= 0) {
      return c.json(errorResponse('Invalid collection ID'), 400);
    }

    try {
      // Verify collection exists and belongs to user
      const collectionResults = await db
        .select()
        .from(collections)
        .where(and(
          eq(collections.userId, userId),
          eq(collections.id, collectionId)
        ));

      const collection = collectionResults[0];

      if (!collection) {
        return c.json(errorResponse('Collection not found'), 404);
      }

      // Delete collection items first (due to foreign key constraint)
      await db
        .delete(collectionItems)
        .where(eq(collectionItems.collectionId, collectionId));

      // Delete collection
      await db
        .delete(collections)
        .where(eq(collections.id, collectionId));

      return c.json(successResponse({ message: 'Collection deleted successfully' }));

    } catch (error: any) {
      console.error('Error deleting collection:', error);
      return c.json(errorResponse('Failed to delete collection'), 500);
    }
  })

  // Remove Item from Collection
  .delete('/:collectionId/items/:itemId', async (c) => {
    const userId = c.get('userId');
    const collectionId = parseInt(c.req.param('collectionId'));
    const itemId = c.req.param('itemId');

    if (isNaN(collectionId) || collectionId <= 0) {
      return c.json(errorResponse('Invalid collection ID'), 400);
    }

    if (!itemId || itemId.trim().length === 0) {
      return c.json(errorResponse('Invalid item ID'), 400);
    }

    try {
      // Verify collection exists and belongs to user
      const collectionResults = await db
        .select()
        .from(collections)
        .where(and(
          eq(collections.userId, userId),
          eq(collections.id, collectionId)
        ));

      const collection = collectionResults[0];

      if (!collection) {
        return c.json(errorResponse('Collection not found'), 404);
      }

      // Delete the item
      const deletedItems = await db
        .delete(collectionItems)
        .where(and(
          eq(collectionItems.collectionId, collectionId),
          eq(collectionItems.itemId, itemId)
        ))
        .returning();

      if (deletedItems.length === 0) {
        return c.json(errorResponse('Item not found in collection'), 404);
      }

      // Update collection updatedAt
      await db.update(collections)
        .set({ updatedAt: new Date() })
        .where(eq(collections.id, collectionId));

      return c.json(successResponse({ message: 'Item removed from collection' }));

    } catch (error: any) {
      console.error('Error removing item:', error);
      return c.json(errorResponse('Failed to remove item from collection'), 500);
    }
  });
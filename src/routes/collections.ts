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

  // List Collections with Relevance Score - FIXED VERSION
  // List Collections with Relevance Score - COMPLETELY FIXED VERSION WITH PROPER TYPES
.get('/', async (c) => {
  const userId = c.get('userId');

  try {
    // First get collections with basic info and item count
    const collectionsWithCounts = await db
      .select({
        id: collections.id,
        name: collections.name,
        description: collections.description,
        userId: collections.userId,
        createdAt: collections.createdAt,
        updatedAt: collections.updatedAt,
        itemCount: count(collectionItems.id),
      })
      .from(collections)
      .leftJoin(collectionItems, eq(collections.id, collectionItems.collectionId))
      .where(eq(collections.userId, userId))
      .groupBy(collections.id)
      .orderBy(desc(collections.createdAt));

    // If no collections found, return empty array
    if (collectionsWithCounts.length === 0) {
      return c.json(successResponse([]));
    }

    // Get all items for these collections to calculate relevance scores
    const collectionIds = collectionsWithCounts.map((col: any) => col.id);
    
    // FIXED: Use proper Drizzle ORM syntax for IN clause
    const allItems = await db
      .select()
      .from(collectionItems)
      .where(inArray(collectionItems.collectionId, collectionIds));

    // Group items by collectionId
    const itemsByCollection = allItems.reduce((acc: Record<number, typeof allItems>, item: any) => {
      if (!acc[item.collectionId]) {
        acc[item.collectionId] = [];
      }
      acc[item.collectionId].push(item);
      return acc;
    }, {});

    // Calculate relevance scores and prepare final response
    const collectionsWithScores = collectionsWithCounts.map((collection: any) => {
      const items = itemsByCollection[collection.id] || [];
      const relevanceScore = items.reduce((score: number, item: any) => {
        return score + (item.note && item.note.trim() !== '' ? 2 : 1);
      }, 0);

      return {
        ...collection,
        relevanceScore,
      };
    });

    // Sort by relevance score (highest first), then by creation date
    collectionsWithScores.sort((a: any, b: any) => {
      if (b.relevanceScore !== a.relevanceScore) {
        return b.relevanceScore - a.relevanceScore;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return c.json(successResponse(collectionsWithScores));

  } catch (error: any) {
    console.error('Error listing collections:', error);
    console.error('Error details:', error.message);
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
      console.log(`🔍 Moving item: ${itemId} from ${sourceCollectionId} to ${targetCollectionId}`);

      // Verify both collections exist and belong to user
      const [sourceCollection, targetCollection] = await Promise.all([
        tx
          .select()
          .from(collections)
          .where(and(
            eq(collections.userId, userId),
            eq(collections.id, sourceCollectionId)
          ))
          .then((results: any[]) => results[0]),
        tx
          .select()
          .from(collections)
          .where(and(
            eq(collections.userId, userId),
            eq(collections.id, targetCollectionId)
          ))
          .then((results: any[]) => results[0])
      ]);

      console.log(`📁 Source collection:`, sourceCollection);
      console.log(`📁 Target collection:`, targetCollection);

      if (!sourceCollection) {
        throw new Error(`Source collection ${sourceCollectionId} not found or doesn't belong to user`);
      }

      if (!targetCollection) {
        throw new Error(`Target collection ${targetCollectionId} not found or doesn't belong to user`);
      }

      // Check if item exists in source collection
      const sourceItems = await tx
        .select()
        .from(collectionItems)
        .where(and(
          eq(collectionItems.collectionId, sourceCollectionId),
          eq(collectionItems.itemId, itemId)
        ));

      console.log(`🔍 Found ${sourceItems.length} items in source collection matching criteria`);
      console.log(`🔍 Looking for itemId: "${itemId}" in collection: ${sourceCollectionId}`);

      const itemToMove = sourceItems[0];

      if (!itemToMove) {
        // Let's check what items actually exist in the source collection for debugging
        const allSourceItems = await tx
          .select()
          .from(collectionItems)
          .where(eq(collectionItems.collectionId, sourceCollectionId));
        
        console.log(`📋 All items in source collection ${sourceCollectionId}:`, allSourceItems);
        throw new Error(`Item "${itemId}" not found in source collection ${sourceCollectionId}. Available items: ${allSourceItems.map((item: any) => item.itemId).join(', ')}`);
      }

      console.log(`✅ Found item to move:`, itemToMove);

      // Check if item already exists in target collection
      const targetItems = await tx
        .select()
        .from(collectionItems)
        .where(and(
          eq(collectionItems.collectionId, targetCollectionId),
          eq(collectionItems.itemId, itemId)
        ));

      if (targetItems.length > 0) {
        throw new Error(`Item "${itemId}" already exists in target collection ${targetCollectionId}`);
      }

      // Check target collection capacity
      const targetCountResult = await tx
        .select({ count: count() })
        .from(collectionItems)
        .where(eq(collectionItems.collectionId, targetCollectionId));

      const targetCount = targetCountResult[0]?.count ?? 0;

      console.log(`📊 Target collection ${targetCollectionId} currently has ${targetCount} items`);

      if (targetCount >= 5) {
        throw new Error(`Target collection ${targetCollectionId} is full (${targetCount}/5 items)`);
      }

      // Perform the move - DELETE from source and INSERT into target (more reliable than UPDATE)
      console.log(`🔄 Moving item by deleting from source and inserting into target...`);
      
      // First delete from source
      const deleteResult = await tx
        .delete(collectionItems)
        .where(and(
          eq(collectionItems.collectionId, sourceCollectionId),
          eq(collectionItems.itemId, itemId)
        ))
        .returning();

      console.log(`🗑️ Deleted from source:`, deleteResult);

      if (deleteResult.length === 0) {
        throw new Error('Failed to delete item from source collection');
      }

      // Then insert into target with the same data but new collectionId
      const [movedItem] = await tx
        .insert(collectionItems)
        .values({
          collectionId: targetCollectionId,
          itemId: itemToMove.itemId,
          note: itemToMove.note,
          createdAt: new Date() // Reset creation date
        })
        .returning();

      console.log(`✅ Inserted into target:`, movedItem);

      // Update both collections' updatedAt
      await Promise.all([
        tx.update(collections)
          .set({ updatedAt: new Date() })
          .where(eq(collections.id, sourceCollectionId)),
        tx.update(collections)
          .set({ updatedAt: new Date() })
          .where(eq(collections.id, targetCollectionId))
      ]);

      console.log(`📅 Updated collection timestamps`);

      return { 
        success: true, 
        message: `Item "${itemId}" moved successfully from collection "${sourceCollection.name}" to "${targetCollection.name}"`,
        movedItem 
      };
    });

    return c.json(successResponse(moveResult));

  } catch (error: any) {
    console.error('❌ Error moving item:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Failed to move item';
    return c.json(errorResponse(errorMessage), 400);
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
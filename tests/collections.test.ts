import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { testApp } from './setup';

describe('Collections API', () => {
  const TEST_USER_ID = 'test-user-123';
  
  // Use the test app instance
  const app = testApp;

  const baseUrl = 'http://localhost:3000';

  // Test data
  let testCollectionId: number;
  let testCollectionId2: number;

  beforeEach(async () => {
    // Create test collections before each test
    const collection1 = await app.request(
      new Request(`${baseUrl}/collections`, {
        method: 'POST',
        headers: { 
          'X-User-ID': TEST_USER_ID,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          name: 'Test Collection',
          description: 'Test description'
        })
      })
    );
    const collection1Data = await collection1.json();
    testCollectionId = collection1Data.id;

    const collection2 = await app.request(
      new Request(`${baseUrl}/collections`, {
        method: 'POST',
        headers: { 
          'X-User-ID': TEST_USER_ID,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          name: 'Test Collection 2'
        })
      })
    );
    const collection2Data = await collection2.json();
    testCollectionId2 = collection2Data.id;
  });

  afterEach(async () => {
    // Clean up test data
    if (testCollectionId) {
      await app.request(
        new Request(`${baseUrl}/collections/${testCollectionId}`, {
          method: 'DELETE',
          headers: { 'X-User-ID': TEST_USER_ID }
        })
      );
    }
    if (testCollectionId2) {
      await app.request(
        new Request(`${baseUrl}/collections/${testCollectionId2}`, {
          method: 'DELETE',
          headers: { 'X-User-ID': TEST_USER_ID }
        })
      );
    }
  });

  test('POST /collections - should create collection with unique name', async () => {
    const collectionData = {
      name: 'Unique Collection',
      description: 'Test description'
    };

    const response = await app.request(
      new Request(`${baseUrl}/collections`, {
        method: 'POST',
        headers: { 
          'X-User-ID': TEST_USER_ID,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(collectionData)
      })
    );

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.name).toBe('Unique Collection');
    expect(data.description).toBe('Test description');
    expect(data.userId).toBe(TEST_USER_ID);
    expect(data.id).toBeDefined();

    // Clean up
    await app.request(
      new Request(`${baseUrl}/collections/${data.id}`, {
        method: 'DELETE',
        headers: { 'X-User-ID': TEST_USER_ID }
      })
    );
  });

  test('POST /collections/:id/items - should add item successfully', async () => {
    const itemData = {
      itemId: 'test-item-1',
      note: 'This is a test note'
    };

    const response = await app.request(
      new Request(`${baseUrl}/collections/${testCollectionId}/items`, {
        method: 'POST',
        headers: { 
          'X-User-ID': TEST_USER_ID,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(itemData)
      })
    );

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.itemId).toBe('test-item-1');
    expect(data.note).toBe('This is a test note');
    expect(data.collectionId).toBe(testCollectionId);
  });

  test('POST /collections/:id/items - should enforce 5-item limit', async () => {
    // Add 5 items
    for (let i = 1; i <= 5; i++) {
      const response = await app.request(
        new Request(`${baseUrl}/collections/${testCollectionId}/items`, {
          method: 'POST',
          headers: { 
            'X-User-ID': TEST_USER_ID,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ itemId: `item-${i}` })
        })
      );
      expect(response.status).toBe(201);
    }

    // Try to add 6th item - should fail
    const sixthItemResponse = await app.request(
      new Request(`${baseUrl}/collections/${testCollectionId}/items`, {
        method: 'POST',
        headers: { 
          'X-User-ID': TEST_USER_ID,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ itemId: 'item-6' })
      })
    );

    expect(sixthItemResponse.status).toBe(400);
    const error = await sixthItemResponse.json();
    expect(error.error).toContain('full');
  });

  test('PUT /collections/move-item - should move item successfully', async () => {
    // Add item to source collection
    await app.request(
      new Request(`${baseUrl}/collections/${testCollectionId}/items`, {
        method: 'POST',
        headers: { 
          'X-User-ID': TEST_USER_ID,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ itemId: 'movable-item' })
      })
    );

    const moveData = {
      itemId: 'movable-item',
      sourceCollectionId: testCollectionId,
      targetCollectionId: testCollectionId2
    };

    const response = await app.request(
      new Request(`${baseUrl}/collections/move-item`, {
        method: 'PUT',
        headers: { 
          'X-User-ID': TEST_USER_ID,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(moveData)
      })
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
  });

  test('GET /collections - should return collections with relevance scores', async () => {
    const response = await app.request(
      new Request(`${baseUrl}/collections`, {
        method: 'GET',
        headers: { 'X-User-ID': TEST_USER_ID }
      })
    );

    expect(response.status).toBe(200);
    const collections = await response.json();
    expect(Array.isArray(collections)).toBe(true);
    
    // Should have relevanceScore and itemCount
    if (collections.length > 0) {
      expect(collections[0]).toHaveProperty('relevanceScore');
      expect(collections[0]).toHaveProperty('itemCount');
    }
  });

  test('Authentication - should require X-User-ID header', async () => {
    const response = await app.request(
      new Request(`${baseUrl}/collections`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
        // No X-User-ID header
      })
    );

    expect(response.status).toBe(401);
    const error = await response.json();
    expect(error.error).toContain('X-User-ID header is required');
  });
});
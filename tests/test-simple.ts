import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { testApp } from './setup';

describe('Simple Collections API Tests', () => {
  const TEST_USER_ID = 'simple-test-user';
  const app = testApp;
  const baseUrl = 'http://localhost:3000';

  let testCollectionId: number;

  beforeEach(async () => {
    // Create a test collection
    const response = await app.request(
      new Request(`${baseUrl}/collections`, {
        method: 'POST',
        headers: { 
          'X-User-ID': TEST_USER_ID,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          name: 'Simple Test Collection'
        })
      })
    );
    const data = await response.json();
    testCollectionId = data.id;
  });

  afterEach(async () => {
    // Clean up
    if (testCollectionId) {
      await app.request(
        new Request(`${baseUrl}/collections/${testCollectionId}`, {
          method: 'DELETE',
          headers: { 'X-User-ID': TEST_USER_ID }
        })
      );
    }
  });

  test('Basic health check', async () => {
    const response = await app.request(
      new Request(`${baseUrl}/`, {
        method: 'GET'
      })
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.message).toBe('Test API');
  });

  test('Create and retrieve collection', async () => {
    // Create collection
    const createResponse = await app.request(
      new Request(`${baseUrl}/collections`, {
        method: 'POST',
        headers: { 
          'X-User-ID': TEST_USER_ID,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          name: 'My Test Collection',
          description: 'Test description'
        })
      })
    );
    
    expect(createResponse.status).toBe(201);
    const collection = await createResponse.json();
    expect(collection.name).toBe('My Test Collection');
    expect(collection.description).toBe('Test description');
    expect(collection.userId).toBe(TEST_USER_ID);

    // Retrieve collection
    const getResponse = await app.request(
      new Request(`${baseUrl}/collections/${collection.id}`, {
        method: 'GET',
        headers: { 'X-User-ID': TEST_USER_ID }
      })
    );
    
    expect(getResponse.status).toBe(200);
    const retrieved = await getResponse.json();
    expect(retrieved.id).toBe(collection.id);
    expect(retrieved.name).toBe('My Test Collection');

    // Clean up
    await app.request(
      new Request(`${baseUrl}/collections/${collection.id}`, {
        method: 'DELETE',
        headers: { 'X-User-ID': TEST_USER_ID }
      })
    );
  });

  test('Add item to collection', async () => {
    const itemData = {
      itemId: 'simple-test-item',
      note: 'Simple test note'
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
    expect(data.itemId).toBe('simple-test-item');
    expect(data.note).toBe('Simple test note');
    expect(data.collectionId).toBe(testCollectionId);
  });

  test('List collections returns array', async () => {
    const response = await app.request(
      new Request(`${baseUrl}/collections`, {
        method: 'GET',
        headers: { 'X-User-ID': TEST_USER_ID }
      })
    );

    expect(response.status).toBe(200);
    const collections = await response.json();
    expect(Array.isArray(collections)).toBe(true);
    
    // Should have at least our test collection
    expect(collections.length).toBeGreaterThan(0);
    expect(collections[0]).toHaveProperty('id');
    expect(collections[0]).toHaveProperty('name');
    expect(collections[0]).toHaveProperty('userId');
  });

  test('Authentication required', async () => {
    const response = await app.request(
      new Request(`${baseUrl}/collections`, {
        method: 'GET'
        // No X-User-ID header
      })
    );

    expect(response.status).toBe(401);
    const error = await response.json();
    expect(error.error).toContain('X-User-ID header is required');
  });

  test('Database constraint test - 5 item limit', async () => {
    // Add 5 items successfully
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

    // Try to add 6th item - should fail due to database constraint
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

  console.log('All simple tests completed successfully!');
});
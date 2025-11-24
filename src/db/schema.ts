
import { pgTable, text, integer, serial, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

export const collections = pgTable('collections', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  userId: text('user_id').notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
}, (table) => {
  return {
    // Unique constraint: user can't have two collections with same name
    userCollectionNameUnique: uniqueIndex('user_collection_name_idx').on(table.userId, table.name),
  };
});

export const collectionItems = pgTable('collection_items', {
  id: serial('id').primaryKey(),
  collectionId: integer('collection_id').notNull(),
  itemId: text('item_id').notNull(),
  note: text('note'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
}, (table) => {
  return {
    // Unique constraint: item can't be added twice to same collection
    collectionItemUnique: uniqueIndex('collection_item_unique_idx').on(table.collectionId, table.itemId),
  };
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  collections: many(collections),
}));

export const collectionsRelations = relations(collections, ({ one, many }) => ({
  user: one(users, {
    fields: [collections.userId],
    references: [users.id],
  }),
  items: many(collectionItems),
}));

export const collectionItemsRelations = relations(collectionItems, ({ one }) => ({
  collection: one(collections, {
    fields: [collectionItems.collectionId],
    references: [collections.id],
  }),
}));
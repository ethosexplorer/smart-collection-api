import { z } from 'zod';

export const CreateCollectionSchema = z.object({
  name: z.string().min(1, "Name is required").max(255, "Name too long"),
  description: z.string().max(1000, "Description too long").optional(),
});

export const AddItemSchema = z.object({
  itemId: z.string().min(1, "Item ID is required").max(255, "Item ID too long"),
  note: z.string().max(500, "Note too long").optional(),
});

export const MoveItemSchema = z.object({
  itemId: z.string().min(1, "Item ID is required"),
  sourceCollectionId: z.number().int().positive("Source collection ID must be positive"),
  targetCollectionId: z.number().int().positive("Target collection ID must be positive"),
});

export type CreateCollectionInput = z.infer<typeof CreateCollectionSchema>;
export type AddItemInput = z.infer<typeof AddItemSchema>;
export type MoveItemInput = z.infer<typeof MoveItemSchema>;
import { db } from '../db';
import { collections } from '../db/schema';
import { eq, and } from 'drizzle-orm';

export async function generateUniqueCollectionName(userId: string, baseName: string): Promise<string> {
  let counter = 0;
  let candidateName = baseName;
  
  while (counter < 100) {
    try {
      const existing = await db
        .select()
        .from(collections)
        .where(and(
          eq(collections.userId, userId),
          eq(collections.name, candidateName)
        ))
        .limit(1);

      if (existing.length === 0) {
        return candidateName;
      }

      counter++;
      candidateName = `${baseName} (${counter})`;
    } catch (error) {
      // If there's any error, just return the current candidate name
      console.log('Name generation note:', error);
      return candidateName;
    }
  }

  throw new Error('Could not generate unique collection name');
}

export function isMeaningfulNote(note: string | null): boolean {
  return note != null && note.trim().length > 0;
}
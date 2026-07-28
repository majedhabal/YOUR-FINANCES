import { collection, query, getDocs, doc, setDoc, getDoc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { MASTER_CATEGORIES, CategoryDef } from './constants';

export interface CustomCategory extends CategoryDef {
  id?: string;
  isArchived?: boolean;
}

// Fallback / standard presets mapping
export const DEFAULT_PRESET_MAP: CategoryDef[] = MASTER_CATEGORIES;

/**
 * Fetches the master configurations onboarding presets.
 * If the config document doesn't exist, it seeds it with our default MASTER_CATEGORIES
 * and returns it immediately.
 */
export async function fetchGlobalPresets(): Promise<CategoryDef[]> {
  const docRef = doc(db, 'global_configurations', 'onboarding_presets');
  try {
    const dSnap = await getDoc(docRef);
    if (dSnap.exists()) {
      const data = dSnap.data();
      if (data && Array.isArray(data.defaultCategoryMap)) {
        return data.defaultCategoryMap as CategoryDef[];
      }
    }
    
    // Seed or update global_configurations/onboarding_presets document if not found or incomplete
    const initialPreset = {
      defaultCategoryMap: DEFAULT_PRESET_MAP,
      updatedAt: new Date().toISOString(),
      version: '1.1.0' // Versioning to trigger updates
    };
    
    if (!dSnap.exists()) {
      await setDoc(docRef, initialPreset);
      return DEFAULT_PRESET_MAP;
    } else {
      // Check if we need to force an update for "Starting Balance"
      const data = dSnap.data();
      const currentMap = data.defaultCategoryMap as CategoryDef[];
      const others = currentMap.find(c => c.name === 'Others');
      if (others && !others.subcategories?.includes('Starting Balance')) {
        await setDoc(docRef, initialPreset);
        return DEFAULT_PRESET_MAP;
      }
    }
    
    return dSnap.data().defaultCategoryMap as CategoryDef[];
  } catch (err) {
    console.warn("Failed to fetch global presets, falling back to local Constant categories map:", err);
    return DEFAULT_PRESET_MAP;
  }
}

/**
 * Perform one-time copy of global map to user's private custom_categories collection
 */
export async function seedUserCustomCategories(userId: string): Promise<void> {
  if (!userId || userId === 'dev-sandbox-user') return;
  try {
    const customColRef = collection(db, 'users', userId, 'custom_categories');
    const existingSnap = await getDocs(customColRef);
    if (!existingSnap.empty) {
      // Already seeded
      return;
    }

    const presetMap = await fetchGlobalPresets();
    const batch = writeBatch(db);
    
    presetMap.forEach((catObj) => {
      // Deterministic document ID or random
      const docRef = doc(customColRef);
      batch.set(docRef, {
        name: catObj.name,
        nature: catObj.nature,
        emoji: catObj.emoji,
        subcategories: catObj.subcategories || [],
        isArchived: false,
        createdAt: new Date().toISOString()
      });
    });
    
    await batch.commit();
    console.log(`Successfully seeded ${presetMap.length} custom categories for user ${userId}`);
  } catch (err) {
    console.error("Failed to seed custom categories for new user:", err);
  }
}

import { db } from '../db/db.js';
import { DEFAULT_EVENT_TYPES } from '../db/seedData.js';

/**
 * Normalizes event types into standard objects { id, name, isHidden, sortOrder }
 */
export function normalizeEventTypes(types) {
  if (!Array.isArray(types) || types.length === 0) {
    return DEFAULT_EVENT_TYPES.map((name, index) => ({
      id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      name,
      isHidden: false,
      sortOrder: index
    }));
  }

  return types.map((item, index) => {
    if (typeof item === 'string') {
      return {
        id: item.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
        name: item,
        isHidden: false,
        sortOrder: index
      };
    }
    return {
      id: item.id || `type-${index}-${Date.now()}`,
      name: item.name || 'Other',
      isHidden: Boolean(item.isHidden),
      sortOrder: item.sortOrder !== undefined ? Number(item.sortOrder) : index
    };
  }).sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Get active (non-hidden) event type names for dropdowns
 */
export function getActiveEventTypeNames(types) {
  const normalized = normalizeEventTypes(types);
  return normalized.filter(t => !t.isHidden).map(t => t.name);
}

/**
 * Persist updated event types to database settings
 */
export async function saveEventTypes(types) {
  const normalized = normalizeEventTypes(types);
  await db.settings.update('business_profile', {
    eventTypes: normalized
  });
  return normalized;
}

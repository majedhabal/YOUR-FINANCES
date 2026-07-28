/**
 * Utility for providing premium haptic feedback using navigator.vibrate
 */
export const triggerHaptic = (pattern: number | number[] = 15) => {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(pattern);
    } catch (e) {
      // Ignore errors gracefully (especially under iframe security constraints)
    }
  }
};

/**
 * Common premium tactile feedback presets
 */
export const hapticPresets = {
  light: 15, // Subtle click (perfect for navigation tabs, small buttons)
  medium: 30, // Normal select feedback (perfect for toggles, list expands)
  heavy: 45, // Affirmative action (perfect for primary action triggers like the main FAB)
  success: [15, 30, 20], // Affirmative confirmation (perfect for modal confirmations/saves)
  warning: [50, 50, 50], // Error alerts / warning validations
};

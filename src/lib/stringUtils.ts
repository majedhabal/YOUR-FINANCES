/**
 * Formats a string to start with a capital letter and replaces underscores with spaces.
 */
export const formatLabel = (str: string): string => {
  if (!str) return '';
  // Replace underscores with spaces
  const withSpaces = str.replace(/_/g, ' ');
  // Title Case
  return withSpaces
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

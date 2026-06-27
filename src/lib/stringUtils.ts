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

/**
 * Translates a category or subcategory name using i18next t function with fallback options.
 */
export const translateCategoryOrSubcategory = (name: string, t: any): string => {
  if (!name) return '';
  
  const formatted = formatLabel(name);
  const variants = [
    name,
    formatted,
    name.charAt(0).toUpperCase() + name.slice(1),
    name.toLowerCase()
  ];
  
  const uniqueVariants = Array.from(new Set(variants));
  
  for (const variant of uniqueVariants) {
    const subKey = `subcategories.${variant}`;
    const catKey = `categories.${variant}`;
    
    const translatedSub = t(subKey);
    if (translatedSub && translatedSub !== subKey) {
      return translatedSub;
    }
    
    const translatedCat = t(catKey);
    if (translatedCat && translatedCat !== catKey) {
      return translatedCat;
    }
  }
  
  return formatted;
};

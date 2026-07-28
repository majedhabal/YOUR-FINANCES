export const isTxMatchingBudget = (tx: any, budget: any) => {
  if (!tx) return false;
  
  if (tx.type === 'transfer') {
    if (budget.category === 'ACCOUNT FUND TRANSFERS') {
      const matchId = budget.accountId && tx.toAccountId === budget.accountId;
      const matchSub = budget.subcategory && tx.notes?.toLowerCase().includes(budget.subcategory.toLowerCase());
      return tx.transferSide === 'sender' && (matchId || matchSub);
    }
    return false;
  }
  if (tx.budgetId === budget.id) return true;

  // Account match if budget has accountId
  if (budget.accountId && tx.accountId !== budget.accountId) return false;

  const budgetCategory = (budget.category || budget.categoryTitle || '').toLowerCase();
  const txCategory = (tx.category || '').toLowerCase();
  
  if (budget.mappedCategories && Array.isArray(budget.mappedCategories) && budget.mappedCategories.length > 0) {
    if (budget.mappedCategories.map((c: string) => c.toLowerCase()).includes(txCategory)) {
      if (budget.mappedSubCategories && Array.isArray(budget.mappedSubCategories) && budget.mappedSubCategories.length > 0) {
        return budget.mappedSubCategories.map((s: string) => s.toLowerCase()).includes((tx.subcategory || '').toLowerCase());
      }
      return true;
    }
  }

  if (txCategory === budgetCategory) {
    if (!budget.subcategory || budget.subcategory === 'All' || budget.subcategory === '') {
      return true;
    }
    return (tx.subcategory || '').toLowerCase() === budget.subcategory.toLowerCase();
  }
  
  // Fallback: check if category contains the title or vice versa
  if (txCategory.includes(budgetCategory) || budgetCategory.includes(txCategory)) {
      return true;
  }

  return false;
};

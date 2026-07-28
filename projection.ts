import { Transaction } from '../components/Transactions';

export function projectRecurringTransactions(
  rules: any[],
  existingTransactions: any[],
  horizonDays: number = 60
): Transaction[] {
  const projected: Transaction[] = [];
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  
  // Set end horizon date
  const endLimitDate = new Date();
  endLimitDate.setDate(endLimitDate.getDate() + horizonDays);

  // Set up lookup of existing transactions to prevent duplicates
  // Map of (recurringId_date) -> exists
  const existingSet = new Set<string>();
  existingTransactions.forEach(tx => {
    const rId = tx.recurringId || tx.protocolId;
    if (rId && tx.date) {
      existingSet.add(`${rId}_${tx.date.substring(0, 7)}`);
    }
  });

  rules.forEach(rule => {
    // Only process active rules
    if (rule.isActive === false) return;

    const freq = rule.recurrency || 'monthly';
    const interval = rule.interval || 1;
    const selectedDayOption = rule.dayOption || 'sameDate';
    const currentStart = rule.nextGenerationDate || rule.lastGeneratedDate || todayStr;

    if (!currentStart) return;

    const [year, month, day] = currentStart.split('-').map(Number);
    if (isNaN(year) || isNaN(month) || isNaN(day)) return;

    let d = new Date(year, month - 1, day, 12, 0, 0);
    const originalDay = d.getDate();
    const originalWeekday = d.getDay();

    let loopCount = 0;
    while (d <= endLimitDate && loopCount < 50) {
      loopCount++;
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;

      // Only project into the future (>= todayStr)
      if (dateStr >= todayStr) {
        const dupKey = `${rule.id}_${dateStr.substring(0, 7)}`;
        if (!existingSet.has(dupKey)) {
          projected.push({
            id: `proj_${rule.id}_${dateStr}`,
            amount: Number(rule.amount) || 0,
            type: rule.type || 'expense',
            accountId: rule.accountId,
            category: rule.category || 'Other',
            subcategory: rule.subcategory || '',
            notes: rule.notes || '',
            date: dateStr,
            status: 'draft', // Draft ensures it native skips standard net worth but we display it properly in Upcoming
            recurringId: rule.id,
            emoji: rule.emoji || (rule.type === 'income' ? '💰' : '💸'),
            isUpcoming: true
          });
        }
      }

      // Move d to next recurrence occurrence
      if (freq === 'daily') {
        d.setDate(d.getDate() + interval);
      } else if (freq === 'weekly') {
        d.setDate(d.getDate() + (interval * 7));
      } else if (freq === 'monthly') {
        if (selectedDayOption === 'sameDate') {
          d.setMonth(d.getMonth() + interval);
          if (d.getDate() < originalDay) {
            d.setDate(0);
          }
        } else {
          // sameDay: Find the same weekday in the target month
          const targetMonth = d.getMonth() + interval;
          d.setMonth(targetMonth);
          const diff = originalWeekday - d.getDay();
          d.setDate(d.getDate() + diff);
        }
      } else if (freq === 'yearly') {
        if (selectedDayOption === 'sameDate') {
          d.setFullYear(d.getFullYear() + interval);
        } else {
          d.setFullYear(d.getFullYear() + interval);
          const diff = originalWeekday - d.getDay();
          d.setDate(d.getDate() + diff);
        }
      } else {
        // Fallback progress
        d.setDate(d.getDate() + 30);
      }
    }
  });

  return projected;
}

import { jsPDF } from 'jspdf';
import { Transaction } from '../components/Transactions';

interface ExportSummaryPdfParams {
  profile: any;
  accounts: any[];
  allTransactions: any[];
  accountBalances: Record<string, number>;
  exchangeRates: Record<string, number>;
  t: (key: string, options?: any) => string;
  language?: string;
}

export const exportSummaryPdf = ({
  profile,
  accounts,
  allTransactions,
  accountBalances,
  exchangeRates,
  t,
  language = 'en'
}: ExportSummaryPdfParams) => {
  const doc = new jsPDF('p', 'mm', 'a4');
  
  // Basic font setup - helvetica is default but we try to be safe
  // Note: For non-latin characters (Arabic, Russian), we ideally need to embed a font.
  // For now we use the standard ones.
  doc.setFont("helvetica", "normal");
  let y = 20;
  const leftMargin = 15;
  const pageWidth = 210;
  const rightMargin = pageWidth - leftMargin; // 195
  const printableWidth = rightMargin - leftMargin; // 180

  // Standard safe rate fetching
  const getRateToAED = (c: string): number => {
    if (!c) return 1;
    const cleanCurr = c.toUpperCase();
    if (cleanCurr === 'AED') return 1;
    return exchangeRates[cleanCurr] || exchangeRates[cleanCurr.toLowerCase()] || 1;
  };

  const primaryCurrency = profile?.baseCurrency || profile?.currency || 'AED';
  const baseRateToAED = getRateToAED(primaryCurrency);

  const formatCurrency = (amount: number, currencyCode: string = primaryCurrency) => {
    return new Intl.NumberFormat(language, {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  // Helper check for page layout tracking
  const checkPageBreak = (heightNeeded: number) => {
    if (y + heightNeeded > 275) {
      doc.addPage();
      y = 20;
      drawFooterLabel();
      drawSmallHeader();
    }
  };

  const drawSmallHeader = () => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120, 130, 140);
    doc.text(`YOUR FINANCES by ME Vantage - ${t('analytics.pdf.executive_summary')}`, leftMargin, 12);
    doc.setDrawColor(225, 230, 235);
    doc.setLineWidth(0.25);
    doc.line(leftMargin, 14, rightMargin, 14);
    y = 20;
  };

  const drawFooterLabel = () => {
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(150, 155, 160);
      doc.setDrawColor(225, 230, 235);
      doc.setLineWidth(0.25);
      doc.line(leftMargin, 282, rightMargin, 282);
      
      doc.text("yourfinances.me", leftMargin, 287);
      doc.text(`${t('analytics.pdf.page')} ${i} ${t('analytics.pdf.of')} ${pageCount}`, rightMargin - 15, 287, { align: 'right' });
    }
  };

  const translateAccountType = (type: string, bankType?: string) => {
    const tMap: Record<string, string> = {
      'bank': 'bank',
      'Bank': 'bank',
      'cash': 'cash',
      'Cash': 'cash',
      'investment': 'investment',
      'Investment': 'investment',
      'credit': 'credit',
      'Credit Card': 'credit',
      'loan': 'loan',
      'Personal Loan': 'loan',
      'mortgage': 'mortgage',
      'Mortgage': 'mortgage',
      'Checking': 'checking',
      'Savings': 'savings'
    };
    const key = tMap[type] || tMap[bankType || ''] || 'bank';
    return t(`account_detail.${key}`, { defaultValue: type || bankType || "Bank" });
  };

  const translateTxType = (type: string) => {
    const lowType = type?.toLowerCase();
    if (lowType === 'income') return t('analytics.income');
    if (lowType === 'expense') return t('budget_modal.expense');
    if (lowType === 'transfer') return t('budget_modal.transfer');
    return type;
  };

  // --- PAGE 1: HEADER & MASTER OVERVIEW ---

  // Main branding header banner matching the "YOUR FINANCES" brand guidelines
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(30, 41, 59); // deep slate slate-800
  doc.text("YOUR FINANCES", leftMargin, y);
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(74, 85, 104);
  doc.text(t('analytics.pdf.tagline'), leftMargin, y);
  y += 10;

  // Thin separator
  doc.setDrawColor(225, 230, 235);
  doc.setLineWidth(0.5);
  doc.line(leftMargin, y, rightMargin, y);
  y += 8;

  // Document metadata block
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(30, 41, 59);
  doc.text(t('analytics.pdf.title'), leftMargin, y);
  y += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(115, 125, 135);
  const userName = profile?.fullName || profile?.displayName || "John Doe";
  const userEmail = profile?.email || "john@vantage.ae";
  const formattedDate = new Date().toLocaleDateString(language, { dateStyle: 'long' });
  doc.text(`${t('analytics.pdf.investor_profile')}: ${userName} (${userEmail})`, leftMargin, y);
  y += 5;
  doc.text(`${t('analytics.pdf.statement_period')}: ${t('analytics.pdf.last_30_days')} | ${t('analytics.pdf.generated_on')}: ${formattedDate}`, leftMargin, y);
  y += 10;

  // -- CALCULATING CORE STATS --
  const allNonArchived = accounts.filter(acc => !acc.isArchived);
  const liabilityTypes = ['credit', 'loan', 'mortgage', 'Credit Card', 'Personal Loan', 'Mortgage'];
  const assetAccounts = allNonArchived.filter(acc => !liabilityTypes.includes(acc.type) || acc.loanDirection === 'lent');
  const liabilityAccounts = allNonArchived.filter(acc => liabilityTypes.includes(acc.type) && acc.loanDirection !== 'lent');

  const assetsSumAED = assetAccounts.reduce((sum, acc) => {
    const accId = acc.accountId || acc.id;
    const bal = accountBalances[accId] !== undefined ? accountBalances[accId] : (acc.currentBalance || 0);
    const rate = getRateToAED(acc.currency);
    return sum + (bal * rate);
  }, 0);

  const liabilitiesSumAED = liabilityAccounts.reduce((sum, acc) => {
    const accId = acc.accountId || acc.id;
    const bal = accountBalances[accId] !== undefined ? accountBalances[accId] : (acc.currentBalance || 0);
    const rate = getRateToAED(acc.currency);
    return sum + (Math.abs(bal) * rate);
  }, 0);

  const netWorthVal = (assetsSumAED - liabilitiesSumAED) / baseRateToAED;
  const cashVal = allNonArchived.filter(acc => ['cash', 'bank', 'Cash', 'Bank'].includes(acc.type) || acc.bankAccountType === 'Checking' || acc.bankAccountType === 'Savings' || acc.bankAccountType === 'Cash').reduce((sum, acc) => {
    const accId = acc.accountId || acc.id;
    const bal = accountBalances[accId] !== undefined ? accountBalances[accId] : (acc.currentBalance || 0);
    const rate = getRateToAED(acc.currency);
    return sum + (bal * rate);
  }, 0) / baseRateToAED;

  const investmentVal = allNonArchived.filter(acc => acc.type === 'investment' || acc.type === 'Investment').reduce((sum, acc) => {
    const accId = acc.accountId || acc.id;
    const bal = accountBalances[accId] !== undefined ? accountBalances[accId] : (acc.currentBalance || 0);
    const rate = getRateToAED(acc.currency);
    return sum + (bal * rate);
  }, 0) / baseRateToAED;

  const totalOutstandingLiabilitiesVal = liabilitiesSumAED / baseRateToAED;

  // Render Core Stats Cards (2 Column Layout)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(30, 41, 59);
  doc.text(t('analytics.pdf.financial_situation'), leftMargin, y);
  y += 6;

  // Background box for situation cards
  doc.setDrawColor(225, 230, 235);
  doc.setFillColor(252, 253, 254);
  doc.roundedRect(leftMargin, y, printableWidth, 42, 3, 3, "FD");

  // Grid labels and values inside boxes
  // Left Column
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(115, 125, 135);
  doc.text(t('analytics.pdf.net_worth'), leftMargin + 8, y + 8);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(30, 41, 59);
  doc.text(formatCurrency(netWorthVal), leftMargin + 8, y + 15);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(115, 125, 135);
  doc.text(t('analytics.pdf.cash_on_hand'), leftMargin + 8, y + 26);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(30, 41, 59);
  doc.text(formatCurrency(cashVal), leftMargin + 8, y + 33);

  // Right Column
  const rightColX = leftMargin + 95;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(115, 125, 135);
  doc.text(t('analytics.pdf.total_investments'), rightColX, y + 8);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(30, 41, 59);
  doc.text(formatCurrency(investmentVal), rightColX, y + 15);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(115, 125, 135);
  doc.text(t('analytics.pdf.outstanding_debt'), rightColX, y + 26);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(totalOutstandingLiabilitiesVal > 0 ? 220 : 30, totalOutstandingLiabilitiesVal > 0 ? 38 : 41, totalOutstandingLiabilitiesVal > 0 ? 38 : 59);
  doc.text(formatCurrency(totalOutstandingLiabilitiesVal), rightColX, y + 33);

  y += 50;

  // -- ACTIVE ACCOUNTS TABLE --
  checkPageBreak(30);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(30, 41, 59);
  doc.text(t('analytics.pdf.accounts_breakdown'), leftMargin, y);
  y += 6;

  // Table Headers
  doc.setFillColor(240, 244, 248);
  doc.rect(leftMargin, y, printableWidth, 8, "F");
  
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(74, 85, 104);
  doc.text(t('analytics.pdf.account_name'), leftMargin + 4, y + 5.5);
  doc.text(t('analytics.pdf.classification'), leftMargin + 65, y + 5.5);
  doc.text(t('analytics.pdf.currency'), leftMargin + 105, y + 5.5);
  doc.text(t('analytics.pdf.current_balance'), rightMargin - 4, y + 5.5, { align: 'right' });
  
  y += 8;

  allNonArchived.forEach(acc => {
    checkPageBreak(10);
    const accId = acc.accountId || acc.id;
    const nameStr = acc.name || "Unnamed Account";
    const typeStr = acc.type || acc.bankAccountType || "Bank";
    const currencyStr = acc.currency || "AED";
    const balNum = accountBalances[accId] !== undefined ? accountBalances[accId] : (acc.currentBalance || 0);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(30, 41, 59);
    
    // Safety truncation for account names
    const truncateName = nameStr.length > 28 ? nameStr.substring(0, 26) + "..." : nameStr;
    doc.text(truncateName, leftMargin + 4, y + 5.5);
    doc.text(translateAccountType(typeStr, acc.bankAccountType), leftMargin + 65, y + 5.5);
    doc.text(currencyStr, leftMargin + 105, y + 5.5);

    // Dynamic coloring for numbers: liability is highlighted slightly, balance numbers bolded
    const isLia = liabilityTypes.includes(typeStr) && acc.loanDirection !== 'lent';
    doc.setFont("helvetica", "bold");
    if (isLia || balNum < 0) {
      doc.setTextColor(185, 28, 28); // deep crimson red
    } else {
      doc.setTextColor(21, 128, 61); // forest green
    }
    doc.text(formatCurrency(balNum, currencyStr), rightMargin - 4, y + 5.5, { align: 'right' });

    // Thin underline
    doc.setDrawColor(241, 245, 249);
    doc.setLineWidth(0.15);
    doc.line(leftMargin, y + 8, rightMargin, y + 8);

    y += 8;
  });

  y += 4;

  // --- PAGE 2: CASH FLOW & CATEGORIZED SPENDING ANALYSIS ---
  checkPageBreak(80);
  
  // Fetch and filter last 30 days active realized transactions
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const monthTransactions = allTransactions.filter(tx => {
    if (tx.status === 'draft' || tx.status === 'scheduled' || tx.status === 'pending' || tx.status === 'upcoming' || tx.isUpcomingSalaryAllocation || (tx as any).interval !== undefined) return false;
    const txDate = new Date(tx.date);
    return txDate >= thirtyDaysAgo && txDate <= new Date();
  });

  let totalIncomeAED = 0;
  let totalExpenseAED = 0;
  const categoryExpenses: Record<string, number> = {};

  monthTransactions.forEach(tx => {
    const amount = Number(tx.amount) || 0;
    const rate = getRateToAED(tx.currency || 'AED');
    const amountAED = amount * rate;

    if (tx.type === 'income') {
      totalIncomeAED += amountAED;
    } else if (tx.type === 'expense') {
      totalExpenseAED += amountAED;
      const cat = tx.category || 'Others';
      categoryExpenses[cat] = (categoryExpenses[cat] || 0) + amountAED;
    }
  });

  const totalIncomeBase = totalIncomeAED / baseRateToAED;
  const totalExpenseBase = totalExpenseAED / baseRateToAED;
  const netSavingsBase = totalIncomeBase - totalExpenseBase;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(30, 41, 59);
  doc.text(t('analytics.pdf.cash_flow_performance'), leftMargin, y);
  y += 6;

  // Mini Cash Flow Grid Indicator
  doc.setDrawColor(225, 230, 235);
  doc.setFillColor(252, 253, 254);
  doc.roundedRect(leftMargin, y, printableWidth, 24, 3, 3, "FD");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(115, 125, 135);
  doc.text(t('analytics.pdf.total_income'), leftMargin + 6, y + 7);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(21, 128, 61);
  doc.text(`+ ${formatCurrency(totalIncomeBase)}`, leftMargin + 6, y + 14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(115, 125, 135);
  doc.text(t('analytics.pdf.total_expenses'), leftMargin + 68, y + 7);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(185, 28, 28);
  doc.text(`- ${formatCurrency(totalExpenseBase)}`, leftMargin + 68, y + 14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(115, 125, 135);
  doc.text(t('analytics.pdf.net_savings'), leftMargin + 130, y + 7);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(netSavingsBase >= 0 ? 21 : 185, netSavingsBase >= 0 ? 128 : 28, netSavingsBase >= 0 ? 61 : 28);
  doc.text(formatCurrency(netSavingsBase), leftMargin + 130, y + 14);

  y += 32;

  // Categorized spending sorted
  const sortedSpending = Object.entries(categoryExpenses)
    .map(([category, amountAED]) => ({
      category,
      amountBase: amountAED / baseRateToAED,
      pct: totalExpenseAED > 0 ? (amountAED / totalExpenseAED) * 100 : 0
    }))
    .sort((a, b) => b.amountBase - a.amountBase);

  checkPageBreak(40);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(30, 41, 59);
  doc.text(t('analytics.pdf.spending_analytics'), leftMargin, y);
  y += 6;

  if (sortedSpending.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(120, 130, 140);
    doc.text(t('analytics.pdf.no_expenses'), leftMargin + 4, y + 5);
    y += 12;
  } else {
    // Table Headers
    doc.setFillColor(240, 244, 248);
    doc.rect(leftMargin, y, printableWidth, 8, "F");
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(74, 85, 104);
    doc.text(t('analytics.pdf.category_group'), leftMargin + 4, y + 5.5);
    doc.text(t('analytics.pdf.percentage_outflow'), leftMargin + 85, y + 5.5);
    doc.text(t('analytics.pdf.total_outflow'), rightMargin - 4, y + 5.5, { align: 'right' });
    
    y += 8;

    sortedSpending.forEach(item => {
      checkPageBreak(10);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(30, 41, 59);
      doc.text(item.category, leftMargin + 4, y + 5.5);
      
      // Simple visual text bar representation
      doc.text(`${item.pct.toFixed(1)}%`, leftMargin + 85, y + 5.5);

      doc.setFont("helvetica", "bold");
      doc.text(formatCurrency(item.amountBase), rightMargin - 4, y + 5.5, { align: 'right' });

      // Underline line
      doc.setDrawColor(245, 247, 250);
      doc.setLineWidth(0.15);
      doc.line(leftMargin, y + 8, rightMargin, y + 8);
      y += 8;
    });
  }

  y += 4;

  // --- PAGE 3 Or Continued: RECENT LEDGER ENTRIES ---
  checkPageBreak(50);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(30, 41, 59);
  doc.text(t('analytics.pdf.transaction_history'), leftMargin, y);
  y += 6;

  const sortedRecentTxs = [...allTransactions]
    .filter(tx => tx.status !== 'draft' && tx.status !== 'scheduled' && tx.status !== 'pending' && tx.status !== 'upcoming' && !tx.isUpcomingSalaryAllocation && (tx as any).interval === undefined)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 15);

  if (sortedRecentTxs.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(120, 130, 140);
    doc.text(t('analytics.pdf.no_transactions'), leftMargin + 4, y + 5);
    y += 12;
  } else {
    // Table Headers
    doc.setFillColor(240, 244, 248);
    doc.rect(leftMargin, y, printableWidth, 8, "F");
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(74, 85, 104);
    doc.text(t('analytics.pdf.date'), leftMargin + 4, y + 5.5);
    doc.text(t('analytics.pdf.type'), leftMargin + 26, y + 5.5);
    doc.text(t('analytics.pdf.category_sub'), leftMargin + 50, y + 5.5);
    doc.text(t('analytics.pdf.notes_payee'), leftMargin + 105, y + 5.5);
    doc.text(t('analytics.pdf.amount_match'), rightMargin - 4, y + 5.5, { align: 'right' });
    
    y += 8;

    sortedRecentTxs.forEach(tx => {
      checkPageBreak(12);
      
      const txDateStr = new Date(tx.date).toLocaleDateString(language, { month: 'short', day: '2-digit' });
      const txTypeStr = translateTxType(tx.type);
      const txCatField = tx.category || "General";
      const txSubCat = tx.subCategory || tx.subcategory || "";
      const catSubStr = txSubCat ? `${txCatField} (${txSubCat})` : txCatField;
      const notesStr = tx.notes || tx.description || "Cash flow record";
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(30, 41, 59);

      doc.text(txDateStr, leftMargin + 4, y + 5.5);
      doc.text(txTypeStr, leftMargin + 26, y + 5.5);

      const truncateCat = catSubStr.length > 26 ? catSubStr.substring(0, 24) + "..." : catSubStr;
      doc.text(truncateCat, leftMargin + 50, y + 5.5);

      const truncateNotes = notesStr.length > 28 ? notesStr.substring(0, 26) + "..." : notesStr;
      doc.text(truncateNotes, leftMargin + 105, y + 5.5);

      // Value color parsing indicators
      doc.setFont("helvetica", "bold");
      const isNegative = tx.type === 'expense';
      const isTransfer = tx.type === 'transfer';
      
      if (isNegative) {
        doc.setTextColor(185, 28, 28); // red
        doc.text(`-${formatCurrency(tx.amount, tx.currency)}`, rightMargin - 4, y + 5.5, { align: 'right' });
      } else if (isTransfer) {
        doc.setTextColor(30, 41, 59); // regular slate
        doc.text(formatCurrency(tx.amount, tx.currency), rightMargin - 4, y + 5.5, { align: 'right' });
      } else {
        doc.setTextColor(21, 128, 61); // green
        doc.text(`+${formatCurrency(tx.amount, tx.currency)}`, rightMargin - 4, y + 5.5, { align: 'right' });
      }

      // Thin separation border
      doc.setDrawColor(245, 247, 250);
      doc.setLineWidth(0.15);
      doc.line(leftMargin, y + 8, rightMargin, y + 8);
      
      y += 8;
    });
  }

  // Draw final disclosure/marketing notice (Executive Assurance)
  checkPageBreak(30);
  y += 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(120, 130, 140);
  
  const disclosureText = t('analytics.pdf.disclosure');
  doc.text(disclosureText, leftMargin, y + 4, { maxWidth: printableWidth, align: 'justify' });

  // Draw footer text and page numbers across all pages
  drawFooterLabel();

  // Save/Download the file
  doc.save(`yourfinances_summary_${new Date().toISOString().slice(0, 10)}.pdf`);
};

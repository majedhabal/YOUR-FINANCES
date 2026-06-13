import { collection, addDoc, updateDoc, doc, setDoc, serverTimestamp, runTransaction, deleteDoc, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';

export function useVantageActions(uid?: string) {
  const getUid = () => {
    if (!uid) {
      throw new Error("Vantage identity verification missing. Try logging in again.");
    }
    return uid;
  };

  const createAccount = async (accountData: any) => {
    const userId = getUid();
    const typeLower = (accountData.type || '').toLowerCase();
    
    // Determine the user's requested initial setup balance
    let initialFunds = 0;
    if (typeLower === 'investment') {
      const subAssets = accountData.subAssets || [];
      const calculatedCurrentBalance = subAssets.reduce((sum: number, sa: any) => {
        return sum + Number(sa.investmentValue !== undefined ? sa.investmentValue : (sa.currentValue !== undefined ? sa.currentValue : (sa.principalInvested || 0)));
      }, 0);
      initialFunds = accountData.initialStartingBalance !== undefined 
        ? Number(accountData.initialStartingBalance) 
        : (accountData.startingBalance !== undefined ? Number(accountData.startingBalance) : calculatedCurrentBalance);
    } else {
      initialFunds = Number(accountData.initialStartingBalance !== undefined 
        ? accountData.initialStartingBalance 
        : (accountData.startingBalance || 0));
    }

    let exactPayload: any;
    let docId = '';

    const accColRef = collection(db, `users/${userId}/accounts`);
    const accDocRef = doc(accColRef);
    docId = accDocRef.id;

    if (typeLower === 'bank') {
      exactPayload = {
        accountId: docId,
        userId: userId,
        type: "Bank",
        bankAccountType: accountData.bankAccountType || "Checking",
        name: accountData.name || "Default Account",
        currency: accountData.currency || "AED",
        startingBalance: 0.00,
        currentBalance: 0.00,
        minBalanceFloor: Number(accountData.minBalanceFloor || 0),
        defaultTransferFee: Number(accountData.defaultTransferFee || 0),
        atmAutoSync: accountData.atmAutoSync || false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    } else if (typeLower === 'cash') {
      exactPayload = {
        accountId: docId,
        userId: userId,
        type: "Cash",
        bankAccountType: "Cash",
        name: accountData.name || "Physical Wallet",
        currency: accountData.currency || "AED",
        startingBalance: 0.00,
        currentBalance: 0.00,
        minBalanceFloor: Number(accountData.minBalanceFloor || 0),
        defaultTransferFee: Number(accountData.defaultTransferFee || 0),
        atmAutoSync: accountData.atmAutoSync || false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    } else if (typeLower === 'credit' || typeLower === 'credit card' || typeLower === 'loan' || typeLower === 'personal loan' || typeLower === 'mortgage') {
      let exactType = "Credit Card";
      if (typeLower === 'loan' || typeLower === 'personal loan') {
        exactType = "Personal Loan";
      } else if (typeLower === 'mortgage') {
        exactType = "Mortgage";
      }

      exactPayload = {
        accountId: docId,
        userId: userId,
        type: exactType,
        name: accountData.name || "Default Liability",
        currency: accountData.currency || "AED",
        startingBalance: 0.00,
        currentBalance: 0.00,
        interestRate: Number(accountData.interestRate || 0),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      if (exactType === "Credit Card") {
        exactPayload.creditLimit = Number(accountData.creditLimit || 0);
        exactPayload.paymentDueDate = accountData.paymentDueDate || "";
      } else {
        exactPayload.recurringProtocol = accountData.recurringProtocol || "";
      }
    } else if (typeLower === 'investment') {
      const subAssets = (accountData.subAssets || []).map((sa: any) => {
        const assetId = sa.assetId || sa.id || Math.random().toString(36).substring(2, 12);
        const assetName = sa.assetName || sa.name || '';
        const investmentValue = Number(sa.investmentValue !== undefined ? sa.investmentValue : (sa.currentValue !== undefined ? sa.currentValue : (sa.principalInvested || 0)));
        const principalInvested = Number(sa.principalInvested !== undefined ? sa.principalInvested : investmentValue);
        const passiveIncome = Number(sa.passiveIncome !== undefined ? sa.passiveIncome : 0);
        const estimatedYield = Number(sa.estimatedYield !== undefined ? sa.estimatedYield : 0);
        const yieldPeriod = sa.yieldPeriod || 'Yearly';

        return {
          assetId,
          id: assetId,
          assetName,
          name: assetName,
          investmentValue,
          currentValue: investmentValue,
          principalInvested,
          passiveIncome,
          estimatedYield,
          yieldPeriod
        };
      });

      exactPayload = {
        accountId: docId,
        userId: userId,
        type: "Investment",
        name: accountData.name || "Default Investment",
        currency: accountData.currency || "AED",
        startingBalance: 0.00,
        currentBalance: 0.00,
        platformFees: Number(accountData.platformFees !== undefined ? accountData.platformFees : 0),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        subAssets: subAssets
      };
    } else {
      exactPayload = {
        accountId: docId,
        userId: userId,
        name: accountData.name || "Generic Account",
        type: accountData.type || "Other",
        currency: accountData.currency || "AED",
        startingBalance: 0.00,
        currentBalance: 0.00,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    }

    await setDoc(accDocRef, exactPayload);

    if (initialFunds !== 0) {
      const isExpense = initialFunds < 0;
      await addTransaction({
        userId: userId,
        amount: Math.abs(initialFunds),
        type: isExpense ? 'expense' : 'income',
        accountId: docId,
        category: 'Adjustment',
        subcategory: 'Starting Balance',
        classification: 'starting_balance',
        notes: 'Starting Balance',
        description: 'Starting Balance',
        merchant: 'Starting Balance',
        date: new Date().toISOString().split('T')[0],
        status: 'confirmed',
        emoji: '💰'
      });
    }

    return { id: docId, ...exactPayload, currentBalance: initialFunds };
  };

  const addTransaction = async (transactionData: any) => {
    const userId = getUid();
    const txId = transactionData.transactionId || transactionData.id || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
    
    const isTransfer = transactionData.type?.toLowerCase() === 'transfer';
    const sourceAccountId = transactionData.sourceAccountId || transactionData.accountId;
    const destAccountId = transactionData.destinationAccountId || transactionData.toAccountId;
    const amt = Number(transactionData.amount || 0);

    const todayStr = new Date().toISOString().split('T')[0];
    const txDateStr = transactionData.date || todayStr;
    const isFuture = txDateStr > todayStr;
    const status = transactionData.status || (isFuture ? 'pending_confirmation' : 'confirmed');

    const exactPayload = {
      ...transactionData,
      status, // Ensured status field
      transactionId: txId,
      userId: userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      id: txId, // Legacy
    };

    await runTransaction(db, async (trans) => {
      const hasInterval = transactionData.interval !== undefined && transactionData.interval !== null;
      const isConfirmed = status === 'confirmed';

      // 1. Gather all snaps (reads first)
      let sourceSnap: any = null;
      if (sourceAccountId && !hasInterval && isConfirmed) {
        const sourceRef = doc(db, `users/${userId}/accounts/${sourceAccountId}`);
        sourceSnap = await trans.get(sourceRef);
      }

      let destSnap: any = null;
      if (isTransfer && destAccountId && !hasInterval && isConfirmed) {
        const destRef = doc(db, `users/${userId}/accounts/${destAccountId}`);
        destSnap = await trans.get(destRef);
      }

      // 2. Execute all writes
      if (sourceSnap && sourceSnap.exists()) {
        const sourceRef = doc(db, `users/${userId}/accounts/${sourceAccountId}`);
        const sourceBal = Number(sourceSnap.data()?.currentBalance) || 0;
        const change = (transactionData.type?.toLowerCase() === 'income') ? amt : -amt;
        trans.update(sourceRef, {
          currentBalance: sourceBal + change,
          updatedAt: serverTimestamp()
        });
      }

      if (destSnap && destSnap.exists()) {
        const destRef = doc(db, `users/${userId}/accounts/${destAccountId}`);
        const destBal = Number(destSnap.data()?.currentBalance) || 0;
        trans.update(destRef, {
          currentBalance: destBal + amt,
          updatedAt: serverTimestamp()
        });
      }

      // 3. Set the transaction record
      const newTxRef = doc(db, `users/${userId}/transactions/${txId}`);
      trans.set(newTxRef, exactPayload);
    });

    return { id: txId, ...exactPayload };
  };

  const setRecurringProtocol = async (recurringData: any) => {
    const userId = getUid();
    const docRef = doc(collection(db, `users/${userId}/recurringTransactions`));
    const docId = docRef.id;

    const transactionType = recurringData.transactionType || recurringData.type || 'expense';
    const frequency = recurringData.frequency || (recurringData.recurrency ? (recurringData.recurrency.charAt(0).toUpperCase() + recurringData.recurrency.slice(1)) : 'Monthly');
    const sourceAccountId = recurringData.sourceAccountId || recurringData.accountId || '';
    const destinationAccountId = transactionType === 'transfer' ? (recurringData.destinationAccountId || recurringData.toAccountId || null) : null;
    const dayOption = Number(recurringData.dayOption) || 28;

    const startDate = recurringData.startDate || recurringData.createdAt || new Date().toISOString();
    const nextExecutionDate = recurringData.nextExecutionDate || recurringData.nextGenerationDate || new Date().toISOString().split('T')[0];

    const exactPayload = {
      // Legacy compatibility
      id: docId,
      type: transactionType,
      recurrency: frequency.toLowerCase(),
      accountId: sourceAccountId,
      toAccountId: destinationAccountId,
      category: recurringData.category || 'Entertainment',
      notes: recurringData.notes || recurringData.title || 'Subscription',
      nextGenerationDate: nextExecutionDate,
      lastGeneratedDate: recurringData.lastGeneratedDate || new Date().toISOString().split('T')[0],

      // Exact new payload
      recurringId: docId,
      userId,
      title: recurringData.title || recurringData.notes || 'Monthly Event',
      amount: Number(recurringData.amount || 0),
      transactionType,
      frequency,
      sourceAccountId,
      destinationAccountId,
      startDate,
      nextExecutionDate,
      dayOption,
      isActive: recurringData.isActive !== undefined ? recurringData.isActive : true,
      isBreakdownConfigured: recurringData.isBreakdownConfigured !== undefined ? recurringData.isBreakdownConfigured : false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    await setDoc(docRef, exactPayload);

    // Automatically trigger initial transaction double-write for current date
    const initialTxData = {
      userId,
      amount: Number(exactPayload.amount) || 0,
      type: exactPayload.type || 'expense',
      accountId: exactPayload.accountId,
      category: exactPayload.category || 'Entertainment',
      notes: exactPayload.notes || 'Subscription',
      date: recurringData.date || new Date().toISOString().split('T')[0],
      createdAt: new Date(),
      emoji: '💰',
      status: 'confirmed',
      protocolId: docId
    };
    await addDoc(collection(db, `users/${userId}/transactions`), initialTxData);

    return { id: docId, ...exactPayload };
  };

  const updateAccount = async (accountId: string, updates: any) => {
    const userId = getUid();
    const accountRef = doc(db, `users/${userId}/accounts`, accountId);
    await updateDoc(accountRef, updates);
  };

  const updateTransaction = async (transactionId: string, updates: any) => {
    const userId = getUid();
    const transactionRef = doc(db, `users/${userId}/transactions`, transactionId);
    await updateDoc(transactionRef, updates);
  };

  const deleteUserProfile = async () => {
    const userId = getUid();

    const collectionsToDelete = [
      `users/${userId}/accounts`,
      `users/${userId}/transactions`,
      `users/${userId}/miniBudgets`,
      `users/${userId}/recurringTransactions`
    ];

    for (const colPath of collectionsToDelete) {
      const colRef = collection(db, colPath);
      const snapshot = await getDocs(colRef);
      for (const document of snapshot.docs) {
        await deleteDoc(document.ref);
      }
    }

    const userDocRef = doc(db, `users`, userId);
    await deleteDoc(userDocRef);
  };

  return {
    createAccount,
    addTransaction,
    setRecurringProtocol,
    updateAccount,
    updateTransaction,
    deleteUserProfile
  };
}

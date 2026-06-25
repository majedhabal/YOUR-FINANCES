import { collection, addDoc, updateDoc, doc, deleteDoc, getDocs } from 'firebase/firestore';
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
    
    let initialFunds = 0;
    if (typeLower === 'investment') {
      const subAssets = accountData.subAssets || [];
      initialFunds = subAssets.reduce((sum: number, sa: any) => {
        return sum + Number((sa.investmentValue ?? sa.currentValue) || sa.principalInvested || 0);
      }, 0);
    } else {
      initialFunds = Number((accountData.initialStartingBalance ?? accountData.startingBalance) || 0);
    }

    const accColRef = collection(db, 'users', userId, 'accounts');
    
    // Rule 17: Zero-Sum Initialization
    const accountDoc = {
      ...accountData,
      startingBalance: 0,
      currentBalance: 0,
      createdAt: new Date().toISOString()
    };
    
    const newDocRef = await addDoc(accColRef, accountDoc);
    
    // Rule 17: Generate starting balance transaction
    if (initialFunds !== 0) {
      const txColRef = collection(db, 'users', userId, 'transactions');
      await addDoc(txColRef, {
        userId,
        accountId: newDocRef.id,
        amount: Math.abs(initialFunds),
        type: initialFunds > 0 ? 'income' : 'expense',
        category: 'Income',
        subcategory: 'starting_balance',
        notes: 'Initial Balance Setup',
        date: new Date().toISOString().split('T')[0],
        status: 'confirmed',
        createdAt: new Date().toISOString()
      });
      
      // Sync balance to account document
      const accountRef = doc(db, 'users', userId, 'accounts', newDocRef.id);
      await updateDoc(accountRef, {
        currentBalance: initialFunds
      });
    }

    return { id: newDocRef.id, ...accountDoc, currentBalance: initialFunds };
  };

  const updateTransaction = async (transactionId: string, updates: any) => {
    const userId = getUid();
    const transactionRef = doc(db, 'users', userId, 'transactions', transactionId);
    await updateDoc(transactionRef, updates);
  };

  const deleteTransaction = async (transactionId: string) => {
    const userId = getUid();
    const transactionRef = doc(db, 'users', userId, 'transactions', transactionId);
    await deleteDoc(transactionRef);
  };

  const deleteProfile = async () => {
    const userId = getUid();

    // 1. Delete transactions
    const txsRef = collection(db, 'users', userId, 'transactions');
    const txsSnap = await getDocs(txsRef);
    for (const d of txsSnap.docs) {
      await deleteDoc(d.ref);
    }

    // 2. Delete accounts
    const accountsRef = collection(db, 'users', userId, 'accounts');
    const accountsSnap = await getDocs(accountsRef);
    for (const d of accountsSnap.docs) {
      await deleteDoc(d.ref);
    }

    // 3. Delete miniBudgets
    const budgetsRef = collection(db, 'users', userId, 'miniBudgets');
    const budgetsSnap = await getDocs(budgetsRef);
    for (const d of budgetsSnap.docs) {
      await deleteDoc(d.ref);
    }

    // 4. Delete recurringTransactions
    const recurringRef = collection(db, 'users', userId, 'recurringTransactions');
    const recurringSnap = await getDocs(recurringRef);
    for (const d of recurringSnap.docs) {
      await deleteDoc(d.ref);
    }

    // 5. Delete root user profile
    const userRef = doc(db, 'users', userId);
    await deleteDoc(userRef);
  };

  return {
    createAccount,
    updateTransaction,
    deleteTransaction,
    deleteProfile
  };
}

import { collection, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
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
    const newDocRef = doc(accColRef);
    await addDoc(accColRef, {
      ...accountData,
      startingBalance: initialFunds,
      createdAt: new Date().toISOString()
    });
    return { id: newDocRef.id, ...accountData };
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

  return {
    createAccount,
    updateTransaction,
    deleteTransaction
  };
}
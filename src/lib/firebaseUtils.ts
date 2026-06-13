import { auth } from './firebase';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

/**
 * Safely stringifies an object that might contain circular references or complex types.
 */
function safeJsonStringify(obj: any): string {
  const cache = new WeakSet();
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (cache.has(value)) {
        return '[Circular Reference]';
      }
      cache.add(value);
      
      // Handle native or custom Error subclasses
      if (value instanceof Error) {
        return {
          name: value.name,
          message: value.message,
          stack: value.stack
        };
      }

      // Handle HTML elements if they leak in
      if (typeof window !== 'undefined' && value instanceof Node) {
        return `[DOM Element: ${value.nodeName}]`;
      }

      // Handle Firebase/Firestore internal objects that might have circularity in minified code
      // Common minified property names for internals are like 'i', 's', 'c', 'v', etc.
      if (value.constructor && value.constructor.name.length <= 3 && !['Object', 'Array', 'Date'].includes(value.constructor.name)) {
        return `[Minified Internal ${value.constructor.name}]`;
      }
    }
    
    // Handle Firestore custom types
    if (value && typeof value.toDate === 'function') {
      try {
        return value.toDate().toISOString();
      } catch (e) {
        return '[Invalid Date]';
      }
    }

    return value;
  });
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  // Extract a safe error message string
  let errorMessage = 'An unknown Firestore error occurred';
  try {
    if (typeof error === 'string') {
      errorMessage = error;
    } else if (error instanceof Error) {
      errorMessage = error.message;
    } else if (error && typeof error === 'object') {
      const anyErr = error as any;
      // Many Firestore errors have .message or .code, but avoid deep objects
      errorMessage = String(anyErr.message || anyErr.code || 'Internal Error');
    }
  } catch (extractError) {
    errorMessage = 'Error details could not be extracted';
  }

  const errInfo: FirestoreErrorInfo = {
    error: errorMessage, 
    authInfo: {
      userId: auth.currentUser?.uid || null,
      email: auth.currentUser?.email || null,
      emailVerified: auth.currentUser?.emailVerified || null,
      isAnonymous: auth.currentUser?.isAnonymous || null,
      tenantId: auth.currentUser?.tenantId || null,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: String(provider.providerId || ''),
        email: String(provider.email || ''),
      })) || []
    },
    operationType,
    path: path ? String(path) : null
  }

  try {
    const serialized = safeJsonStringify(errInfo);
    console.error('Firestore Error Detailed:', serialized);
    throw new Error(serialized);
  } catch (stringifyError: any) {
    // Last resort fallback if even safeJsonStringify or the Error constructor fail
    const fallbackMessage = `Firestore ${operationType} failure at ${path || 'unknown path'}: ${errorMessage}`;
    console.error('Firestore Error (Fallback):', fallbackMessage);
    
    // Extremely safe string representation
    const safeError = String(errorMessage).substring(0, 500);
    const safePath = String(path || 'unknown').substring(0, 255);
    
    throw new Error(`{"error":"${safeError}","operationType":"${operationType}","path":"${safePath}"}`);
  }
}

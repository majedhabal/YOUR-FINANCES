import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth, getGoogleProvider } from './firebase';

let cachedAccessToken: string | null = null;

export const getCachedAccessToken = (): string | null => {
  return cachedAccessToken;
};

export const setCachedAccessToken = (token: string | null) => {
  cachedAccessToken = token;
};

export const hasGoogleToken = (): boolean => {
  return !!cachedAccessToken;
};

// Explicit custom trigger to acquire permission/token if missing
export const connectGoogleWorkspace = async (): Promise<string | null> => {
  try {
    const provider = getGoogleProvider();
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential?.accessToken) {
      cachedAccessToken = credential.accessToken;
      return cachedAccessToken;
    }
    return null;
  } catch (error) {
    console.error('Error connecting to Google Workspace:', error);
    throw error;
  }
};

export interface GoogleEventDetails {
  title: string;
  amount: number;
  currency: string;
  accountName: string;
  dueDate: string; // YYYY-MM-DD
  recurrency: string; // daily, weekly, monthly, yearly
  interval: number;
}

export interface GoogleTaskDetails {
  title: string;
  amount: number;
  currency: string;
  accountName: string;
  dueDate: string; // YYYY-MM-DD
}

// Create Recurring Google Calendar Event
export const createGoogleCalendarEvent = async (
  token: string, 
  details: GoogleEventDetails
): Promise<{ id: string; htmlLink?: string }> => {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  
  // Format recurring rule
  const freqMap: Record<string, string> = {
    daily: 'DAILY',
    weekly: 'WEEKLY',
    monthly: 'MONTHLY',
    yearly: 'YEARLY'
  };
  const rruleFreq = freqMap[details.recurrency.toLowerCase()] || 'MONTHLY';
  const rrule = `RRULE:FREQ=${rruleFreq};INTERVAL=${details.interval}`;

  // Compute the exclusive end date for an all-day event (next day after dueDate)
  const d = new Date(details.dueDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  const endDayStr = d.toISOString().split('T')[0];

  const eventPayload = {
    summary: details.title,
    description: `Amount: ${details.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} ${details.currency} from ${details.accountName}`,
    start: {
      date: details.dueDate
    },
    end: {
      date: endDayStr
    },
    recurrence: [rrule],
    reminders: {
      useDefault: true
    }
  };

  const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(eventPayload)
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('Google Calendar event creation error:', errorBody);
    throw new Error(`Failed to create calendar event: ${response.statusText}`);
  }

  const data = await response.json();
  return { id: data.id, htmlLink: data.htmlLink };
};

// Create One-time Google Task
export const createGoogleTask = async (
  token: string,
  details: GoogleTaskDetails
): Promise<{ id: string }> => {
  // Set due date as UTC ISO format start of day, Google tasks accepts RFC3339 formatted strings
  const taskPayload = {
    title: details.title,
    notes: `Amount: ${details.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} ${details.currency} from ${details.accountName}`,
    due: `${details.dueDate}T09:00:00.000Z`
  };

  const response = await fetch('https://tasks.googleapis.com/tasks/v1/lists/@default/tasks', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(taskPayload)
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('Google Tasks task creation error:', errorBody);
    throw new Error(`Failed to create Google task: ${response.statusText}`);
  }

  const data = await response.json();
  return { id: data.id };
};

export interface SyncTaskDetails {
  note: string;
  date: string;
  time?: string;
  hasReminder?: boolean;
}

export interface SyncTransactionDetails {
  amount: number;
  currency: string;
  category: string;
  notes: string;
}

export const syncToGoogleTasks = async (
  token: string,
  taskDetails: SyncTaskDetails,
  transactionDetails: SyncTransactionDetails
): Promise<{ id: string }> => {
  // Format body exactly as required:
  // Ref Transaction: [Amount] [Currency] | [Category]
  // Original Note: [Transaction Note]
  // User Memo: [New Task Note]
  const notesBody = `Ref Transaction: ${transactionDetails.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} ${transactionDetails.currency} | ${transactionDetails.category}
Original Note: ${transactionDetails.notes || 'None'}
User Memo: ${taskDetails.note || 'None'}`;

  let dueString: string;
  if (taskDetails.date) {
    if (taskDetails.time) {
      dueString = `${taskDetails.date}T${taskDetails.time}:00.000Z`;
    } else {
      dueString = `${taskDetails.date}T09:00:00.000Z`;
    }
  } else {
    dueString = new Date().toISOString();
  }

  const taskPayload = {
    title: taskDetails.note || transactionDetails.notes || 'Transaction Task',
    notes: notesBody,
    due: dueString
  };

  const response = await fetch('https://tasks.googleapis.com/tasks/v1/lists/@default/tasks', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(taskPayload)
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('syncToGoogleTasks error:', errorBody);
    throw new Error(`Failed to sync Google task: ${response.statusText}`);
  }

  const data = await response.json();
  return { id: data.id };
};

// Fetch list of upcoming calendar events (to support the live preview calendar widget!)
export interface GoogleCalendarEventItem {
  id: string;
  summary: string;
  description?: string;
  start?: {
    dateTime?: string;
    date?: string;
  };
}

export const fetchUpcomingFilesAndEvents = async (token: string): Promise<GoogleCalendarEventItem[]> => {
  const timeMin = new Date().toISOString();
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&maxResults=10&orderBy=startTime&singleEvents=true`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    console.error('Failed to fetch calendar preview events:', response.statusText);
    return [];
  }

  const data = await response.json();
  return data.items || [];
};

// Delete Google Calendar Event
export const deleteGoogleCalendarEvent = async (
  token: string,
  eventId: string
): Promise<boolean> => {
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    // If the event was already deleted or doesn't exist (e.g. 404 or 410), treat it as a success/graceful skip
    if (response.status === 404 || response.status === 410) {
      return true;
    }
    const errorBody = await response.text();
    console.error('Google Calendar event deletion error:', errorBody);
    throw new Error(`Failed to delete calendar event: ${response.statusText}`);
  }

  return true;
};

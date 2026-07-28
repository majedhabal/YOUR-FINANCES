export const setPasscode = (code: string) => localStorage.setItem('app_passcode', code);
export const getPasscode = () => localStorage.getItem('app_passcode');
export const removePasscode = () => localStorage.removeItem('app_passcode');
export const hasPasscode = () => !!localStorage.getItem('app_passcode');

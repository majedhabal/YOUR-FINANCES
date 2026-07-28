
const SIMULATED_DATE_KEY = 'vantage_simulated_date';

export const setSimulatedDate = (dateString: string | null) => {
  if (dateString) {
    localStorage.setItem(SIMULATED_DATE_KEY, dateString);
  } else {
    localStorage.removeItem(SIMULATED_DATE_KEY);
  }
};

export const getSimulatedDate = (): Date => {
  const simulated = localStorage.getItem(SIMULATED_DATE_KEY);
  return simulated ? new Date(simulated) : new Date();
};

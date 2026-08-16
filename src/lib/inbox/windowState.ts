export const SESSION_WINDOW_HOURS = 24;

export type WindowState = {
  isOpen: boolean;
  hoursRemaining: number;
  minutesRemaining: number;
};

/** يحسب حالة نافذة الـ24 ساعة الخاصة بواتساب من وقت انتهائها المخزَّن على المحادثة. */
export function computeWindowState(sessionWindowExpiresAt: Date | null, now: Date = new Date()): WindowState {
  if (!sessionWindowExpiresAt) return { isOpen: false, hoursRemaining: 0, minutesRemaining: 0 };
  const msRemaining = sessionWindowExpiresAt.getTime() - now.getTime();
  if (msRemaining <= 0) return { isOpen: false, hoursRemaining: 0, minutesRemaining: 0 };
  const totalMinutes = Math.floor(msRemaining / 60000);
  return { isOpen: true, hoursRemaining: Math.floor(totalMinutes / 60), minutesRemaining: totalMinutes % 60 };
}

export function newSessionWindowExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + SESSION_WINDOW_HOURS * 3600 * 1000);
}

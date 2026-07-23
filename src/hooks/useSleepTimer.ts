import { useCallback, useEffect, useRef, useState } from 'react';
import type { SleepTimerState } from '@/types';

export type SleepTimerOption = 15 | 30 | 60 | 90 | 120;
export const SLEEP_OPTIONS: SleepTimerOption[] = [15, 30, 60, 90, 120];

export function useSleepTimer(onExpire: () => void) {
  const [state, setState] = useState<SleepTimerState>({
    active: false,
    minutes: 30,
    endsAt: null,
  });
  const [remaining, setRemaining] = useState<number>(0); // seconds left
  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  const expiredRef  = useRef(false);

  const start = useCallback((minutes: SleepTimerOption) => {
    expiredRef.current = false;
    const endsAt = Date.now() + minutes * 60 * 1000;
    setState({ active: true, minutes, endsAt });
    setRemaining(minutes * 60);
  }, []);

  const cancel = useCallback(() => {
    setState({ active: false, minutes: 30, endsAt: null });
    setRemaining(0);
    clearInterval(intervalRef.current);
  }, []);

  useEffect(() => {
    if (!state.active || !state.endsAt) {
      clearInterval(intervalRef.current);
      return;
    }

    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      const left = Math.max(0, Math.floor((state.endsAt! - Date.now()) / 1000));
      setRemaining(left);

      if (left === 0 && !expiredRef.current) {
        expiredRef.current = true;
        clearInterval(intervalRef.current);
        setState({ active: false, minutes: 30, endsAt: null });
        onExpire();
      }
    }, 500);

    return () => clearInterval(intervalRef.current);
  }, [state.active, state.endsAt, onExpire]);

  const formatRemaining = () => {
    if (remaining === 0) return '';
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return { timerState: state, remaining, formatRemaining, start, cancel };
}

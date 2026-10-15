import { useEffect, useState } from 'react';
import { fetchOpenPaymentsCount } from './openPaymentsCount';

export function useOpenPaymentsCount(enabled: boolean): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setCount(0);
      return;
    }
    let active = true;
    void fetchOpenPaymentsCount().then((next) => {
      if (active) setCount(next);
    });
    return () => {
      active = false;
    };
  }, [enabled]);

  return count;
}

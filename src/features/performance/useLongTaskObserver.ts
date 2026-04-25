import { useEffect, useState } from 'react';

export interface LongTaskSummary {
  supported: boolean;
  count: number;
  maxDuration: number | null;
  lastDuration: number | null;
  lastObservedAt: number | null;
}

const EMPTY_LONG_TASK_SUMMARY: LongTaskSummary = {
  supported: false,
  count: 0,
  maxDuration: null,
  lastDuration: null,
  lastObservedAt: null,
};

export function useLongTaskObserver(): LongTaskSummary {
  const [summary, setSummary] = useState<LongTaskSummary>(EMPTY_LONG_TASK_SUMMARY);

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    const supported =
      typeof PerformanceObserver !== 'undefined' &&
      PerformanceObserver.supportedEntryTypes?.includes('longtask');

    setSummary((current) => (current.supported === supported ? current : { ...EMPTY_LONG_TASK_SUMMARY, supported }));

    if (!supported) return;

    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries().filter((entry) => entry.entryType === 'longtask');
      if (entries.length === 0) return;

      setSummary((current) => {
        let count = current.count;
        let maxDuration = current.maxDuration ?? 0;
        let lastDuration = current.lastDuration;
        let lastObservedAt = current.lastObservedAt;

        for (const entry of entries) {
          const duration = Number(entry.duration.toFixed(2));

          count += 1;
          maxDuration = Math.max(maxDuration, duration);
          lastDuration = duration;
          lastObservedAt = Date.now();
        }

        return {
          supported: true,
          count,
          maxDuration,
          lastDuration,
          lastObservedAt,
        };
      });
    });

    try {
      observer.observe({ type: 'longtask', buffered: true });
    } catch {
      setSummary(EMPTY_LONG_TASK_SUMMARY);
      observer.disconnect();
      return;
    }

    return () => {
      observer.disconnect();
    };
  }, []);

  return summary;
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { apiEventUrl } from './api';

/** Live job-progress payload delivered over the SSE stream. */
export type JobProgressState = {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  currentStep?: string;
  message?: string;
  error?: string;
};

export type JobProgressSnapshot = {
  /** Latest acknowledged state; null before the first event arrives. */
  state: JobProgressState | null;
  /** True while a live connection is being (re)established. */
  reconnecting: boolean;
};

/**
 * Subscribes to the job-progress SSE stream for a `jobId`. Relies on the
 * browser's built-in `EventSource` auto-reconnect for transient connection
 * errors, and closes the stream once the job reaches a terminal state (which
 * the server also signals by closing the connection).
 */
export function useJobProgress(jobId: string | null): JobProgressSnapshot {
  const [state, setState] = useState<JobProgressState | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!jobId) {
      setState(null);
      setReconnecting(false);
      return;
    }

    const source = new EventSource(apiEventUrl(`/api/jobs/${encodeURIComponent(jobId)}/events`));
    sourceRef.current = source;
    setReconnecting(true);

    source.addEventListener('job', (event) => {
      let data: JobProgressState;
      try {
        data = JSON.parse((event as MessageEvent).data) as JobProgressState;
      } catch {
        return;
      }
      setState(data);
      setReconnecting(false);
      if (data.status === 'completed' || data.status === 'failed') {
        source.close();
      }
    });

    source.onerror = () => {
      // The browser reconnects automatically; surface that to the user. Once
      // the stream is closed (terminal state) no reconnect should happen.
      if (source.readyState !== EventSource.CLOSED) {
        setReconnecting(true);
      }
    };

    return () => {
      source.close();
      sourceRef.current = null;
    };
  }, [jobId]);

  return { state, reconnecting };
}

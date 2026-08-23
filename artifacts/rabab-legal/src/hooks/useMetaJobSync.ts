/**
 * useMetaJobSync
 *
 * Synchronises the "extract-all citation metadata" job progress bar across
 * every admin tab that is open simultaneously.
 *
 * Strategy:
 *  - The tab that starts a job saves the jobId to localStorage AND broadcasts
 *    a `job_started` message via BroadcastChannel.
 *  - Every tab that receives `job_started` (or finds the jobId in localStorage
 *    on mount) begins polling the status endpoint independently.
 *    This way the bar keeps working even if the originating tab is closed.
 *  - When any tab detects that the job finished it clears localStorage and
 *    broadcasts `job_done` so other tabs stop their polling too.
 */

import { useState, useRef, useCallback, useEffect } from 'react';

const BASE = (import.meta as any).env.BASE_URL.replace(/\/$/, '');
export const META_JOB_KEY = 'rabab_meta_job_id';
const CHANNEL_NAME = 'rabab_meta_job';

export interface MetaJobState {
  total: number;
  done: number;
  failed: number;
  running: boolean;
  log: string[];
  extracted?: number;
  rejectedFields?: number;
  chunksUpdated?: number;
}

type BroadcastMsg =
  | { type: 'job_started'; jobId: string }
  | { type: 'job_done';    jobId: string };

export function useMetaJobSync(onDone?: () => void) {
  const [metaJobId, setMetaJobId]   = useState<string | null>(null);
  const [metaJob,   setMetaJob]     = useState<MetaJobState | null>(null);
  const pollRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);

  const stopPoll = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  /** Begin polling a job identified by `jobId`. Safe to call multiple times. */
  const startPolling = useCallback((jobId: string) => {
    stopPoll();
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(
          `${BASE}/api/admin/knowledge/reindex-status/${jobId}`,
          { credentials: 'include' },
        );
        if (!r.ok) { stopPoll(); return; }
        const sdata: MetaJobState = await r.json();
        setMetaJob(sdata);
        if (!sdata.running) {
          stopPoll();
          localStorage.removeItem(META_JOB_KEY);
          channelRef.current?.postMessage({ type: 'job_done', jobId } satisfies BroadcastMsg);
          onDone?.();
        }
      } catch { stopPoll(); }
    }, 4000);
  }, [stopPoll, onDone]);

  /* ── mount / unmount ─────────────────────────────────────────────────────── */
  useEffect(() => {
    // Open the broadcast channel
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channelRef.current = channel;

    channel.onmessage = (ev: MessageEvent<BroadcastMsg>) => {
      const msg = ev.data;
      if (msg.type === 'job_started') {
        // Another tab just started a job — restore its state and begin polling
        setMetaJobId(msg.jobId);
        fetch(`${BASE}/api/admin/knowledge/reindex-status/${msg.jobId}`, { credentials: 'include' })
          .then(r => r.ok ? r.json() : null)
          .then((sdata: MetaJobState | null) => {
            if (!sdata) return;
            setMetaJob(sdata);
            if (sdata.running) startPolling(msg.jobId);
            else onDone?.();
          })
          .catch(() => {/* ignore */});
      } else if (msg.type === 'job_done') {
        // Another tab finished polling and determined the job is done
        stopPoll();
        localStorage.removeItem(META_JOB_KEY);
        // Fetch the final state once so the progress bar shows 100 %
        fetch(`${BASE}/api/admin/knowledge/reindex-status/${msg.jobId}`, { credentials: 'include' })
          .then(r => r.ok ? r.json() : null)
          .then((sdata: MetaJobState | null) => {
            if (sdata) setMetaJob(sdata);
          })
          .catch(() => {/* ignore */});
        onDone?.();
      }
    };

    // Restore any in-progress job that was already running before this page loaded
    const savedJobId = localStorage.getItem(META_JOB_KEY);
    if (savedJobId) {
      fetch(`${BASE}/api/admin/knowledge/reindex-status/${savedJobId}`, { credentials: 'include' })
        .then(r => r.ok ? r.json() : null)
        .then((sdata: MetaJobState | null) => {
          if (!sdata) { localStorage.removeItem(META_JOB_KEY); return; }
          setMetaJobId(savedJobId);
          setMetaJob(sdata);
          if (sdata.running) {
            startPolling(savedJobId);
          } else {
            localStorage.removeItem(META_JOB_KEY);
            onDone?.();
          }
        })
        .catch(() => localStorage.removeItem(META_JOB_KEY));
    }

    return () => {
      stopPoll();
      channel.close();
      channelRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Call this immediately after the API returns a new jobId.
   * Saves to localStorage, broadcasts to other tabs, and starts local polling.
   */
  const announceJob = useCallback((jobId: string, initialState: MetaJobState) => {
    setMetaJobId(jobId);
    setMetaJob(initialState);
    localStorage.setItem(META_JOB_KEY, jobId);
    channelRef.current?.postMessage({ type: 'job_started', jobId } satisfies BroadcastMsg);
    startPolling(jobId);
  }, [startPolling]);

  return { metaJobId, metaJob, announceJob, stopPoll };
}

"use client";

import { useCallback, useState } from "react";

/**
 * Undo/redo history. Rapid successive edits (typing) within 800 ms are merged into one
 * step; structural actions pass `coalesce: false` so each becomes its own step.
 */
export function useHistory<T>(initial: T) {
  const [s, setS] = useState({ past: [] as T[], present: initial, future: [] as T[], lastPush: 0, version: 0 });

  const set = useCallback((fn: (prev: T) => T, opts: { coalesce?: boolean } = {}) => {
    setS((st) => {
      const next = fn(st.present);
      if (next === st.present) return st;
      const now = Date.now();
      const merge = opts.coalesce !== false && now - st.lastPush < 800 && st.past.length > 0;
      return {
        past: merge ? st.past : [...st.past, st.present].slice(-100),
        present: next,
        future: [],
        lastPush: opts.coalesce === false ? 0 : now,
        version: st.version + 1,
      };
    });
  }, []);

  const undo = useCallback(() => {
    setS((st) => {
      if (!st.past.length) return st;
      const prev = st.past[st.past.length - 1];
      return { past: st.past.slice(0, -1), present: prev, future: [st.present, ...st.future], lastPush: 0, version: st.version + 1 };
    });
  }, []);

  const redo = useCallback(() => {
    setS((st) => {
      if (!st.future.length) return st;
      const [next, ...rest] = st.future;
      return { past: [...st.past, st.present], present: next, future: rest, lastPush: 0, version: st.version + 1 };
    });
  }, []);

  /** Replace state without an undo step (e.g. after restoring a server version). */
  const reset = useCallback((v: T) => setS((st) => ({ past: [], present: v, future: [], lastPush: 0, version: st.version + 1 })), []);

  return { present: s.present, version: s.version, canUndo: s.past.length > 0, canRedo: s.future.length > 0, set, undo, redo, reset };
}

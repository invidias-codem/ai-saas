'use client';

import { useState, useEffect, useCallback } from 'react';
import { initializeBundler, transpileCode } from '@/lib/bundler';

export const useTranspiler = () => {
  const [isReady, setIsReady] = useState(false);
  const [isTranspiling, setIsTranspiling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    initializeBundler()
      .then(() => {
        if (!cancelled) setIsReady(true);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Failed to initialize transpiler');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const compile = useCallback(
    async (code: string) => {
      if (!isReady) return null;

      setIsTranspiling(true);
      setError(null);

      try {
        return await transpileCode(code);
      } catch (err: any) {
        setError(err.message || 'Syntax or compilation error');
        return null;
      } finally {
        setIsTranspiling(false);
      }
    },
    [isReady],
  );

  return { compile, isReady, isTranspiling, error };
};

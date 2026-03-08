import { useState, useRef, useCallback, useEffect } from 'react';

export type SourceType = 'camera' | 'screen';

interface UseOvershootVisionProps {
  prompt: string;
  enabled: boolean;
  apiKey: string;
  model?: string;
  sourceType?: SourceType;
  onResult?: (result: string) => void;
}

interface OvershootVisionState {
  isConnected: boolean;
  isProcessing: boolean;
  lastResult: string | null;
  error: string | null;
  resultHistory: Array<{ result: string; timestamp: number }>;
}

/**
 * Hook for real-time vision analysis using Overshoot SDK
 */
export function useOvershootVision({
  prompt,
  enabled,
  apiKey,
  model = 'google/gemini-2.0-flash-lite',
  sourceType = 'screen',
  onResult
}: UseOvershootVisionProps) {
  const [state, setState] = useState<OvershootVisionState>({
    isConnected: false,
    isProcessing: false,
    lastResult: null,
    error: null,
    resultHistory: []
  });

  const visionRef = useRef<any>(null);
  const promptRef = useRef(prompt);
  const sourceTypeRef = useRef(sourceType);

  useEffect(() => {
    promptRef.current = prompt;
  }, [prompt]);

  useEffect(() => {
    sourceTypeRef.current = sourceType;
  }, [sourceType]);

  // Initialize with selected source
  const start = useCallback(async () => {
    if (!apiKey || !enabled) return;

    try {
      const { RealtimeVision } = await import('overshoot');

      // Choose source based on type
      const source = sourceTypeRef.current === 'screen'
        ? { type: 'screen' as const }
        : { type: 'camera' as const, cameraFacing: 'environment' as const };

      visionRef.current = new RealtimeVision({
        apiKey,
        model,
        prompt: promptRef.current,
        source,
        onResult: (result: { result: string }) => {
          const resultText = result.result;
          setState(prev => ({
            ...prev,
            lastResult: resultText,
            isProcessing: true,
            resultHistory: [
              { result: resultText, timestamp: Date.now() },
              ...prev.resultHistory.slice(0, 9)
            ]
          }));
          onResult?.(resultText);
        },
      });

      await visionRef.current.start();
      setState(prev => ({ ...prev, isConnected: true, isProcessing: true, error: null }));

    } catch (error) {
      console.error('[Overshoot] Init error:', error);
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to initialize',
        isConnected: false
      }));
    }
  }, [apiKey, enabled, model, onResult]);

  // Stop and cleanup
  const stop = useCallback(async () => {
    if (visionRef.current) {
      try {
        await visionRef.current.stop();
      } catch (e) {
        console.error('[Overshoot] Stop error:', e);
      }
      visionRef.current = null;
    }
    setState(prev => ({ ...prev, isConnected: false, isProcessing: false }));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (visionRef.current) {
        visionRef.current.stop().catch(() => {});
      }
    };
  }, []);

  // Stop when disabled
  useEffect(() => {
    if (!enabled && visionRef.current) {
      stop();
    }
  }, [enabled, stop]);

  return {
    ...state,
    start,
    stop,
    clearHistory: () => setState(prev => ({ ...prev, resultHistory: [] }))
  };
}

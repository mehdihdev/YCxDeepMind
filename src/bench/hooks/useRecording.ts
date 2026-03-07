import { useState, useRef, useCallback, useEffect } from 'react';
import type { RecordingState, RecordingEpisode, RecordingFrame, VirtualCameraConfig } from '../types';

interface UseRecordingProps {
  jointValues: number[];
  cameras: VirtualCameraConfig[];
  getCameraCapture: (cameraId: string) => Uint8Array | null;
  fps?: number;
}

export function useRecording({
  jointValues,
  cameras,
  getCameraCapture,
  fps = 50
}: UseRecordingProps) {
  const [state, setState] = useState<RecordingState>({
    isRecording: false,
    currentEpisode: null,
    completedEpisodes: [],
    fps,
    taskName: 'default_task'
  });

  const frameCountRef = useRef(0);
  const jointValuesRef = useRef(jointValues);
  const intervalRef = useRef<number | null>(null);

  // Keep jointValues ref updated
  useEffect(() => {
    jointValuesRef.current = jointValues;
  }, [jointValues]);

  // Recording loop
  useEffect(() => {
    if (!state.isRecording || !state.currentEpisode) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = window.setInterval(() => {
      const now = performance.now();
      const startTime = state.currentEpisode!.startTime;
      const elapsed = (now - startTime) / 1000;

      // Capture frame
      const frame: RecordingFrame = {
        timestamp: elapsed,
        frameIndex: frameCountRef.current++,
        jointPositions: [...jointValuesRef.current],
        images: {}
      };

      // Capture from enabled cameras
      for (const camera of cameras.filter(c => c.enabled)) {
        const pixels = getCameraCapture(camera.id);
        if (pixels) {
          frame.images[camera.id] = new Uint8Array(pixels);
        }
      }

      setState(prev => {
        if (!prev.currentEpisode) return prev;
        return {
          ...prev,
          currentEpisode: {
            ...prev.currentEpisode,
            frames: [...prev.currentEpisode.frames, frame]
          }
        };
      });
    }, 1000 / fps);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [state.isRecording, state.currentEpisode?.startTime, cameras, getCameraCapture, fps]);

  const startRecording = useCallback(() => {
    const episode: RecordingEpisode = {
      episodeIndex: state.completedEpisodes.length,
      task: state.taskName,
      frames: [],
      startTime: performance.now(),
      endTime: null
    };
    frameCountRef.current = 0;
    setState(prev => ({
      ...prev,
      isRecording: true,
      currentEpisode: episode
    }));
  }, [state.completedEpisodes.length, state.taskName]);

  const stopRecording = useCallback(() => {
    setState(prev => {
      if (!prev.currentEpisode) return prev;

      const completed: RecordingEpisode = {
        ...prev.currentEpisode,
        endTime: performance.now()
      };

      return {
        ...prev,
        isRecording: false,
        currentEpisode: null,
        completedEpisodes: [...prev.completedEpisodes, completed]
      };
    });
  }, []);

  const setTaskName = useCallback((name: string) => {
    setState(prev => ({ ...prev, taskName: name }));
  }, []);

  const clearEpisodes = useCallback(() => {
    setState(prev => ({ ...prev, completedEpisodes: [] }));
  }, []);

  const deleteEpisode = useCallback((index: number) => {
    setState(prev => ({
      ...prev,
      completedEpisodes: prev.completedEpisodes.filter((_, i) => i !== index)
    }));
  }, []);

  return {
    isRecording: state.isRecording,
    currentEpisode: state.currentEpisode,
    completedEpisodes: state.completedEpisodes,
    taskName: state.taskName,
    frameCount: state.currentEpisode?.frames.length ?? 0,
    startRecording,
    stopRecording,
    setTaskName,
    clearEpisodes,
    deleteEpisode
  };
}

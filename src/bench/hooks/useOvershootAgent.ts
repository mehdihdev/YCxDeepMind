import { useState, useRef, useCallback, useEffect } from 'react';
import { Room, LocalVideoTrack, VideoPresets } from 'livekit-client';

const OVERSHOOT_API_KEY = 'ovs_c60b05204d538098e1f2da4d0e58e09d';
const OVERSHOOT_BASE_URL = 'https://api.overshoot.ai/v0.2';

interface AgentState {
  isRunning: boolean;
  currentStep: string;
  lastAnalysis: string;
  jointCorrections: number[] | null;
  error: string | null;
  history: Array<{ step: string; analysis: string; joints: number[] }>;
}

interface UseOvershootAgentProps {
  onJointUpdate: (joints: number[]) => void;
  captureFrame: () => string | null;
}

// Robot control prompt for Overshoot
const ROBOT_PROMPT = `You are controlling a SO-ARM100 robot arm. Analyze the image and respond with JSON only:
{"analysis": "what you see", "action": "move_to_block|lower_to_block|close_gripper|lift|move_to_box|lower_to_box|open_gripper|done", "joints": [rotation, pitch, elbow, wrist_pitch, wrist_roll, gripper]}

Joint reference:
- move_to_block: [0.38, -0.7, 1.1, 0.5, -1.57, 1.8]
- lower_to_block: [0.38, -0.2, 0.55, 0.0, -1.57, 1.8]
- close_gripper: [0.38, -0.2, 0.55, 0.0, -1.57, -0.1]
- lift: [0.38, -0.8, 1.2, 0.6, -1.57, -0.1]
- move_to_box: [-0.28, -0.8, 1.2, 0.6, -1.57, -0.1]
- lower_to_box: [-0.28, -0.25, 0.6, 0.05, -1.57, -0.1]
- open_gripper: [-0.28, -0.25, 0.6, 0.05, -1.57, 1.8]

Task: Pick up RED BLOCK, place in GREEN BOX. What step is next?`;

export function useOvershootAgent({ onJointUpdate, captureFrame }: UseOvershootAgentProps) {
  const [state, setState] = useState<AgentState>({
    isRunning: false,
    currentStep: '',
    lastAnalysis: '',
    jointCorrections: null,
    error: null,
    history: []
  });

  const currentJointsRef = useRef<number[]>([0, -1.57, 1.57, 1.57, -1.57, 1.8]);
  const abortRef = useRef(false);
  const streamIdRef = useRef<string | null>(null);
  const roomRef = useRef<Room | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const keepaliveIntervalRef = useRef<number | null>(null);
  const videoTrackRef = useRef<LocalVideoTrack | null>(null);

  // Create Overshoot stream
  const createStream = useCallback(async (): Promise<{
    streamId: string;
    livekitUrl: string;
    livekitToken: string;
  } | null> => {
    try {
      const response = await fetch(`${OVERSHOOT_BASE_URL}/streams`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OVERSHOOT_API_KEY}`
        },
        body: JSON.stringify({
          mode: 'frame',
          processing: {
            interval_seconds: 2
          },
          inference: {
            prompt: ROBOT_PROMPT,
            model: 'Qwen/Qwen3-VL-8B-Instruct',
            max_output_tokens: 200
          }
        })
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('[Overshoot] Create stream failed:', error);
        return null;
      }

      const data = await response.json();
      console.log('[Overshoot] Stream created:', data.stream_id);
      return {
        streamId: data.stream_id,
        livekitUrl: data.livekit.url,
        livekitToken: data.livekit.token
      };
    } catch (error) {
      console.error('[Overshoot] Create stream error:', error);
      return null;
    }
  }, []);

  // Close stream
  const closeStream = useCallback(async (streamId: string) => {
    try {
      await fetch(`${OVERSHOOT_BASE_URL}/streams/${streamId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${OVERSHOOT_API_KEY}` }
      });
      console.log('[Overshoot] Stream closed:', streamId);
    } catch (error) {
      console.error('[Overshoot] Close stream error:', error);
    }
  }, []);

  // Send keepalive
  const sendKeepalive = useCallback(async (streamId: string) => {
    try {
      const response = await fetch(`${OVERSHOOT_BASE_URL}/streams/${streamId}/keepalive`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${OVERSHOOT_API_KEY}` }
      });
      if (response.ok) {
        const data = await response.json();
        console.log('[Overshoot] Keepalive OK, credits:', data.credits_remaining_cents);
      }
    } catch (error) {
      console.error('[Overshoot] Keepalive error:', error);
    }
  }, []);

  // Create video track from canvas frames
  const createVideoTrack = useCallback(async (): Promise<LocalVideoTrack | null> => {
    try {
      // Create a canvas to render frames
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext('2d')!;

      // Start capturing frames and rendering to canvas
      const captureAndRender = () => {
        const frameDataUrl = captureFrame();
        if (frameDataUrl) {
          const img = new Image();
          img.onload = () => {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          };
          img.src = frameDataUrl;
        }
      };

      // Capture frame immediately and then every 100ms
      captureAndRender();
      const captureInterval = setInterval(captureAndRender, 100);

      // Get MediaStream from canvas
      const stream = canvas.captureStream(10); // 10 FPS
      const videoTrack = stream.getVideoTracks()[0];

      if (!videoTrack) {
        clearInterval(captureInterval);
        return null;
      }

      // Create LocalVideoTrack
      const localTrack = new LocalVideoTrack(videoTrack, undefined, false);

      // Store cleanup function
      (localTrack as any)._captureInterval = captureInterval;

      return localTrack;
    } catch (error) {
      console.error('[Overshoot] Create video track error:', error);
      return null;
    }
  }, [captureFrame]);

  // Process inference result
  const processResult = useCallback(async (resultText: string) => {
    try {
      // Extract JSON from result
      const jsonMatch = resultText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.log('[Overshoot] No JSON in result:', resultText);
        return false;
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const { analysis, action, joints } = parsed;

      if (!joints || !Array.isArray(joints) || joints.length !== 6) {
        console.log('[Overshoot] Invalid joints:', joints);
        return false;
      }

      setState(prev => ({
        ...prev,
        lastAnalysis: analysis || 'Analyzing...',
        currentStep: action || 'unknown',
        jointCorrections: joints,
        error: null,
        history: [{ step: action, analysis, joints }, ...prev.history.slice(0, 9)]
      }));

      // Animate to joints
      const targetJoints = joints;
      const steps = 50;
      for (let i = 0; i <= steps && !abortRef.current; i++) {
        const t = i / steps;
        const tSmooth = t * t * (3 - 2 * t);
        const interpolated = currentJointsRef.current.map((v, idx) =>
          v + (targetJoints[idx] - v) * tSmooth
        );
        onJointUpdate(interpolated);
        await new Promise(r => setTimeout(r, 25));
      }
      currentJointsRef.current = targetJoints;

      return action === 'done';
    } catch (e) {
      console.error('[Overshoot] Parse error:', e);
      return false;
    }
  }, [onJointUpdate]);

  // Connect WebSocket for results
  const connectWebSocket = useCallback((streamId: string) => {
    const ws = new WebSocket(`wss://api.overshoot.ai/v0.2/ws/streams/${streamId}`);

    ws.onopen = () => {
      console.log('[Overshoot] WebSocket connected');
      // Send auth
      ws.send(JSON.stringify({ api_key: OVERSHOOT_API_KEY }));
    };

    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('[Overshoot] Inference result:', data);

        if (data.ok && data.result) {
          setState(prev => ({ ...prev, currentStep: `Inference: ${data.inference_latency_ms?.toFixed(0)}ms` }));
          await processResult(data.result);
        } else if (data.error) {
          console.error('[Overshoot] Inference error:', data.error);
          setState(prev => ({ ...prev, error: data.error }));
        }
      } catch (e) {
        console.error('[Overshoot] WebSocket message error:', e);
      }
    };

    ws.onerror = (error) => {
      console.error('[Overshoot] WebSocket error:', error);
    };

    ws.onclose = (event) => {
      console.log('[Overshoot] WebSocket closed:', event.code, event.reason);
    };

    return ws;
  }, [processResult]);

  // Start agent
  const start = useCallback(async () => {
    if (state.isRunning) return;

    abortRef.current = false;
    setState(prev => ({
      ...prev,
      isRunning: true,
      error: null,
      history: [],
      currentStep: 'Creating stream...'
    }));

    // Reset to home position
    currentJointsRef.current = [0, -1.57, 1.57, 1.57, -1.57, 1.8];
    onJointUpdate(currentJointsRef.current);

    try {
      // 1. Create stream
      const streamInfo = await createStream();
      if (!streamInfo) {
        setState(prev => ({ ...prev, isRunning: false, error: 'Failed to create stream' }));
        return;
      }
      streamIdRef.current = streamInfo.streamId;

      // 2. Connect to LiveKit
      setState(prev => ({ ...prev, currentStep: 'Connecting to LiveKit...' }));
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        videoCaptureDefaults: {
          resolution: VideoPresets.h540.resolution,
        },
      });

      await room.connect(streamInfo.livekitUrl, streamInfo.livekitToken);
      console.log('[Overshoot] Connected to LiveKit room:', room.name);
      roomRef.current = room;

      // 3. Create and publish video track
      setState(prev => ({ ...prev, currentStep: 'Publishing video...' }));
      const videoTrack = await createVideoTrack();
      if (!videoTrack) {
        setState(prev => ({ ...prev, error: 'Failed to create video track' }));
        return;
      }
      videoTrackRef.current = videoTrack;

      await room.localParticipant.publishTrack(videoTrack, {
        name: 'camera',
        simulcast: false,
      });
      console.log('[Overshoot] Video track published');

      // 4. Connect WebSocket for results
      setState(prev => ({ ...prev, currentStep: 'Connecting WebSocket...' }));
      wsRef.current = connectWebSocket(streamInfo.streamId);

      // 5. Start keepalive interval (every 30s)
      keepaliveIntervalRef.current = window.setInterval(() => {
        if (streamIdRef.current) {
          sendKeepalive(streamIdRef.current);
        }
      }, 30000);

      setState(prev => ({ ...prev, currentStep: 'Streaming... waiting for inference' }));

    } catch (error) {
      console.error('[Overshoot] Start error:', error);
      setState(prev => ({
        ...prev,
        isRunning: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }));
    }
  }, [state.isRunning, onJointUpdate, createStream, createVideoTrack, connectWebSocket, sendKeepalive]);

  // Stop agent
  const stop = useCallback(async () => {
    abortRef.current = true;

    // Clear keepalive interval
    if (keepaliveIntervalRef.current) {
      clearInterval(keepaliveIntervalRef.current);
      keepaliveIntervalRef.current = null;
    }

    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    // Stop video track
    if (videoTrackRef.current) {
      const interval = (videoTrackRef.current as any)._captureInterval;
      if (interval) clearInterval(interval);
      videoTrackRef.current.stop();
      videoTrackRef.current = null;
    }

    // Disconnect from LiveKit
    if (roomRef.current) {
      roomRef.current.disconnect();
      roomRef.current = null;
    }

    // Close stream
    if (streamIdRef.current) {
      await closeStream(streamIdRef.current);
      streamIdRef.current = null;
    }

    setState(prev => ({ ...prev, isRunning: false, currentStep: 'Stopped' }));
  }, [closeStream]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current = true;
      if (keepaliveIntervalRef.current) clearInterval(keepaliveIntervalRef.current);
      if (wsRef.current) wsRef.current.close();
      if (videoTrackRef.current) videoTrackRef.current.stop();
      if (roomRef.current) roomRef.current.disconnect();
      if (streamIdRef.current) closeStream(streamIdRef.current);
    };
  }, [closeStream]);

  return { ...state, start, stop };
}

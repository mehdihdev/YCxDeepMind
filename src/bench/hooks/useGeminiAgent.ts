import { useState, useRef, useCallback } from 'react';

const GEMINI_API_KEY = 'AIzaSyC2rlfn9aTeZzRMP-wmMx2pVtLeoDDv7NY';
// Use Gemini 3.1 Flash-Lite - most cost-efficient multimodal model with higher rate limits
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent';

interface AgentState {
  isRunning: boolean;
  currentStep: string;
  lastAnalysis: string;
  jointCorrections: number[] | null;
  error: string | null;
  history: Array<{ step: string; analysis: string; joints: number[] }>;
}

interface UseGeminiAgentProps {
  onJointUpdate: (joints: number[]) => void;
  captureFrame: () => string | null; // Returns base64 image
}

const SYSTEM_PROMPT = `You are a robot arm controller for a SO-ARM100 6-DOF robotic arm. You can see the simulation through the camera.

The robot has 6 joints:
- Joint 0 (Rotation): Base rotation, range [-2.2, 2.2] radians. Positive = rotate right (towards red block).
- Joint 1 (Pitch): Shoulder pitch, range [-3.14, 0.2] radians. Less negative = reach forward/down. Around -0.3 to reach table.
- Joint 2 (Elbow): Elbow bend, range [0, 3.14] radians. Smaller = more extended arm. Around 0.5-0.8 to reach table.
- Joint 3 (Wrist Pitch): Wrist angle, range [-2.0, 1.8] radians. Around 0.0-0.2 to point gripper down at table.
- Joint 4 (Wrist Roll): Wrist roll, range [-3.14, 3.14] radians. Keep at -1.57.
- Joint 5 (Gripper): Jaw opening, range [-0.2, 2.0]. -0.1 = closed tight, 1.8 = fully open.

TASK: Pick up the RED BLOCK and place it in the GREEN BOX.

KNOWN POSITIONS:
- Red block: Slightly to the RIGHT of center (rotation ~0.38 rad)
- Green box: Slightly to the LEFT of center (rotation ~-0.28 rad)
- Both are on the table surface

STRATEGY (follow these steps in order):
1. move_to_block: Rotate to block (j0=0.38), position arm above it with gripper OPEN
2. lower_to_block: Lower arm to block level (j1=-0.2, j2=0.55, j3=0.0), gripper still open
3. close_gripper: Close gripper to grasp block (j5=-0.1)
4. lift: Raise arm while holding block (j1=-0.8, j2=1.2)
5. move_to_box: Rotate to box position (j0=-0.28) while lifted
6. lower_to_box: Lower to box (j1=-0.25, j2=0.6)
7. open_gripper: Release block (j5=1.8)
8. done: Task complete

Look at the image carefully. What step are we on? What adjustment is needed?

IMPORTANT: Respond with ONLY a JSON object:
{
  "analysis": "What you see and what step we're on",
  "action": "move_to_block|lower_to_block|close_gripper|lift|move_to_box|lower_to_box|open_gripper|done",
  "joints": [j0, j1, j2, j3, j4, j5]
}

Make SMALL adjustments. Don't skip steps.`;

export function useGeminiAgent({ onJointUpdate, captureFrame }: UseGeminiAgentProps) {
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

  const callGemini = useCallback(async (imageBase64: string, currentJoints: number[]): Promise<{
    analysis: string;
    action: string;
    joints: number[];
  } | null> => {
    try {
      const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: `${SYSTEM_PROMPT}\n\nCurrent joint values: [${currentJoints.map(j => j.toFixed(2)).join(', ')}]\n\nAnalyze the image and provide the next joint positions:` },
              { inline_data: { mime_type: 'image/png', data: imageBase64 } }
            ]
          }],
          generationConfig: {
            temperature: 1.0, // Gemini 3 recommends keeping at 1.0
            maxOutputTokens: 500,
          }
        })
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('Gemini API error:', error);
        if (response.status === 429) {
          throw new Error('Rate limited - waiting before retry...');
        }
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

      // Extract JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          analysis: parsed.analysis || 'No analysis',
          action: parsed.action || 'unknown',
          joints: parsed.joints || currentJoints
        };
      }

      console.error('Could not parse Gemini response:', text);
      return null;
    } catch (error) {
      console.error('Gemini call failed:', error);
      throw error;
    }
  }, []);

  const runAgentStep = useCallback(async () => {
    // Capture current frame
    const frameBase64 = captureFrame();
    if (!frameBase64) {
      setState(prev => ({ ...prev, error: 'Failed to capture frame' }));
      return null;
    }

    // Remove data URL prefix if present
    const base64Data = frameBase64.replace(/^data:image\/\w+;base64,/, '');

    // Call Gemini
    const result = await callGemini(base64Data, currentJointsRef.current);
    return result;
  }, [captureFrame, callGemini]);

  const start = useCallback(async () => {
    if (state.isRunning) return;

    abortRef.current = false;
    setState(prev => ({
      ...prev,
      isRunning: true,
      error: null,
      history: [],
      currentStep: 'Starting...'
    }));

    // Reset to home position first
    currentJointsRef.current = [0, -1.57, 1.57, 1.57, -1.57, 1.8];
    onJointUpdate(currentJointsRef.current);

    // Wait for physics to settle
    await new Promise(r => setTimeout(r, 500));

    let stepCount = 0;
    const maxSteps = 100; // Continuous mode - runs many steps

    while (!abortRef.current && stepCount < maxSteps) {
      stepCount++;
      setState(prev => ({ ...prev, currentStep: `Step ${stepCount}/${maxSteps}` }));

      try {
        let result = null;
        let retries = 0;

        // Keep retrying until we get a result (handles rate limits automatically)
        while (!result && !abortRef.current) {
          try {
            result = await runAgentStep();
          } catch (e) {
            if (e instanceof Error && e.message.includes('Rate limited')) {
              retries++;
              // Exponential backoff: 3s, 6s, 12s, 24s, max 60s
              const waitTime = Math.min(3000 * Math.pow(2, retries - 1), 60000);
              setState(prev => ({
                ...prev,
                currentStep: `Rate limited, retry ${retries} in ${Math.round(waitTime/1000)}s...`,
                error: null // Clear error, we're handling it
              }));
              await new Promise(r => setTimeout(r, waitTime));
            } else {
              throw e;
            }
          }
        }

        if (!result) {
          // Only happens if aborted
          break;
        }

        // Update state
        setState(prev => ({
          ...prev,
          lastAnalysis: result.analysis,
          jointCorrections: result.joints,
          currentStep: result.action,
          history: [...prev.history, {
            step: result.action,
            analysis: result.analysis,
            joints: result.joints
          }]
        }));

        // Apply joint corrections smoothly (slower, more deliberate movements)
        const targetJoints = result.joints;
        const steps = 60; // More steps for smoother motion
        for (let i = 0; i <= steps && !abortRef.current; i++) {
          const t = i / steps;
          // Smoothstep interpolation for more natural motion
          const tSmooth = t * t * (3 - 2 * t);
          const interpolated = currentJointsRef.current.map((v, idx) =>
            v + (targetJoints[idx] - v) * tSmooth
          );
          onJointUpdate(interpolated);
          await new Promise(r => setTimeout(r, 25)); // 25ms per step = 1.5s total
        }
        currentJointsRef.current = targetJoints;

        // Check if done - reset and continue for next cycle
        if (result.action === 'done') {
          setState(prev => ({ ...prev, currentStep: 'Task complete! Resetting...' }));
          // Wait then reset to home and continue
          await new Promise(r => setTimeout(r, 2000));
          currentJointsRef.current = [0, -1.57, 1.57, 1.57, -1.57, 1.8];
          onJointUpdate(currentJointsRef.current);
          await new Promise(r => setTimeout(r, 1000));
          setState(prev => ({ ...prev, currentStep: 'Starting new cycle...' }));
        }

        // Wait before next step (3s delay - flash-lite has higher rate limits)
        await new Promise(r => setTimeout(r, 3000));

      } catch (error) {
        setState(prev => ({
          ...prev,
          error: error instanceof Error ? error.message : 'Unknown error'
        }));
        break;
      }
    }

    setState(prev => ({ ...prev, isRunning: false }));
  }, [state.isRunning, onJointUpdate, runAgentStep]);

  const stop = useCallback(() => {
    abortRef.current = true;
    setState(prev => ({ ...prev, isRunning: false, currentStep: 'Stopped' }));
  }, []);

  return {
    ...state,
    start,
    stop,
    currentJoints: currentJointsRef.current
  };
}

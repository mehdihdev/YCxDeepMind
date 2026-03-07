import { useRef, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { TransformControls } from '@react-three/drei';
import * as THREE from 'three';
import type { VirtualCameraConfig } from '../types';

export interface VirtualCameraHandle {
  capture: () => Uint8Array | null;
}

interface VirtualCameraProps {
  config: VirtualCameraConfig;
  isSelected: boolean;
  onSelect: () => void;
  onPositionChange: (position: [number, number, number]) => void;
  onOrbitEnable: (enabled: boolean) => void;
}

export const VirtualCamera = forwardRef<VirtualCameraHandle, VirtualCameraProps>(
  function VirtualCamera({ config, isSelected, onSelect, onPositionChange, onOrbitEnable }, ref) {
    const { gl, scene } = useThree();
    const groupRef = useRef<THREE.Group>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera>(null);
    const captureRef = useRef<Uint8Array | null>(null);

    // Create render target for this camera
    const renderTarget = useMemo(() => {
      return new THREE.WebGLRenderTarget(
        config.resolution.width,
        config.resolution.height,
        {
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          format: THREE.RGBAFormat,
        }
      );
    }, [config.resolution.width, config.resolution.height]);

    // Create the camera
    useEffect(() => {
      if (cameraRef.current) {
        cameraRef.current.fov = config.fov;
        cameraRef.current.aspect = config.resolution.width / config.resolution.height;
        cameraRef.current.updateProjectionMatrix();
      }
    }, [config.fov, config.resolution]);

    // Update camera position and make it look at origin
    useEffect(() => {
      if (cameraRef.current) {
        cameraRef.current.position.set(...config.position);
        cameraRef.current.lookAt(0, 0, 0.1); // Look at robot base area
        cameraRef.current.updateMatrixWorld();
      }
      if (groupRef.current) {
        groupRef.current.position.set(...config.position);
      }
    }, [config.position]);

    // Handle transform changes from gizmo
    const handleTransformChange = () => {
      if (groupRef.current) {
        const pos = groupRef.current.position;
        onPositionChange([pos.x, pos.y, pos.z]);
      }
    };

    // Cleanup render target on unmount
    useEffect(() => {
      return () => {
        renderTarget.dispose();
      };
    }, [renderTarget]);

    // Render from this camera's viewpoint each frame
    useFrame(() => {
      if (!cameraRef.current || !config.enabled) return;

      // Save current state
      const currentRenderTarget = gl.getRenderTarget();
      const currentXrEnabled = gl.xr.enabled;
      gl.xr.enabled = false;

      // Render to our target
      gl.setRenderTarget(renderTarget);
      gl.clear();
      gl.render(scene, cameraRef.current);

      // Read pixels for capture
      const pixels = new Uint8Array(config.resolution.width * config.resolution.height * 4);
      gl.readRenderTargetPixels(
        renderTarget,
        0, 0,
        config.resolution.width,
        config.resolution.height,
        pixels
      );
      captureRef.current = pixels;

      // Restore state
      gl.xr.enabled = currentXrEnabled;
      gl.setRenderTarget(currentRenderTarget);
    });

    // Expose capture method
    useImperativeHandle(ref, () => ({
      capture: () => captureRef.current
    }), []);

    if (!config.enabled) return null;

    return (
      <>
        {/* Hidden camera for rendering */}
        <perspectiveCamera
          ref={cameraRef}
          fov={config.fov}
          aspect={config.resolution.width / config.resolution.height}
          near={0.01}
          far={100}
          position={config.position}
        />

        {/* Visual camera indicator group */}
        <group
          ref={groupRef}
          position={config.position}
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
        >
          {/* Camera body */}
          <mesh>
            <boxGeometry args={[0.05, 0.04, 0.03]} />
            <meshStandardMaterial
              color={isSelected ? '#0ea5e9' : '#666'}
              emissive={isSelected ? '#0ea5e9' : '#222'}
              emissiveIntensity={isSelected ? 0.5 : 0.1}
            />
          </mesh>

          {/* Lens indicator */}
          <mesh position={[0, 0, 0.025]}>
            <sphereGeometry args={[0.015, 8, 8]} />
            <meshStandardMaterial color={isSelected ? '#fff' : '#888'} />
          </mesh>
        </group>

        {/* Transform gizmo when selected */}
        {isSelected && groupRef.current && (
          <TransformControls
            object={groupRef.current}
            mode="translate"
            size={0.6}
            onMouseDown={() => onOrbitEnable(false)}
            onMouseUp={() => onOrbitEnable(true)}
            onChange={handleTransformChange}
          />
        )}
      </>
    );
  }
);

// Camera preview grid overlay (rendered as HTML)
interface CameraPreviewGridProps {
  cameras: VirtualCameraConfig[];
  cameraRefs: React.MutableRefObject<Map<string, VirtualCameraHandle>>;
  visible: boolean;
}

export function CameraPreviewGrid({ cameras, cameraRefs, visible }: CameraPreviewGridProps) {
  const canvasRefs = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const animationRef = useRef<number>(0);

  useEffect(() => {
    if (!visible) return;

    const enabledCameras = cameras.filter(c => c.enabled);
    if (enabledCameras.length === 0) return;

    const updatePreviews = () => {
      for (const camera of enabledCameras) {
        const handle = cameraRefs.current.get(camera.id);
        const canvas = canvasRefs.current.get(camera.id);

        if (handle && canvas) {
          const pixels = handle.capture();
          if (pixels && pixels.length > 0) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
              // Flip vertically (WebGL renders upside down)
              const w = camera.resolution.width;
              const h = camera.resolution.height;
              const flipped = new Uint8ClampedArray(pixels.length);

              for (let y = 0; y < h; y++) {
                const srcRow = (h - y - 1) * w * 4;
                const dstRow = y * w * 4;
                for (let x = 0; x < w * 4; x++) {
                  flipped[dstRow + x] = pixels[srcRow + x];
                }
              }

              const imageData = new ImageData(flipped, w, h);
              ctx.putImageData(imageData, 0, 0);
            }
          }
        }
      }
      animationRef.current = requestAnimationFrame(updatePreviews);
    };

    animationRef.current = requestAnimationFrame(updatePreviews);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [cameras, cameraRefs, visible]);

  if (!visible) return null;

  const enabledCameras = cameras.filter(c => c.enabled);
  if (enabledCameras.length === 0) return null;

  return (
    <div style={styles.previewGrid}>
      {enabledCameras.map(camera => (
        <div key={camera.id} style={styles.previewItem}>
          <div style={styles.previewLabel}>{camera.name}</div>
          <canvas
            ref={el => {
              if (el) {
                canvasRefs.current.set(camera.id, el);
              } else {
                canvasRefs.current.delete(camera.id);
              }
            }}
            width={camera.resolution.width}
            height={camera.resolution.height}
            style={styles.previewCanvas}
          />
        </div>
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  previewGrid: {
    position: 'absolute',
    top: 16,
    right: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    maxWidth: 180,
    zIndex: 100,
  },
  previewItem: {
    background: 'rgba(0, 0, 0, 0.8)',
    borderRadius: 8,
    overflow: 'hidden',
    border: '1px solid #333',
  },
  previewLabel: {
    padding: '4px 8px',
    fontSize: 10,
    color: '#888',
    background: 'rgba(0, 0, 0, 0.5)',
  },
  previewCanvas: {
    width: '100%',
    height: 'auto',
    display: 'block',
    background: '#000',
  },
};

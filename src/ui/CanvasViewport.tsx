import { useEffect, useRef, useState } from 'react';
import { SceneManager, type SceneStatus } from '../render/SceneManager';

export interface CanvasViewportProps {
  lowPowerMode?: boolean;
  onPadSelect?: (padName: string | null) => void;
  onSceneReady?: (manager: SceneManager | null) => void;
}

export function CanvasViewport({
  lowPowerMode = false,
  onPadSelect,
  onSceneReady,
}: CanvasViewportProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const managerRef = useRef<SceneManager | null>(null);
  const onPadSelectRef = useRef(onPadSelect);
  const onSceneReadyRef = useRef(onSceneReady);

  const [status, setStatus] = useState<SceneStatus>('loading');
  const [statusMessage, setStatusMessage] = useState<string | undefined>(undefined);

  onPadSelectRef.current = onPadSelect;
  onSceneReadyRef.current = onSceneReady;

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) {
      return;
    }

    let manager: SceneManager | null = null;
    try {
      manager = new SceneManager({
        canvas,
        container,
        lowPowerMode,
        onStatusChange: (nextStatus, message) => {
          setStatus(nextStatus);
          setStatusMessage(message);
        },
        onPadSelect: (padName) => {
          onPadSelectRef.current?.(padName);
        },
      });
      managerRef.current = manager;
      onSceneReadyRef.current?.(manager);
    } catch (error: unknown) {
      setStatus('error');
      setStatusMessage(
        error instanceof Error ? error.message : 'Unable to start 3D island diorama.',
      );
    }

    return () => {
      onSceneReadyRef.current?.(null);
      managerRef.current = null;
      manager?.dispose();
    };
  }, []);

  useEffect(() => {
    managerRef.current?.setLowPowerMode(lowPowerMode);
  }, [lowPowerMode]);

  return (
    <div ref={containerRef} className="canvas-viewport" aria-label="3D starter island diorama">
      <canvas ref={canvasRef} className="diorama-canvas" />

      {status === 'loading' && (
        <div className="viewport-status-pill" role="status" aria-live="polite">
          Loading Starter Island...
        </div>
      )}

      {(status === 'context-lost' || status === 'error') && (
        <div className="viewport-fallback-card" role="alert">
          <p className="stage-eyebrow">
            {status === 'context-lost' ? 'Graphics Paused' : 'WebGL Unavailable'}
          </p>
          <p className="stage-copy">
            {statusMessage ?? 'Please reload to restore the 3D island diorama.'}
          </p>
        </div>
      )}
    </div>
  );
}

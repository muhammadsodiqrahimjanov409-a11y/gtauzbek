import * as THREE from 'three';

export interface LoopHandle {
  stop: () => void;
}

export function startPacedRenderLoop(
  renderer: THREE.WebGLRenderer,
  isSoftwareGl: boolean,
  onFrame: (dt: number, elapsed: number, nowMs: number) => void,
): LoopHandle {
  let stopped = false;
  let rafId = 0;
  let timerId = 0;
  let lastTime = performance.now();
  const startTime = lastTime;

  const afterDraw = (cb: () => void) => {
    const gl = renderer.getContext() as WebGL2RenderingContext | null;
    if (gl && typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (stopped) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          timerId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          timerId = window.setTimeout(cb, 80);
        }
      };
      timerId = window.setTimeout(poll, 5);
    } else {
      timerId = window.setTimeout(cb, 80);
    }
  };

  const tick = () => {
    if (stopped) return;
    const now = performance.now();
    const rawDt = (now - lastTime) / 1000;
    lastTime = now;
    // Clamp delta to prevent physics tunneling after tab switch
    const dt = Math.min(0.05, Math.max(0.001, rawDt));
    const elapsed = (now - startTime) / 1000;

    onFrame(dt, elapsed, now);

    if (stopped) return;
    if (isSoftwareGl) {
      afterDraw(tick);
    } else {
      rafId = window.requestAnimationFrame(tick);
    }
  };

  if (isSoftwareGl) {
    rafId = window.requestAnimationFrame(tick);
  } else {
    rafId = window.requestAnimationFrame(tick);
  }

  return {
    stop: () => {
      stopped = true;
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(timerId);
    },
  };
}

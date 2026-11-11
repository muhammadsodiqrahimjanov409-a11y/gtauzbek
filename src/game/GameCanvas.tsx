import React, { useEffect, useRef, useState } from 'react';
import { checkWebGLSupport, detectSoftwareWebGL } from '../utils/performance';
import { createNexusGameWorld, type NexusWorldInstance } from './GameWorld';
import { useSettingsStore } from '../state/settingsStore';
import { getTranslations } from '../i18n';

export const GameCanvas: React.FC = () => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const worldRef = useRef<NexusWorldInstance | null>(null);
  const [webglFailed, setWebglFailed] = useState(false);

  const language = useSettingsStore((s) => s.language);
  const t = getTranslations(language);

  useEffect(() => {
    if (!checkWebGLSupport()) {
      setWebglFailed(true);
      return;
    }

    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    const instance = createNexusGameWorld(container, isSoftwareGl, () => {
      setWebglFailed(true);
    });
    worldRef.current = instance;

    const handleResize = () => {
      if (!mountRef.current || !worldRef.current) return;
      worldRef.current.resize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      instance?.dispose();
      worldRef.current = null;
    };
  }, []);

  if (webglFailed) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-slate-950 text-slate-100 p-6 z-50">
        <div className="max-w-md w-full rounded-xl border border-slate-800 bg-slate-900 p-6 space-y-3">
          <h2 className="text-xl font-bold font-display tracking-wide text-amber-400">
            {t.webglError.title}
          </h2>
          <p className="text-sm text-slate-300 leading-relaxed">{t.webglError.desc}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={mountRef}
      className="fixed inset-0 w-full h-full z-0 touch-game-zone bg-slate-950"
      aria-label="NEXUS CITY 3D Viewport"
    />
  );
};

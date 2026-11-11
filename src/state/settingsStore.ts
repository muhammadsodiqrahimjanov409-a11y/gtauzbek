import { create } from 'zustand';
import type { GraphicsQuality, Language, SettingsState, ThemeMode } from '../types/game';
import { audioEngine } from '../utils/audio';

const SETTINGS_LOCAL_KEY = 'nexus_city_settings_v1';

const defaultSettings: SettingsState = {
  language: 'uz',
  theme: 'dark',
  masterVolume: 0.7,
  musicVolume: 0.45,
  sfxVolume: 0.75,
  mouseSensitivity: 1.0,
  cameraSensitivity: 1.0,
  touchSensitivity: 1.0,
  graphicsQuality: 'high',
  shadowsEnabled: true,
  fpsCounter: true,
  vibrationEnabled: true,
  cameraDistance: 7.2,
  cameraFov: 62,
  showTouchControls: 'auto',
};

function loadInitialSettings(): SettingsState {
  if (typeof window === 'undefined') return defaultSettings;
  try {
    const raw = window.localStorage.getItem(SETTINGS_LOCAL_KEY);
    if (!raw) return defaultSettings;
    const parsed = JSON.parse(raw) as Partial<SettingsState>;
    return { ...defaultSettings, ...parsed };
  } catch {
    return defaultSettings;
  }
}

function persistSettings(s: SettingsState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SETTINGS_LOCAL_KEY, JSON.stringify(s));
  } catch {
    // Ignore storage quota errors
  }
}

interface SettingsStore extends SettingsState {
  updateSettings: (patch: Partial<SettingsState>) => void;
  setLanguage: (language: Language) => void;
  setTheme: (theme: ThemeMode) => void;
  setGraphicsQuality: (graphicsQuality: GraphicsQuality) => void;
  replaceAllSettings: (next: SettingsState) => void;
}

export const useSettingsStore = create<SettingsStore>((set, get) => {
  const initial = loadInitialSettings();
  audioEngine.setVolumes(initial.masterVolume, initial.musicVolume, initial.sfxVolume);

  return {
    ...initial,
    updateSettings: (patch) => {
      const next: SettingsState = { ...get(), ...patch };
      audioEngine.setVolumes(next.masterVolume, next.musicVolume, next.sfxVolume);
      persistSettings(next);
      set(patch);
    },
    setLanguage: (language) => {
      get().updateSettings({ language });
    },
    setTheme: (theme) => {
      get().updateSettings({ theme });
    },
    setGraphicsQuality: (graphicsQuality) => {
      const shadowsEnabled = graphicsQuality !== 'low';
      get().updateSettings({ graphicsQuality, shadowsEnabled });
    },
    replaceAllSettings: (next) => {
      audioEngine.setVolumes(next.masterVolume, next.musicVolume, next.sfxVolume);
      persistSettings(next);
      set(next);
    },
  };
});

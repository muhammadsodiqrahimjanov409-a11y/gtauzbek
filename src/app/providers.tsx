import React, { useEffect } from 'react';
import { useSettingsStore } from '../state/settingsStore';

export const AppProviders: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const theme = useSettingsStore((s) => s.theme);
  const language = useSettingsStore((s) => s.language);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.add('light');
      root.classList.remove('dark');
    }
    root.lang = language;
  }, [theme, language]);

  return <>{children}</>;
};

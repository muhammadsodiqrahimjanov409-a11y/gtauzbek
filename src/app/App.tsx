import React from 'react';
import { AppProviders } from './providers';
import { GameCanvas } from '../game/GameCanvas';
import { HUD } from '../ui/HUD';
import { TouchControls } from '../ui/TouchControls';
import { MainMenu } from '../ui/MainMenu';
import { Settings } from '../ui/Settings';
import { Garage } from '../ui/Garage';
import { CityMap } from '../map/CityMap';
import { MissionsPanel } from '../ui/MissionsPanel';
import { Inventory } from '../ui/Inventory';
import { SafehouseModal } from '../ui/SafehouseModal';
import { EnterprisesModal } from '../ui/EnterprisesModal';
import { MetroModal } from '../ui/MetroModal';
import { CoopModal } from '../ui/CoopModal';
import { useGameStore } from '../state/gameStore';

export const App: React.FC = () => {
  const activeModal = useGameStore((s) => s.activeModal);

  return (
    <AppProviders>
      <main className="relative w-full h-full overflow-hidden bg-slate-950">
        {/* Persistent 3D Open-World Viewport */}
        <GameCanvas />

        {/* Semantic HTML Overlays */}
        <HUD />
        <TouchControls />
        <MainMenu />

        {/* Modal Screens */}
        {activeModal === 'settings' && <Settings />}
        {(activeModal === 'garage' || activeModal === 'dealership') && (
          <Garage mode={activeModal} />
        )}
        {activeModal === 'map' && <CityMap />}
        {activeModal === 'missions' && <MissionsPanel />}
        {activeModal === 'enterprises' && <EnterprisesModal />}
        {activeModal === 'metro' && <MetroModal />}
        {activeModal === 'coop' && <CoopModal />}
        {activeModal === 'inventory' && <Inventory />}
        {activeModal === 'safehouse' && <SafehouseModal />}
      </main>
    </AppProviders>
  );
};

export default App;

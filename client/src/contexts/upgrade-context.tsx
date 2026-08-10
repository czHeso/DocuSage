import React, { createContext, useContext, useState, ReactNode } from 'react';
import UpgradePlanDialog from '@/components/upgrade-plan-dialog';

interface UpgradeContextType {
  openUpgradeDialog: () => void;
}

const UpgradeContext = createContext<UpgradeContextType | undefined>(undefined);

export function UpgradeProvider({ children }: { children: ReactNode }) {
  const [isUpgradeDialogOpen, setIsUpgradeDialogOpen] = useState(false);

  const openUpgradeDialog = () => {
    setIsUpgradeDialogOpen(true);
  };

  return (
    <UpgradeContext.Provider value={{ openUpgradeDialog }}>
      {children}
      <UpgradePlanDialog 
        isOpen={isUpgradeDialogOpen} 
        onClose={() => setIsUpgradeDialogOpen(false)} 
      />
    </UpgradeContext.Provider>
  );
}

export function useUpgrade() {
  const context = useContext(UpgradeContext);
  if (context === undefined) {
    throw new Error('useUpgrade must be used within an UpgradeProvider');
  }
  return context;
}
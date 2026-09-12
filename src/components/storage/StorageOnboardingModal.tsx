import React from 'react';
import { X, HardDrive, ShieldCheck, Check } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ModalOverlayContainer } from '../ModalOverlayContainer';

interface StorageOnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  canDismiss?: boolean;
}

export const StorageOnboardingModal: React.FC<StorageOnboardingModalProps> = ({
  isOpen,
  onClose,
  canDismiss = true,
}) => {
  const { setStorageBudgetBytes, setHasCompletedStorageOnboarding } = useApp();

  if (!isOpen) return null;

  const handleSelectBudget = (bytes: number) => {
    setStorageBudgetBytes(bytes);
    setHasCompletedStorageOnboarding(true);
    onClose();
  };

  return (
    <ModalOverlayContainer
      isOpen={isOpen}
      onClose={canDismiss ? onClose : () => {}}
      id="storage-onboarding-modal"
      maxWidth="md"
      ariaLabel="Storage Manifest Onboarding"
      className="p-6 space-y-5"
    >
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center font-bold text-xs">
            15G
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">Storage Manifest Onboarding</h2>
            <p className="text-[11px] text-neutral-400">Initialize device memory budget</p>
          </div>
        </div>
        {canDismiss && (
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

        <p className="text-xs text-neutral-300 leading-relaxed">
          AXON features a built-in <strong>15GB Storage Manifest</strong> engine designed for modern smartphones. It proactively manages disk usage, separates lossless archives from space-saving caches, and warns you before memory exhaustion occurs.
        </p>

        <div className="space-y-2">
          <button
            type="button"
            onClick={() => handleSelectBudget(15 * 1024 * 1024 * 1024)}
            className="w-full p-3 rounded-2xl bg-white text-black font-semibold text-xs flex items-center justify-between hover:bg-neutral-200 transition-colors"
          >
            <span>Set Standard 15 GB Budget</span>
            <Check className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => handleSelectBudget(10 * 1024 * 1024 * 1024)}
            className="w-full p-3 rounded-2xl bg-neutral-800 hover:bg-neutral-750 text-neutral-200 text-xs font-medium border border-neutral-700 transition-colors text-left"
          >
            Use Compact 10 GB Budget (Low Storage Devices)
          </button>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-neutral-400 pt-1 shrink-0">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>You can adjust this anytime in Settings &gt; Storage Diagnostics.</span>
        </div>
    </ModalOverlayContainer>
  );
};

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export interface ModalOverlayContainerProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  id?: string;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  maxHeight?: string; // Default: 'max-h-[85vh] sm:max-h-[82vh]'
  className?: string; // Extra custom classes for outer dialog container
  backdropClassName?: string;
  preventBackdropClose?: boolean;
  ariaLabel?: string;
  contentCentered?: boolean;
}

const MAX_WIDTH_MAP: Record<'sm' | 'md' | 'lg' | 'xl' | 'full', string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  full: 'max-w-full',
};

/**
 * ModalOverlayContainer
 *
 * Systemic structural fix for panel and overlay containment across the app:
 * 1. Portals to document.body to break out of transformed parent tracks (e.g. DualPaneContainer's 200% slider).
 * 2. Establishes an isolated top-level stacking context (z-50 / isolate) so it never leaks or shares space with adjacent panes.
 * 3. Enforces fixed, explicit max-width and max-height with overflow-hidden on the outer dialog card container.
 * 4. Responsive width (w-[calc(100vw-24px)] sm:w-full) so content reflows on narrow mobile screens.
 * 5. Handles backdrop dismissal (click / touch outside) and Escape key listener.
 */
export const ModalOverlayContainer: React.FC<ModalOverlayContainerProps> = ({
  isOpen,
  onClose,
  children,
  id,
  maxWidth = 'md',
  maxHeight = 'max-h-[85vh] sm:max-h-[82vh]',
  className = '',
  backdropClassName = '',
  preventBackdropClose = false,
  ariaLabel = 'Dialog',
  contentCentered = true,
}) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Handle Escape key to dismiss modal
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !preventBackdropClose) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, preventBackdropClose]);

  if (!isOpen) return null;

  const maxWidthClass = MAX_WIDTH_MAP[maxWidth] || 'max-w-md';

  const modalContent = (
    <div
      id={id ? `${id}-backdrop` : 'modal-overlay-backdrop'}
      data-no-swipe="true"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !preventBackdropClose) {
          onClose();
        }
      }}
      onTouchEnd={(e) => {
        if (e.target === e.currentTarget && !preventBackdropClose) {
          e.preventDefault();
          onClose();
        }
      }}
      className={`fixed inset-0 z-50 flex ${
        contentCentered ? 'items-center' : 'items-end sm:items-center'
      } justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm isolate select-none overflow-hidden ${backdropClassName}`}
    >
      <div
        id={id}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        data-no-swipe="true"
        onClick={(e) => e.stopPropagation()}
        className={`relative w-[calc(100vw-24px)] sm:w-full ${maxWidthClass} ${maxHeight} flex flex-col bg-neutral-950 sm:bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden text-white cursor-default animate-in fade-in zoom-in-95 duration-150 ${className}`}
      >
        {children}
      </div>
    </div>
  );

  // Render via portal to body if available, else render inline
  if (mounted && typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }

  return modalContent;
};

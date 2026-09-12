import React from 'react';
import { Download, Check } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { AVAILABLE_DOWNLOADABLE_PACKS, formatBytes } from '../../lib/storageManifest';

export const DownloadablePacksSection: React.FC = () => {
  const { assetManifest, addDownloadablePack } = useApp();

  return (
    <div className="space-y-4">
      <div className="text-xs text-neutral-400">
        Download verified offline reference packs directly into the AXON asset manifest for zero-latency lookups.
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        {AVAILABLE_DOWNLOADABLE_PACKS.map((pack) => {
          const isInstalled = assetManifest.some((a) => a.id === pack.id);

          return (
            <div
              key={pack.id}
              className="p-4 rounded-xl bg-neutral-950/60 border border-neutral-850 hover:border-neutral-800 transition-colors flex flex-col justify-between space-y-3.5"
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-white">{pack.name}</h3>
                  <span className="text-xs font-mono text-neutral-400">
                    {formatBytes(pack.sizeBytes)}
                  </span>
                </div>
                <p className="text-xs text-neutral-400 leading-relaxed">{pack.description}</p>
              </div>

              <div className="pt-2.5 border-t border-neutral-800/60 flex items-center justify-end">
                {isInstalled ? (
                  <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                    <Check className="w-3.5 h-3.5" /> Installed
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => addDownloadablePack(pack)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white text-black font-semibold text-xs hover:bg-neutral-200 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" /> Download Pack
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

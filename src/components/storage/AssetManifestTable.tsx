import React from 'react';
import { Trash2, RefreshCw, Wand2, Shield, AlertCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { AssetCategory } from '../../types';
import { formatBytes } from '../../lib/storageManifest';

interface AssetManifestTableProps {
  categoryFilter: AssetCategory | 'all';
  onSelectCategory: (category: AssetCategory | 'all') => void;
  onOpenRegisterModal: () => void;
}

export const AssetManifestTable: React.FC<AssetManifestTableProps> = ({
  categoryFilter,
  onSelectCategory,
  onOpenRegisterModal,
}) => {
  const {
    assetManifest,
    setAssetSaveMode,
    revertOrEnhanceAssetItem,
    deleteAssetFromManifest,
    toggleAssetEnabled,
  } = useApp();

  const filteredItems = assetManifest.filter(
    (item) => categoryFilter === 'all' || item.category === categoryFilter
  );

  return (
    <div className="space-y-4">
      {/* Category Pill Filters */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
        {(['all', 'model', 'knowledge_pack', 'user_file', 'chat_history', 'cache', 'system'] as const).map(
          (cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => onSelectCategory(cat)}
              className={`px-3 py-1.5 rounded-xl transition-colors whitespace-nowrap text-xs ${
                categoryFilter === cat
                  ? 'bg-neutral-800 text-white font-medium border border-neutral-700'
                  : 'text-neutral-400 hover:text-white hover:bg-neutral-900/60 border border-transparent'
              }`}
            >
              {cat === 'all' ? 'All Assets' : cat.replace('_', ' ')}
            </button>
          )
        )}
      </div>

      {filteredItems.length === 0 ? (
        <div className="p-8 rounded-2xl bg-neutral-900/30 border border-neutral-800/80 text-center text-neutral-400 space-y-2.5">
          <p className="text-xs">No assets registered in this category.</p>
          <button
            type="button"
            onClick={onOpenRegisterModal}
            className="px-3.5 py-1.5 rounded-xl bg-white text-black text-xs font-semibold hover:bg-neutral-200 transition-colors"
          >
            Register New Asset
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className="p-4 rounded-xl bg-neutral-950/60 border border-neutral-850 hover:border-neutral-800 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 text-xs"
            >
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-white">{item.name}</span>
                  {item.isCore && (
                    <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-neutral-900 text-neutral-400 border border-neutral-800">
                      <Shield className="w-2.5 h-2.5" /> Core
                    </span>
                  )}
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full border ${
                      item.saveMode === 'archive'
                        ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                        : 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                    }`}
                  >
                    {item.saveMode === 'archive' ? 'Archive (Lossless)' : 'Space-Saver (Lossy)'}
                  </span>
                  {item.knowledgeStatus === 'stale' && (
                    <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-300 border border-rose-500/20">
                      <AlertCircle className="w-2.5 h-2.5" /> Stale
                    </span>
                  )}
                </div>
                <div className="text-xs text-neutral-400 flex items-center gap-2">
                  <span>{item.storageLocation}</span>
                  <span className="text-neutral-600">&bull;</span>
                  <span className="font-mono text-neutral-200">{formatBytes(item.storedSizeBytes)}</span>
                  {item.originalSizeBytes > item.storedSizeBytes && (
                    <span className="text-neutral-500 line-through font-mono">
                      {formatBytes(item.originalSizeBytes)}
                    </span>
                  )}
                </div>
              </div>

              {/* Action Controls */}
              <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    setAssetSaveMode(
                      item.id,
                      item.saveMode === 'archive' ? 'space_saver' : 'archive'
                    )
                  }
                  title="Toggle Save Mode"
                  className="px-2.5 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-xs text-neutral-300 hover:text-white border border-neutral-800 transition-colors"
                >
                  {item.saveMode === 'archive' ? 'Make Space-Saver' : 'Make Archive'}
                </button>

                <button
                  type="button"
                  onClick={() => revertOrEnhanceAssetItem(item.id)}
                  title="Enhance approximation or restore lossless"
                  className="p-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-800 transition-colors"
                >
                  <Wand2 className="w-3.5 h-3.5" />
                </button>

                {!item.isCore && (
                  <button
                    type="button"
                    onClick={() => deleteAssetFromManifest(item.id)}
                    title="Delete Asset"
                    className="p-1.5 rounded-lg bg-neutral-900 hover:bg-rose-950 text-neutral-400 hover:text-rose-300 border border-neutral-800 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

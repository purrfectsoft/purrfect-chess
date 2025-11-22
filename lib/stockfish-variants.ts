import variantsData from './stockfish-variants.json';

export interface StockfishVariant {
  id: string;
  name: string;
  hash: string;
  wasmParts: number;
  hasWasm: boolean;
  strength: number; // 1-5 scale
  description: string;
  size: {
    label: string;
    bytes: number;
  };
  compatibility: {
    needsCORS: boolean;
    needsSharedArrayBuffer: boolean;
    disabledReason?: string;
    disabledTooltip?: string;
  };
  // Helper methods added at runtime
  isAvailable: () => boolean;
}

export const DEFAULT_VARIANT_ID = 'single';

/**
 * Check if SharedArrayBuffer is available
 */
export const isSharedArrayBufferAvailable = (): boolean => {
  return (
    typeof SharedArrayBuffer !== 'undefined' &&
    typeof window !== 'undefined' &&
    window.crossOriginIsolated
  );
};

/**
 * Check if CORS headers are likely available (proxy for SharedArrayBuffer check)
 */
export const areCORSHeadersAvailable = (): boolean => {
  return isSharedArrayBufferAvailable();
};

/**
 * All available Stockfish variants with runtime helpers
 */
export const STOCKFISH_VARIANTS: StockfishVariant[] = variantsData.map(
  (variant: any) => ({
    ...variant,
    isAvailable: function () {
      if (this.compatibility.needsCORS && !areCORSHeadersAvailable()) {
        return false;
      }
      if (
        this.compatibility.needsSharedArrayBuffer &&
        !isSharedArrayBufferAvailable()
      ) {
        return false;
      }
      return true;
    },
  })
);

/**
 * Get a variant by its ID
 */
export const getVariantById = (id: string): StockfishVariant | undefined => {
  return STOCKFISH_VARIANTS.find((v) => v.id === id);
};

/**
 * Get the best available variant for the current environment
 */
export const getBestAvailableVariant = (): StockfishVariant => {
  // Try to find the default variant first
  const defaultVariant = getVariantById(DEFAULT_VARIANT_ID);
  if (defaultVariant && defaultVariant.isAvailable()) {
    return defaultVariant;
  }

  // Fallback to the strongest available variant
  const available = STOCKFISH_VARIANTS.filter((v) => v.isAvailable());
  if (available.length > 0) {
    // Sort by strength (descending)
    return available.sort((a, b) => b.strength - a.strength)[0];
  }

  // Absolute fallback (shouldn't happen as ASM.js is universal)
  return STOCKFISH_VARIANTS[STOCKFISH_VARIANTS.length - 1];
};

/**
 * Get source filenames for a variant (used by vendoring script)
 */
export const getSourceFilenames = (variant: StockfishVariant): string[] => {
  const version = '17.1';
  // FIX: Full variants (wasm and single) have filenames without the variant id in the base name
  // This matches the logic in scripts/vendor-stockfish.js
  const baseName =
    variant.id === 'wasm' || variant.id === 'single'
      ? `stockfish-${version}-${variant.hash}`
      : `stockfish-${version}-${variant.id}-${variant.hash}`;

  const files = [`${baseName}.js`];

  if (variant.hasWasm) {
    if (variant.wasmParts > 0) {
      for (let i = 0; i < variant.wasmParts; i++) {
        files.push(`${baseName}-part-${i}.wasm`);
      }
    } else {
      files.push(`${baseName}.wasm`);
    }
  }

  return files;
};

/**
 * Get target filenames for a variant (used by worker)
 */
export const getTargetFilenames = (variant: StockfishVariant): string[] => {
  const files = [`stockfish-${variant.id}.js`];

  if (variant.hasWasm) {
    if (variant.wasmParts > 0) {
      for (let i = 0; i < variant.wasmParts; i++) {
        files.push(`stockfish-${variant.id}-part-${i}.wasm`);
      }
    } else {
      files.push(`stockfish-${variant.id}.wasm`);
    }
  }

  return files;
};

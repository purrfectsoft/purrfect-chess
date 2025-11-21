/**
 * Stockfish Variants Configuration
 *
 * Defines all available Stockfish 17.1 variants from the stockfish npm package
 * with metadata, compatibility requirements, and file mappings.
 *
 * Package: stockfish@17.1.0 (chess.com maintained)
 * Source: https://github.com/nmrugg/stockfish.js
 */

export interface StockfishVariant {
  /** Unique identifier for the variant (used in URLs and file names) */
  id: string;

  /** Display name shown in UI */
  name: string;

  /** Detailed description of the variant */
  description: string;

  /** File size information */
  size: {
    /** Total size in MB */
    totalMB: number;
    /** Human-readable label */
    label: string;
  };

  /** Hash used in the source filename from npm package */
  hash: string;

  /** Number of WASM parts (0 for single file, 6 for multi-part) */
  wasmParts: number;

  /** Whether this variant has a .wasm file (false for asm.js) */
  hasWasm: boolean;

  /** Relative strength rating (1-5, 5 = strongest) */
  strength: number;

  /** Compatibility requirements */
  compatibility: {
    /** Requires CORS headers (Cross-Origin-Opener-Policy, Cross-Origin-Embedder-Policy) */
    requiresCORS: boolean;

    /** Requires SharedArrayBuffer support */
    requiresSharedArrayBuffer: boolean;

    /** One-line explanation if disabled */
    disabledReason?: string;

    /** Full explanation for tooltip */
    disabledTooltip?: string;
  };

  /** Runtime check if this variant is usable in current environment */
  isAvailable: () => boolean;
}

/**
 * Check if SharedArrayBuffer is available (required for multi-threaded variants)
 */
function isSharedArrayBufferAvailable(): boolean {
  return typeof SharedArrayBuffer !== 'undefined';
}

/**
 * Check if CORS headers are properly configured
 * Note: This is a best-effort check. Multi-threaded variants will fail at runtime
 * if headers are not set, even if this returns true.
 */
function areCORSHeadersAvailable(): boolean {
  // Check if we're in a cross-origin isolated context
  if (typeof crossOriginIsolated !== 'undefined') {
    return crossOriginIsolated;
  }

  // Fallback: assume CORS headers are NOT available unless explicitly isolated
  // This is conservative - variants will show as disabled by default
  return false;
}

/**
 * All available Stockfish variants
 *
 * Ordered by strength (strongest first)
 */
export const STOCKFISH_VARIANTS: StockfishVariant[] = [
  // Full Multi-threaded WASM (strongest, requires CORS)
  {
    id: 'wasm',
    name: 'Full Multi-threaded WASM',
    description:
      'Strongest engine with multi-threading. Requires CORS headers and SharedArrayBuffer support.',
    size: {
      totalMB: 75,
      label: '~75 MB',
    },
    hash: '8e4d048',
    wasmParts: 6,
    hasWasm: true,
    strength: 5,
    compatibility: {
      requiresCORS: true,
      requiresSharedArrayBuffer: true,
      disabledReason: 'Requires CORS headers',
      disabledTooltip:
        'This variant requires Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy headers to be set on the server. Multi-threading uses SharedArrayBuffer which requires cross-origin isolation.',
    },
    isAvailable: () =>
      isSharedArrayBufferAvailable() && areCORSHeadersAvailable(),
  },

  // Full Single-threaded WASM (strongest without CORS, DEFAULT)
  {
    id: 'single',
    name: 'Full Single-threaded WASM',
    description:
      'Full-strength engine, single-threaded. No CORS headers required. Best balance of strength and compatibility.',
    size: {
      totalMB: 75,
      label: '~75 MB',
    },
    hash: 'a496a04',
    wasmParts: 6,
    hasWasm: true,
    strength: 5,
    compatibility: {
      requiresCORS: false,
      requiresSharedArrayBuffer: false,
    },
    isAvailable: () => true, // Always available (no special requirements)
  },

  // Lite Multi-threaded WASM
  {
    id: 'lite',
    name: 'Lite Multi-threaded WASM',
    description:
      'Smaller NNUE network with multi-threading. Requires CORS headers. Moderate strength.',
    size: {
      totalMB: 7,
      label: '~7 MB',
    },
    hash: '51f59da',
    wasmParts: 0,
    hasWasm: true,
    strength: 3,
    compatibility: {
      requiresCORS: true,
      requiresSharedArrayBuffer: true,
      disabledReason: 'Requires CORS headers',
      disabledTooltip:
        'This variant requires Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy headers to be set on the server. Multi-threading uses SharedArrayBuffer which requires cross-origin isolation.',
    },
    isAvailable: () =>
      isSharedArrayBufferAvailable() && areCORSHeadersAvailable(),
  },

  // Lite Single-threaded WASM (previous default)
  {
    id: 'lite-single',
    name: 'Lite Single-threaded WASM',
    description:
      'Smaller NNUE network, single-threaded. Fast download, no CORS required. Moderate strength.',
    size: {
      totalMB: 7,
      label: '~7 MB',
    },
    hash: '03e3232',
    wasmParts: 0,
    hasWasm: true,
    strength: 3,
    compatibility: {
      requiresCORS: false,
      requiresSharedArrayBuffer: false,
    },
    isAvailable: () => true, // Always available
  },

  // ASM.js fallback (weakest, universal compatibility)
  {
    id: 'asm',
    name: 'ASM.js Fallback',
    description:
      'JavaScript-only implementation. Compatible with all browsers. Weakest performance.',
    size: {
      totalMB: 10,
      label: '~10 MB',
    },
    hash: '341ff22',
    wasmParts: 0,
    hasWasm: false,
    strength: 1,
    compatibility: {
      requiresCORS: false,
      requiresSharedArrayBuffer: false,
    },
    isAvailable: () => true, // Always available
  },
];

/**
 * Default variant ID
 * Full Single-threaded WASM: Strongest without CORS requirements
 */
export const DEFAULT_VARIANT_ID = 'single';

/**
 * Get variant by ID
 */
export function getVariantById(id: string): StockfishVariant | undefined {
  return STOCKFISH_VARIANTS.find((v) => v.id === id);
}

/**
 * Get the best available variant based on current environment
 * Returns the strongest variant that is currently usable
 */
export function getBestAvailableVariant(): StockfishVariant {
  // Try to find an available variant, preferring stronger ones
  const available = STOCKFISH_VARIANTS.find((v) => v.isAvailable());

  // Fallback to ASM.js if nothing else works (should never happen)
  return available || STOCKFISH_VARIANTS[STOCKFISH_VARIANTS.length - 1];
}

/**
 * Get all currently available variants
 */
export function getAvailableVariants(): StockfishVariant[] {
  return STOCKFISH_VARIANTS.filter((v) => v.isAvailable());
}

/**
 * Get source filenames for a variant (as they appear in node_modules)
 */
export function getSourceFilenames(variant: StockfishVariant): string[] {
  const baseName = `stockfish-17.1-${variant.id}-${variant.hash}`;
  const files: string[] = [];

  // JS file
  files.push(`${baseName}.js`);

  // WASM file(s)
  if (variant.hasWasm) {
    if (variant.wasmParts > 0) {
      // Multi-part WASM
      for (let i = 0; i < variant.wasmParts; i++) {
        files.push(`${baseName}-part-${i}.wasm`);
      }
    } else {
      // Single WASM file
      files.push(`${baseName}.wasm`);
    }
  }

  return files;
}

/**
 * Get target filenames for a variant (as they should be copied to public/libs)
 */
export function getTargetFilenames(variant: StockfishVariant): string[] {
  const files: string[] = [];

  // JS file
  files.push(`stockfish-${variant.id}.js`);

  // WASM file(s)
  if (variant.hasWasm) {
    if (variant.wasmParts > 0) {
      // Multi-part WASM
      for (let i = 0; i < variant.wasmParts; i++) {
        files.push(`stockfish-${variant.id}-part-${i}.wasm`);
      }
    } else {
      // Single WASM file
      files.push(`stockfish-${variant.id}.wasm`);
    }
  }

  return files;
}

'use client';

import { observer } from 'mobx-react-lite';
import { useRootStore } from '@/stores/store-setup';
import {
    STOCKFISH_VARIANTS,
    getVariantById,
} from '@/lib/stockfish-variants';
import { useState } from 'react';

/**
 * EngineVariantSelector Component
 *
 * Dropdown selector for choosing Stockfish engine variant.
 * Displays all available variants with metadata, disables incompatible ones,
 * and shows informative tooltips explaining requirements.
 *
 * Features:
 * - Shows variant name, strength indicator, and file size
 * - Disables multi-threaded variants if CORS headers unavailable
 * - Tooltip explanations for disabled variants
 * - Matches EnginePanel dark theme
 * - Prevents switching during active analysis
 */

import { Tooltip } from '@/components/ui/Tooltip';

/**
 * Get strength indicator emoji
 */
function getStrengthIndicator(strength: number): string {
    if (strength >= 5) return '⚡⚡⚡⚡⚡';
    if (strength >= 4) return '⚡⚡⚡⚡';
    if (strength >= 3) return '⚡⚡⚡';
    if (strength >= 2) return '⚡⚡';
    return '⚡';
}

const EngineVariantSelector = observer(function EngineVariantSelector() {
    const store = useRootStore();
    const engine = store.engine;

    const selectedVariantId = engine.selectedVariant;
    const isAnalyzing = engine.isAnalyzing;

    const handleVariantChange = (variantId: string) => {
        if (isAnalyzing) {
            // Don't allow switching during analysis
            return;
        }

        const variant = getVariantById(variantId);
        if (variant && variant.isAvailable()) {
            engine.setSelectedVariant(variantId);
            // Engine will be reinitialized on next analysis start
        }
    };

    const selectedVariant = getVariantById(selectedVariantId);

    return (
        <div className="mb-4">
            {/* Label */}
            <label
                className="block text-sm mb-2"
                style={{ color: '#dcdcdc' }}
                htmlFor="variant-selector"
            >
                Engine Variant:
            </label>

            {/* Dropdown */}
            <select
                id="variant-selector"
                value={selectedVariantId}
                onChange={(e) => handleVariantChange(e.target.value)}
                disabled={isAnalyzing}
                className="w-full px-3 py-2 rounded-lg text-sm font-mono"
                style={{
                    background: '#1f1f1f',
                    border: '1px solid #444',
                    color: '#f0f0f0',
                    cursor: isAnalyzing ? 'not-allowed' : 'pointer',
                    opacity: isAnalyzing ? 0.6 : 1,
                }}
            >
                {STOCKFISH_VARIANTS.map((variant) => {
                    const isAvailable = variant.isAvailable();
                    const label = isAvailable
                        ? `${variant.name} - ${getStrengthIndicator(variant.strength)} ${variant.size.label}`
                        : `${variant.name} - ${variant.compatibility.disabledReason || 'Unavailable'}`;

                    return (
                        <option
                            key={variant.id}
                            value={variant.id}
                            disabled={!isAvailable}
                            style={{
                                color: isAvailable ? '#f0f0f0' : '#777',
                            }}
                        >
                            {label}
                        </option>
                    );
                })}
            </select>

            {/* Variant Info */}
            {selectedVariant && (
                <div
                    className="mt-2 text-xs rounded-lg p-2"
                    style={{
                        background: '#1f1f1f',
                        border: '1px solid #444',
                        color: '#999',
                    }}
                >
                    <div className="flex items-start gap-2">
                        <div className="flex-1">
                            <div style={{ color: '#ddd' }} className="font-semibold mb-1">
                                {selectedVariant.name}
                            </div>
                            <div>{selectedVariant.description}</div>
                            <div className="mt-1">
                                <span style={{ color: '#aaa' }}>Strength: </span>
                                <span style={{ color: '#f0f0f0' }}>
                                    {getStrengthIndicator(selectedVariant.strength)}
                                </span>
                                <span className="mx-2">•</span>
                                <span style={{ color: '#aaa' }}>Size: </span>
                                <span style={{ color: '#f0f0f0' }}>
                                    {selectedVariant.size.label}
                                </span>
                            </div>
                        </div>

                        {/* Info tooltip for unavailable variants */}
                        {!selectedVariant.isAvailable() &&
                            selectedVariant.compatibility.disabledTooltip && (
                                <Tooltip text={selectedVariant.compatibility.disabledTooltip}>
                                    <div
                                        className="flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold"
                                        style={{
                                            background: '#dc2626',
                                            color: '#fff',
                                            cursor: 'help',
                                        }}
                                    >
                                        !
                                    </div>
                                </Tooltip>
                            )}
                    </div>
                </div>
            )}

            {/* Warning when analyzing */}
            {isAnalyzing && (
                <div
                    className="mt-2 text-xs px-2 py-1 rounded"
                    style={{
                        background: 'rgba(245, 158, 11, 0.1)',
                        border: '1px solid rgba(245, 158, 11, 0.3)',
                        color: '#f59e0b',
                    }}
                >
                    ⚠️ Stop analysis to change variant
                </div>
            )}
        </div>
    );
});

export default EngineVariantSelector;

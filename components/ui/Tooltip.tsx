import React, { useState } from 'react';

interface TooltipProps {
    text: string;
    children: React.ReactNode;
}

/**
 * Simple tooltip component
 */
export function Tooltip({ text, children }: TooltipProps) {
    const [isVisible, setIsVisible] = useState(false);

    return (
        <div
            className="relative inline-block"
            onMouseEnter={() => setIsVisible(true)}
            onMouseLeave={() => setIsVisible(false)}
            onFocus={() => setIsVisible(true)}
            onBlur={() => setIsVisible(false)}
            role="tooltip"
            aria-describedby={isVisible ? 'tooltip-content' : undefined}
            tabIndex={0}
        >
            {children}
            {isVisible && (
                <div
                    id="tooltip-content"
                    role="tooltip"
                    className="absolute z-50 px-3 py-2 text-xs rounded-lg shadow-lg whitespace-normal max-w-xs bg-gray-900 border border-gray-700 text-gray-200 bottom-full left-1/2 -translate-x-1/2 mb-2 pointer-events-none"
                >
                    {text}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-gray-700" />
                </div>
            )}
        </div>
    );
}

import React, { useRef } from 'react';

// Reusing existing drag hooks logic for stability
export const useVerticalDrag = (
    ref: React.RefObject<HTMLElement | null>,
    value: number,
    min: number,
    max: number,
    step: number,
    onChange: (val: number) => void
) => {
    const handlePointerDown = (e: React.PointerEvent) => {
        const element = ref.current;
        if (!element) return;
        e.preventDefault(); e.stopPropagation(); 
        element.setPointerCapture(e.pointerId);
        const rect = element.getBoundingClientRect();
        
        const calculateAndOnChange = (clientY: number) => {
            const height = rect.height;
            const relativeY = rect.bottom - clientY; 
            let percent = relativeY / height;
            if (percent < 0) percent = 0; if (percent > 1) percent = 1;
            let newValue = min + percent * (max - min);
            if (step > 0) newValue = Math.round(newValue / step) * step;
            onChange(Math.min(Math.max(newValue, min), max));
        };
        calculateAndOnChange(e.clientY);
        const onPointerMove = (ev: PointerEvent) => { if (ev.pointerId === e.pointerId) calculateAndOnChange(ev.clientY); };
        const onPointerUp = (ev: PointerEvent) => {
            if (ev.pointerId === e.pointerId) {
                element.releasePointerCapture(ev.pointerId);
                element.removeEventListener('pointermove', onPointerMove);
                element.removeEventListener('pointerup', onPointerUp);
            }
        };
        element.addEventListener('pointermove', onPointerMove);
        element.addEventListener('pointerup', onPointerUp);
    };
    return { handlePointerDown };
};

export const useHorizontalDrag = (
    ref: React.RefObject<HTMLElement | null>,
    value: number,
    min: number,
    max: number,
    step: number,
    onChange: (val: number) => void
) => {
    const handlePointerDown = (e: React.PointerEvent) => {
        const element = ref.current;
        if (!element) return;
        e.preventDefault(); e.stopPropagation();
        element.setPointerCapture(e.pointerId);
        const rect = element.getBoundingClientRect();
        
        const calculateAndOnChange = (clientX: number) => {
            const width = rect.width;
            const relativeX = clientX - rect.left;
            let percent = relativeX / width;
            if (percent < 0) percent = 0; if (percent > 1) percent = 1;
            let newValue = min + percent * (max - min);
            if (step > 0) newValue = Math.round(newValue / step) * step;
            onChange(Math.min(Math.max(newValue, min), max));
        };
        calculateAndOnChange(e.clientX);
        const onPointerMove = (ev: PointerEvent) => { if (ev.pointerId === e.pointerId) calculateAndOnChange(ev.clientX); };
        const onPointerUp = (ev: PointerEvent) => {
            if (ev.pointerId === e.pointerId) {
                element.releasePointerCapture(ev.pointerId);
                element.removeEventListener('pointermove', onPointerMove);
                element.removeEventListener('pointerup', onPointerUp);
            }
        };
        element.addEventListener('pointermove', onPointerMove);
        element.addEventListener('pointerup', onPointerUp);
    };
    return { handlePointerDown };
};

// --- PRO COMPONENTS ---

export const Knob = ({ value, min, max, onChange, label, color = "cyan", size = "normal", resetValue }: any) => {
    const ref = useRef<HTMLDivElement>(null);
    const { handlePointerDown } = useVerticalDrag(ref, value, min, max, 0.01, onChange);
    
    // Calculate rotation (-135deg to 135deg)
    const percent = (value - min) / (max - min);
    const rotation = -135 + (percent * 270);
    const isBig = size === "large";

    const handleDoubleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (resetValue !== undefined) onChange(resetValue);
    };

    return (
        <div className="flex flex-col items-center gap-1 group">
            <div 
                ref={ref}
                onPointerDown={handlePointerDown}
                onDoubleClick={handleDoubleClick}
                className={`relative rounded-full bg-gray-800 shadow-[0_4px_6px_rgba(0,0,0,0.5),inset_0_-2px_4px_rgba(255,255,255,0.1)] border border-gray-700 cursor-pointer touch-none hover:brightness-110 active:brightness-95 transition-all
                    ${isBig ? 'w-16 h-16' : 'w-12 h-12'} flex items-center justify-center`}
                title="Double click to reset"
            >
                {/* Center Cap */}
                <div className={`${isBig ? 'w-12 h-12' : 'w-9 h-9'} rounded-full bg-gradient-to-b from-gray-700 to-gray-900 shadow-inner flex items-center justify-center`}>
                     {/* Indicator Line */}
                     <div 
                        className={`absolute w-1 rounded-full bg-${color}-500 shadow-[0_0_5px_currentColor] origin-bottom`}
                        style={{ 
                            height: isBig ? '24px' : '18px',
                            bottom: '50%',
                            transform: `rotate(${rotation}deg)` 
                        }}
                    ></div>
                </div>
                
                {/* Value Arc (Visual only, simple SVG) */}
                <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none opacity-40">
                    <circle 
                        cx="50%" cy="50%" r={isBig ? "28" : "20"} 
                        fill="none" stroke="currentColor" strokeWidth="2"
                        strokeDasharray={isBig ? 175 : 125}
                        strokeDashoffset={(isBig ? 175 : 125) * (1 - percent)}
                        className={`text-${color}-500 transition-all duration-75`}
                    />
                </svg>
            </div>
            {label && <span className="text-[10px] text-gray-400 font-tech tracking-wider">{label}</span>}
        </div>
    );
};

export const Fader = ({ value, onChange, color="gray", vertical = false, height = "h-40", resetValue }: any) => {
    const ref = useRef<HTMLDivElement>(null);
    const min = vertical ? 0 : -1;
    const max = vertical ? 1 : 1;
    
    // Conditionally use drag hook based on orientation
    const dragHook = vertical 
        ? useVerticalDrag(ref, value, min, max, 0.005, onChange)
        : useHorizontalDrag(ref, value, min, max, 0.005, onChange);

    const percent = vertical 
        ? value * 100 
        : ((value + 1) / 2) * 100;

    const handleDoubleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (resetValue !== undefined) onChange(resetValue);
    };

    return vertical ? (
        <div className="flex flex-col items-center w-full">
            <div 
                ref={ref}
                onPointerDown={dragHook.handlePointerDown}
                onDoubleClick={handleDoubleClick}
                className={`relative ${height} w-10 bg-gray-950 rounded-md border border-gray-800 shadow-inner cursor-pointer touch-none`}
                title="Double click to reset"
            >
                {/* Track Line */}
                <div className="absolute left-1/2 -translate-x-1/2 top-2 bottom-2 w-1 bg-black rounded-full shadow-[inset_0_0_2px_rgba(255,255,255,0.2)]"></div>
                
                {/* Thumb */}
                <div 
                    className={`absolute left-1/2 w-12 h-8 -ml-6 bg-gradient-to-b from-gray-600 to-gray-800 rounded shadow-[0_4px_6px_rgba(0,0,0,0.6)] border-t border-gray-500 z-10`}
                    style={{ bottom: `calc(${percent}% - 16px)` }}
                >
                    <div className="w-full h-full flex flex-col items-center justify-center gap-[2px]">
                        <div className="w-8 h-[1px] bg-gray-900"></div>
                        <div className={`w-8 h-[2px] bg-${color}-500 shadow-[0_0_5px_currentColor]`}></div>
                        <div className="w-8 h-[1px] bg-gray-900"></div>
                    </div>
                </div>
            </div>
        </div>
    ) : (
        // Horizontal Crossfader
        <div className="w-full py-2 flex justify-center">
            <div 
                ref={ref}
                onPointerDown={dragHook.handlePointerDown}
                onDoubleClick={handleDoubleClick}
                className="w-full h-10 bg-gray-950 rounded border border-gray-800 relative flex items-center cursor-pointer touch-none shadow-inner"
            >
                {/* Track */}
                <div className="absolute left-2 right-2 h-1 bg-black top-1/2 -translate-y-1/2 rounded-full"></div>
                 {/* Center Marker */}
                <div className="absolute left-1/2 -translate-x-1/2 w-[1px] h-full bg-gray-700"></div>
                
                {/* Thumb */}
                <div 
                    className="absolute w-8 h-full bg-gradient-to-b from-gray-500 to-gray-800 rounded shadow-[0_0_5px_rgba(0,0,0,0.5)] border-t border-gray-400 z-10 flex items-center justify-center"
                    style={{ 
                        left: `${percent}%`,
                        transform: 'translate(-50%, 0)'
                    }}
                >
                    <div className="w-[2px] h-6 bg-white shadow-[0_0_5px_white]"></div>
                </div>
            </div>
        </div>
    );
};
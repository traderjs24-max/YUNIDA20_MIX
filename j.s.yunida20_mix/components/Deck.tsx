import React, { useRef, useEffect } from 'react';
import { Upload, Play, Pause, RotateCcw, FastForward, Rewind, Repeat, Trash2, ArrowLeftRight } from 'lucide-react';
import { useVerticalDrag, Knob } from './Controls';
import { FXType } from '../hooks/useDeckAudio';

// Helper to draw static waveform (Overview) with gradient
const drawWaveform = (buffer: AudioBuffer, canvas: HTMLCanvasElement, color: string) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const width = canvas.width;
    const height = canvas.height;
    const data = buffer.getChannelData(0);
    const step = Math.ceil(data.length / width);
    const amp = height / 2;

    ctx.clearRect(0, 0, width, height);

    // Create gradient based on color
    const hex = color === 'cyan' ? '#22d3ee' : '#e879f9'; // Cyan-400 or Fuchsia-400
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, hex);
    gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.5)');
    gradient.addColorStop(1, hex);
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    
    for (let i = 0; i < width; i++) {
        let min = 1.0;
        let max = -1.0;
        for (let j = 0; j < step; j++) {
            const datum = data[(i * step) + j];
            if (datum < min) min = datum;
            if (datum > max) max = datum;
        }
        ctx.fillRect(i, (1 + min) * amp, 1, Math.max(1, (max - min) * amp));
    }
};

interface DeckProps {
  id: string;
  title: string;
  color: string;
  audioState: any;
  onSync: () => void;
}

const Deck: React.FC<DeckProps> = ({ id, title, color, audioState, onSync }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const speedSliderRef = useRef<HTMLDivElement>(null);
  const waveformRef = useRef<HTMLCanvasElement>(null); // Overview Waveform
  const zoomedWaveformRef = useRef<HTMLCanvasElement>(null); // Moving Waveform
  
  const { 
    loadFile, isPlaying, togglePlay, toggleLoop, isLooping, pause, play,
    fileName, duration, currentTime, bpm, isBpmAnalyzing, audioBuffer,
    pitch, playbackRate, setSpeed, setBendAmount, seek, 
    isReverse, toggleReverse,
    isWidePitch, toggleWidePitch,
    hotCues, triggerHotCue, deleteHotCue,
    activeFX, setActiveFX, fxWet, setFxWet,
    tapBpm
  } = audioState;

  // Sync currentTime to a ref for the animation loop to read without triggering re-renders
  const currentTimeRef = useRef(currentTime);
  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);

  // --- Scubbing State ---
  const isScrubbingRef = useRef(false);
  const wasPlayingRef = useRef(false);
  const lastXRef = useRef(0);

  // Adjust drag range based on Wide Mode
  const minPitch = isWidePitch ? 0.5 : 0.92;
  const maxPitch = isWidePitch ? 1.5 : 1.08;
  const { handlePointerDown: handleSpeedDrag } = useVerticalDrag(speedSliderRef, pitch, minPitch, maxPitch, 0.0005, setSpeed);
  
  const handleBend = (amount: number) => (e: React.PointerEvent) => { e.preventDefault(); setBendAmount(amount); };
  const releaseBend = (e: React.PointerEvent) => { e.preventDefault(); setBendAmount(0); };
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files?.[0]) loadFile(e.target.files[0]); };

  // Draw Full Waveform on load
  useEffect(() => {
      if (audioBuffer && waveformRef.current) {
          drawWaveform(audioBuffer, waveformRef.current, color);
      }
  }, [audioBuffer, color]);

  // --- Zoomed Moving Waveform Logic ---
  useEffect(() => {
    if (!zoomedWaveformRef.current || !audioBuffer) return;
    const canvas = zoomedWaveformRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Gradient Setup
    const hexColor = color === 'cyan' ? '#22d3ee' : '#e879f9';
    const darkHex = color === 'cyan' ? '#083344' : '#4a044e';
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, hexColor);
    gradient.addColorStop(0.5, darkHex);
    gradient.addColorStop(1, hexColor);

    const data = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
    
    // Config
    const zoomSeconds = 4; // Total seconds visible in window
    const pixelsPerSecond = canvas.width / zoomSeconds;
    
    let animationId: number;

    const drawZoomed = () => {
        // Read current time from Ref to avoid closure staleness without re-running effect
        const now = currentTimeRef.current;

        // Clear
        ctx.fillStyle = '#020617'; // Very dark slate (slate-950)
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Horizontal Center Line
        ctx.strokeStyle = '#1e293b'; // slate-800
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, canvas.height / 2);
        ctx.lineTo(canvas.width, canvas.height / 2);
        ctx.stroke();

        // Grid lines (Beats - approximation based on BPM)
        // Draw vertical lines every second relative to currentTime
        ctx.strokeStyle = '#334155'; // slate-700
        const startSecond = Math.floor(now - (zoomSeconds / 2));
        const endSecond = Math.ceil(now + (zoomSeconds / 2));
        
        ctx.beginPath();
        for (let s = startSecond; s <= endSecond; s++) {
            const timeDiff = s - now;
            const x = (canvas.width / 2) + (timeDiff * pixelsPerSecond);
            if (x >= 0 && x <= canvas.width) {
                ctx.moveTo(x, 0);
                ctx.lineTo(x, canvas.height);
            }
        }
        ctx.stroke();

        // Waveform
        ctx.fillStyle = gradient;

        const samplesPerPixel = sampleRate / pixelsPerSecond;
        const centerSample = Math.floor(now * sampleRate);
        const halfWidth = canvas.width / 2;
        
        // Draw visible range
        // Optimization: Draw 1 line per pixel column
        for (let x = 0; x < canvas.width; x += 2) { // Step 2 for performance
            const offsetPixels = x - halfWidth;
            const sampleIndex = centerSample + Math.floor(offsetPixels * samplesPerPixel);
            
            if (sampleIndex >= 0 && sampleIndex < data.length) {
                const amplitude = data[sampleIndex];
                // Scale height
                const h = Math.abs(amplitude) * canvas.height * 0.9;
                const y = (canvas.height - h) / 2;
                // Add a small width (2px) to ensure visibility
                ctx.fillRect(x, y, 2, h); 
            } else {
                // Draw flat line for silence
                ctx.fillStyle = '#334155'; 
                ctx.fillRect(x, canvas.height / 2 - 0.5, 2, 1);
                ctx.fillStyle = gradient; // Restore
            }
        }

        // Center Playhead
        ctx.beginPath();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.moveTo(canvas.width / 2, 0);
        ctx.lineTo(canvas.width / 2, canvas.height);
        ctx.stroke();

        // Playhead Glow
        ctx.shadowColor = hexColor;
        ctx.shadowBlur = 15;
        ctx.stroke();
        ctx.shadowBlur = 0;

        animationId = requestAnimationFrame(drawZoomed);
    };

    drawZoomed();

    return () => cancelAnimationFrame(animationId);
  }, [audioBuffer, color]); // REMOVED currentTime from dependencies to prevent thrashing


  // --- Scrubbing Handlers ---
  const handleScrubStart = (e: React.PointerEvent) => {
      if (!duration) return;
      e.preventDefault();
      zoomedWaveformRef.current?.setPointerCapture(e.pointerId);
      isScrubbingRef.current = true;
      wasPlayingRef.current = isPlaying;
      lastXRef.current = e.clientX;
      if (isPlaying) pause();
  };

  const handleScrubMove = (e: React.PointerEvent) => {
      if (!isScrubbingRef.current || !duration) return;
      e.preventDefault();
      
      const deltaX = e.clientX - lastXRef.current;
      lastXRef.current = e.clientX;
      
      const canvas = zoomedWaveformRef.current;
      if (!canvas) return;
      
      // Calculate time delta based on zoom
      const zoomSeconds = 4;
      const pixelsPerSecond = canvas.width / zoomSeconds;
      
      const newTime = Math.max(0, Math.min(duration, currentTime - (deltaX / pixelsPerSecond))); // Inverted drag logic for "Grabbing surface" feel
      seek(newTime);
  };

  const handleScrubEnd = (e: React.PointerEvent) => {
      if (!isScrubbingRef.current) return;
      isScrubbingRef.current = false;
      zoomedWaveformRef.current?.releasePointerCapture(e.pointerId);
      if (wasPlayingRef.current) play();
  };


  const formatTime = (time: number) => {
    const min = Math.floor(time / 60);
    const sec = Math.floor(time % 60);
    const ms = Math.floor((time % 1) * 100);
    return `${min}:${sec.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  const remainingTime = Math.max(0, duration - currentTime);
  const isEnding = duration > 0 && remainingTime < 30;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  
  const neonText = color === 'cyan' ? 'text-cyan-400' : 'text-fuchsia-400';
  const neonBg = color === 'cyan' ? 'bg-cyan-500' : 'bg-fuchsia-500';
  const neonBorder = color === 'cyan' ? 'border-cyan-500/50' : 'border-fuchsia-500/50';

  return (
    <div className={`bg-gray-900 border-2 ${neonBorder} rounded-lg p-1 flex flex-col gap-1 shadow-[0_0_20px_rgba(0,0,0,0.5)] flex-1 min-w-[350px] relative overflow-hidden transition-all duration-300 ${isPlaying ? 'shadow-[0_0_30px_rgba(0,0,0,0.6)] ring-1 ring-white/10' : ''}`}>
      
      {/* Top Info Display */}
      <div className="bg-black border border-gray-800 rounded p-3 flex justify-between items-end h-28 relative mb-2 flex-shrink-0">
         {/* Track Text */}
         <div className="flex flex-col justify-between h-full w-2/3 overflow-hidden">
             <div 
                className={`text-xs font-bold uppercase cursor-pointer hover:bg-gray-800 p-1 rounded inline-flex items-center gap-1 ${neonText} transition-colors`}
                onClick={() => fileInputRef.current?.click()}
             >
                 <Upload size={12} /> {fileName || "NO TRACK LOADED"}
             </div>
             <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={handleFileChange} />
             
             <div className="font-mono text-3xl text-white tracking-widest mt-1 flex items-center gap-2">
                 {formatTime(currentTime)}
                 {isReverse && <span className="text-[10px] text-red-500 border border-red-500 px-1 rounded animate-pulse">REV</span>}
             </div>
             <div className="text-[10px] text-gray-500 flex gap-4">
                 <span>REMAIN <span className={`${isEnding ? 'text-red-500 animate-pulse font-bold' : 'text-white'}`}>{formatTime(remainingTime)}</span></span>
             </div>
         </div>

         {/* BPM & Sync */}
         <div className="flex flex-col items-end justify-between h-full">
             <div className="text-right">
                 <div className="text-[10px] text-gray-500 font-bold flex items-center justify-end gap-1">
                    BPM 
                    <button 
                        onClick={(e) => { e.stopPropagation(); tapBpm(); }}
                        className="text-[9px] bg-gray-800 border border-gray-600 px-1 rounded hover:bg-gray-700 active:scale-95"
                        title="Manual Tap BPM"
                    >
                        TAP
                    </button>
                 </div>
                 <div className={`text-2xl font-mono leading-none transition-all duration-300
                    ${isBpmAnalyzing ? 'text-yellow-400 animate-pulse text-xl mt-1' : (isPlaying ? `text-white drop-shadow-[0_0_5px_rgba(255,255,255,0.8)]` : 'text-white')}
                 `}>
                    {isBpmAnalyzing ? 'ANALYZING' : (bpm * Math.abs(playbackRate)).toFixed(1)}
                 </div>
             </div>
             <button 
                onClick={onSync}
                className="bg-gray-800 hover:bg-gray-700 text-xs px-2 py-1 rounded border border-gray-600 active:scale-95 transition-all text-white font-bold"
             >
                 SYNC
             </button>
         </div>
      </div>

      {/* Full Waveform Overview (Seek Bar) */}
      <div 
        className="h-8 bg-black border border-gray-800 relative cursor-pointer opacity-80 hover:opacity-100 transition-opacity mb-1 flex-shrink-0 overflow-hidden"
        onClick={(e) => {
             if (!duration) return;
             const rect = e.currentTarget.getBoundingClientRect();
             const p = (e.clientX - rect.left) / rect.width;
             seek(p * duration);
        }}
      >
          <canvas ref={waveformRef} width={400} height={32} className="w-full h-full" />
          <div className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_5px_white]" style={{ left: `${progress}%` }}></div>
      </div>

      {/* Center Area: Zoomed Scrubbable Waveform */}
      <div className="flex-grow flex flex-col justify-center py-1 relative min-h-0 bg-black/40 rounded border border-gray-800 overflow-hidden group">
          <canvas 
            ref={zoomedWaveformRef}
            width={600} 
            height={150}
            className={`w-full h-full cursor-grab active:cursor-grabbing touch-none ${!audioBuffer ? 'opacity-20' : ''}`}
            onPointerDown={handleScrubStart}
            onPointerMove={handleScrubMove}
            onPointerUp={handleScrubEnd}
            onPointerLeave={handleScrubEnd}
          />
          {!audioBuffer && (
              <div className="absolute inset-0 flex items-center justify-center text-gray-600 font-tech tracking-widest pointer-events-none">
                  NO SIGNAL
              </div>
          )}
      </div>

      <div className="flex gap-2 p-2 pt-0 flex-shrink-0 mt-2">
          {/* Left: FX & Cues */}
          <div className="flex flex-col gap-2 w-1/4">
              {/* FX Unit */}
              <div className="bg-gray-800/50 rounded p-1 border border-gray-700 flex flex-col gap-1">
                  <span className="text-[8px] text-gray-400 font-bold text-center">TRACK FX</span>
                  <div className="grid grid-cols-3 gap-0.5 text-[7px]">
                      {['ECHO', 'REVERB', 'FLANGER'].map((fx) => (
                          <button 
                            key={fx}
                            onClick={() => setActiveFX(activeFX === fx ? 'NONE' : fx as FXType)}
                            className={`p-1 rounded text-center border ${activeFX === fx ? `${neonBg} text-black border-transparent font-bold` : 'bg-gray-900 text-gray-400 border-gray-600'}`}
                          >
                              {fx.substring(0,3)}
                          </button>
                      ))}
                  </div>
                  {activeFX !== 'NONE' && (
                      <div className="flex flex-col items-center">
                          <Knob value={fxWet} min={0} max={1} onChange={setFxWet} label="" color={color} resetValue={0} />
                      </div>
                  )}
              </div>

              {/* Hot Cues */}
              <div className="grid grid-cols-3 gap-1 mt-auto">
                  {hotCues.map((cue: number | null, i: number) => (
                      <div key={i} className="relative group">
                          <button
                            onClick={() => triggerHotCue(i)}
                            className={`w-full aspect-square rounded border border-gray-700 text-xs transition-all active:scale-95
                                ${cue !== null ? `${neonBg} text-black shadow-[0_0_5px_currentColor]` : 'bg-gray-800 text-gray-500'}`}
                          >
                              {i + 1}
                          </button>
                          {cue !== null && (
                            <button onClick={(e) => deleteHotCue(i, e)} className="absolute -top-1 -right-1 bg-red-900 text-red-200 rounded-full p-0.5 opacity-0 group-hover:opacity-100"><Trash2 size={8} /></button>
                          )}
                      </div>
                  ))}
              </div>
          </div>

          {/* Center: Transport */}
          <div className="flex flex-col gap-2 items-center flex-grow justify-end pb-1">
               <div className="flex gap-3">
                   {/* Reverse Button */}
                   <button onClick={toggleReverse} className={`w-8 h-8 rounded-full border flex flex-col items-center justify-center transition-all ${isReverse ? 'bg-red-500/20 border-red-500 text-red-500' : 'border-gray-600 text-gray-400'}`} title="Reverse Playback">
                       <ArrowLeftRight size={12} />
                   </button>
                   <button onClick={toggleLoop} className={`w-8 h-8 rounded-full border flex flex-col items-center justify-center transition-all ${isLooping ? 'bg-yellow-500/20 border-yellow-500 text-yellow-500' : 'border-gray-600 text-gray-400'}`} title="Loop">
                       <Repeat size={12} />
                   </button>
                   <button onClick={() => seek(0)} className="w-8 h-8 rounded-full border border-gray-600 text-gray-400 flex flex-col items-center justify-center bg-gray-800" title="Cue / Reset">
                       <RotateCcw size={12} />
                   </button>
               </div>
               <button 
                   onClick={togglePlay} 
                   disabled={!fileName} 
                   className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-200 shadow-xl border-4 
                   ${isPlaying 
                        ? 'bg-green-500 border-green-400 text-black shadow-[0_0_25px_rgba(34,197,94,0.7)] scale-105' 
                        : 'bg-gray-700 border-gray-800 text-gray-400 hover:bg-gray-600 hover:text-gray-200'}`}
               >
                   {isPlaying ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" className="ml-1" />}
               </button>
          </div>

          {/* Right: Pitch */}
          <div className="w-10 flex flex-col items-center bg-black/30 rounded border border-gray-800 py-1 h-full">
              <button 
                onClick={() => setSpeed(1)}
                className="text-[8px] text-gray-500 mb-1 font-bold cursor-pointer hover:text-white transition-colors uppercase tracking-wider"
                title="Reset Tempo"
              >
                RST
              </button>
              <div 
                ref={speedSliderRef} 
                onPointerDown={handleSpeedDrag} 
                onDoubleClick={(e) => { e.stopPropagation(); setSpeed(1); }}
                title="Double click to reset pitch"
                className="w-6 flex-grow relative bg-gray-900 rounded border border-gray-700 cursor-pointer touch-none h-24"
              >
                  <div className="absolute top-1/2 w-full h-[1px] bg-gray-500"></div>
                  <div className="absolute left-0 w-full h-8 bg-gradient-to-b from-gray-600 to-gray-800 rounded shadow-md border-t border-gray-500 z-10" 
                    style={{ 
                        bottom: `${((pitch - minPitch) / (maxPitch - minPitch)) * 100}%`, 
                        transform: 'translateY(50%)' 
                    }}>
                       <div className="w-full h-[1px] bg-white absolute top-1/2 -translate-y-1/2 shadow-[0_0_5px_white]"></div>
                  </div>
              </div>
              <div className="flex flex-col gap-1 mt-1 w-full px-0.5 items-center">
                  <button onClick={toggleWidePitch} className={`text-[7px] w-full border rounded px-0.5 font-bold ${isWidePitch ? 'bg-red-900 text-red-200 border-red-500' : 'bg-gray-800 text-gray-500 border-gray-600'}`}>
                      {isWidePitch ? 'WIDE' : '±8%'}
                  </button>
                  <div className="flex gap-1">
                    <button onPointerDown={handleBend(0.04)} onPointerUp={releaseBend} onPointerLeave={releaseBend} className="bg-gray-800 border border-gray-600 rounded p-0.5"><FastForward size={8} className="-rotate-90" /></button>
                    <button onPointerDown={handleBend(-0.04)} onPointerUp={releaseBend} onPointerLeave={releaseBend} className="bg-gray-800 border border-gray-600 rounded p-0.5"><Rewind size={8} className="-rotate-90" /></button>
                  </div>
              </div>
          </div>
      </div>
    </div>
  );
};

export default Deck;
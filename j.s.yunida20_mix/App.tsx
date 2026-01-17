import React, { useState, useEffect, useRef } from 'react';
import Deck from './components/Deck';
import Mixer from './components/Mixer';
import Library from './components/Library';
import { useDeckAudio } from './hooks/useDeckAudio';
import { resumeAudioContext } from './utils/audioContext';

const App: React.FC = () => {
  const [crossfader, setCrossfader] = useState(0); 
  
  // Lifted Mixer State for Keyboard Control
  const [volA, setVolA] = useState(0.8);
  const [volB, setVolB] = useState(0.8);
  const [trimA, setTrimA] = useState(1);
  const [trimB, setTrimB] = useState(1);
  const [filterA, setFilterA] = useState(0);
  const [filterB, setFilterB] = useState(0);
  const [eqA, setEqA] = useState({ high: 0, mid: 0, low: 0 });
  const [eqB, setEqB] = useState({ high: 0, mid: 0, low: 0 });

  const deckA = useDeckAudio({ initialVolume: 1 });
  const deckB = useDeckAudio({ initialVolume: 1 });

  // Destructure setters for stable usage in useEffect
  const { setSpeed: setSpeedA } = deckA;
  const { setSpeed: setSpeedB } = deckB;
  
  const keysPressed = useRef<Set<string>>(new Set());

  const handleStart = () => resumeAudioContext();

  // Keyboard Controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Avoid interfering if focus is on an input element
      if ((e.target as HTMLElement).tagName === 'INPUT') return;

      keysPressed.current.add(e.key.toUpperCase());
      const pressed = keysPressed.current;

      // Crossfader (Left/Right Arrows)
      if (e.key === 'ArrowLeft') {
        setCrossfader(prev => Math.max(-1, prev - 0.05));
      } else if (e.key === 'ArrowRight') {
        setCrossfader(prev => Math.min(1, prev + 0.05));
      }
      
      // Up/Down Arrow Handler
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault(); // Prevent scrolling
          const dir = e.key === 'ArrowUp' ? 1 : -1;

          // --- CH1 FX Control (Q, A, Z) ---
          if (pressed.has('Q')) {
              // ECHO A
              deckA.setActiveFX('ECHO');
              deckA.setFxWet(v => Math.max(0, Math.min(1, v + (0.05 * dir))));
          } else if (pressed.has('A')) {
              // REVERB A
              deckA.setActiveFX('REVERB');
              deckA.setFxWet(v => Math.max(0, Math.min(1, v + (0.05 * dir))));
          } else if (pressed.has('Z')) {
              // FLANGER A
              deckA.setActiveFX('FLANGER');
              deckA.setFxWet(v => Math.max(0, Math.min(1, v + (0.05 * dir))));
          }

          // --- CH2 FX Control (P, L, M) ---
          else if (pressed.has('P')) {
              // ECHO B
              deckB.setActiveFX('ECHO');
              deckB.setFxWet(v => Math.max(0, Math.min(1, v + (0.05 * dir))));
          } else if (pressed.has('L')) {
              // REVERB B
              deckB.setActiveFX('REVERB');
              deckB.setFxWet(v => Math.max(0, Math.min(1, v + (0.05 * dir))));
          } else if (pressed.has('M')) {
              // FLANGER B
              deckB.setActiveFX('FLANGER');
              deckB.setFxWet(v => Math.max(0, Math.min(1, v + (0.05 * dir))));
          }

          // --- CH1 Mixer Control (E, R, T, Y, U, I) ---
          else if (pressed.has('E')) {
              // TRIM A
              setTrimA(v => Math.max(0, Math.min(2, v + (0.05 * dir))));
          } else if (pressed.has('R')) {
              // HI A
              setEqA(v => ({ ...v, high: Math.max(-15, Math.min(15, v.high + (1 * dir))) }));
          } else if (pressed.has('T')) {
              // MID A
              setEqA(v => ({ ...v, mid: Math.max(-15, Math.min(15, v.mid + (1 * dir))) }));
          } else if (pressed.has('Y')) {
              // LOW A
              setEqA(v => ({ ...v, low: Math.max(-15, Math.min(15, v.low + (1 * dir))) }));
          } else if (pressed.has('U')) {
              // FILTER A
              setFilterA(v => Math.max(-1, Math.min(1, v + (0.05 * dir))));
          } else if (pressed.has('I')) {
              // VOLUME A
              setVolA(v => Math.max(0, Math.min(1, v + (0.05 * dir))));
          } 
          
          // --- CH2 Mixer Control (D, F, G, H, J, K) ---
          else if (pressed.has('D')) {
              // TRIM B
              setTrimB(v => Math.max(0, Math.min(2, v + (0.05 * dir))));
          } else if (pressed.has('F')) {
              // HI B
              setEqB(v => ({ ...v, high: Math.max(-15, Math.min(15, v.high + (1 * dir))) }));
          } else if (pressed.has('G')) {
              // MID B
              setEqB(v => ({ ...v, mid: Math.max(-15, Math.min(15, v.mid + (1 * dir))) }));
          } else if (pressed.has('H')) {
              // LOW B
              setEqB(v => ({ ...v, low: Math.max(-15, Math.min(15, v.low + (1 * dir))) }));
          } else if (pressed.has('J')) {
              // FILTER B
              setFilterB(v => Math.max(-1, Math.min(1, v + (0.05 * dir))));
          } else if (pressed.has('K')) {
              // VOLUME B
              setVolB(v => Math.max(0, Math.min(1, v + (0.05 * dir))));
          }
          
          else {
              // Default: Deck B Tempo (Only when no modifier keys are pressed)
              // Increasing Pitch (Faster) maps to UP key visually
              setSpeedB(p => Math.min(1.5, Math.max(0.5, p + (0.005 * dir))));
          }
      }

      // Deck A Tempo (W/S Keys)
      if (e.code === 'KeyW') {
          setSpeedA(p => Math.min(1.5, p + 0.005));
      } else if (e.code === 'KeyS') {
          setSpeedA(p => Math.max(0.5, p - 0.005));
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
        keysPressed.current.delete(e.key.toUpperCase());
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
    };
  }, [setSpeedA, setSpeedB]);

  const handleLoadTrack = (file: File, target: 'A' | 'B') => {
      if (target === 'A') deckA.loadFile(file);
      else deckB.loadFile(file);
  };

  const handleSync = (source: 'A' | 'B') => {
      // If Sync pressed on A, match B's BPM
      if (source === 'A') deckA.syncToBpm(deckB.bpm * deckB.playbackRate);
      if (source === 'B') deckB.syncToBpm(deckA.bpm * deckA.playbackRate);
  };

  return (
    <div className="h-screen flex flex-col bg-[#0f172a] text-white overflow-hidden" onClick={handleStart}>
      {/* Header */}
      <header className="h-14 flex-shrink-0 border-b border-gray-800 bg-black/50 backdrop-blur flex items-center px-6 justify-between z-10">
         <div className="flex items-center gap-3">
             <div className="w-8 h-8 bg-gradient-to-br from-cyan-400 to-blue-600 rounded flex items-center justify-center font-bold text-black shadow-lg shadow-cyan-500/20">J</div>
             <h1 className="text-xl font-bold font-tech tracking-wider">J.S.YUNIDA20 <span className="text-cyan-400">MIX</span> <span className="text-xs align-top text-gray-400 ml-1">v6.0</span></h1>
         </div>
         <div className="text-[10px] text-gray-500 font-mono hidden md:block text-right">
             <div>KEYS: <span className="text-cyan-400">W/S</span>(A-TEMPO) <span className="text-fuchsia-400">↑/↓</span>(B-TEMPO) <span className="text-white">←/→</span>(X-FADER)</div>
             <div className="text-[9px] text-gray-400">
                HOLD <span className="text-cyan-400">Q/A/Z</span> (CH1 FX) • <span className="text-fuchsia-400">P/L/M</span> (CH2 FX) • <span className="text-cyan-400">E-I</span> (CH1) • <span className="text-fuchsia-400">D-K</span> (CH2)
             </div>
         </div>
      </header>

      {/* Main Workspace */}
      <div className="flex flex-1 overflow-hidden">
          {/* Library Sidebar */}
          <Library onLoad={handleLoadTrack} />

          {/* Decks & Mixer Area */}
          <main className="flex-1 flex flex-col lg:flex-row gap-4 p-4 items-stretch justify-center overflow-y-auto lg:overflow-hidden bg-gray-900/50">
            <Deck id="A" title="DECK A" color="cyan" audioState={deckA} onSync={() => handleSync('A')} />
            <Mixer 
                crossfader={crossfader} setCrossfader={setCrossfader} 
                audioStateA={deckA} audioStateB={deckB}
                // Pass Mixer State
                volA={volA} setVolA={setVolA}
                volB={volB} setVolB={setVolB}
                trimA={trimA} setTrimA={setTrimA}
                trimB={trimB} setTrimB={setTrimB}
                filterA={filterA} setFilterA={setFilterA}
                filterB={filterB} setFilterB={setFilterB}
                eqA={eqA} setEqA={setEqA}
                eqB={eqB} setEqB={setEqB}
            />
            <Deck id="B" title="DECK B" color="fuchsia" audioState={deckB} onSync={() => handleSync('B')} />
          </main>
      </div>
    </div>
  );
};

export default App;
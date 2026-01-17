import React, { useEffect, useState, useRef } from 'react';
import { Fader, Knob } from './Controls';
import { Mic, Square, Circle } from 'lucide-react';

interface MixerProps {
  crossfader: number;
  setCrossfader: (val: number) => void;
  audioStateA: any;
  audioStateB: any;
  // Lifted Props
  volA: number; setVolA: React.Dispatch<React.SetStateAction<number>>;
  volB: number; setVolB: React.Dispatch<React.SetStateAction<number>>;
  trimA: number; setTrimA: React.Dispatch<React.SetStateAction<number>>;
  trimB: number; setTrimB: React.Dispatch<React.SetStateAction<number>>;
  filterA: number; setFilterA: React.Dispatch<React.SetStateAction<number>>;
  filterB: number; setFilterB: React.Dispatch<React.SetStateAction<number>>;
  eqA: { high: number; mid: number; low: number }; setEqA: React.Dispatch<React.SetStateAction<{ high: number; mid: number; low: number }>>;
  eqB: { high: number; mid: number; low: number }; setEqB: React.Dispatch<React.SetStateAction<{ high: number; mid: number; low: number }>>;
}

const Mixer: React.FC<MixerProps> = ({ 
    crossfader, setCrossfader, audioStateA, audioStateB,
    volA, setVolA, volB, setVolB,
    trimA, setTrimA, trimB, setTrimB,
    filterA, setFilterA, filterB, setFilterB,
    eqA, setEqA, eqB, setEqB
}) => {

  // Recorder State
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const masterGainRef = useRef<GainNode | null>(null);

  // Master EQ Refs
  const masterInputRef = useRef<GainNode | null>(null);
  const masterLowRef = useRef<BiquadFilterNode | null>(null);
  const masterMidRef = useRef<BiquadFilterNode | null>(null);
  const masterHighRef = useRef<BiquadFilterNode | null>(null);

  // Master EQ State
  const [masterEq, setMasterEq] = useState({ high: 0, mid: 0, low: 0 });

  // Crossfader Curve State: 'LINEAR' | 'SMOOTH' (Constant Power) | 'CUT' (Sharp/Scratch)
  const [curve, setCurve] = useState<'LINEAR' | 'SMOOTH' | 'CUT'>('SMOOTH');

  // --- Audio Engine Routing ---
  // Create Master Bus & Master EQ Chain
  useEffect(() => {
     const ctx = audioStateA.audioContext;
     if (!ctx || masterGainRef.current) return;

     // 1. Create Master Output Gain
     const masterGain = ctx.createGain();
     masterGain.connect(ctx.destination);
     masterGainRef.current = masterGain;

     // 2. Create Master EQ Chain
     // Chain: masterInput -> Low -> Mid -> High -> masterGain
     const input = ctx.createGain();
     const low = ctx.createBiquadFilter(); low.type = 'lowshelf'; low.frequency.value = 320;
     const mid = ctx.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 1000; mid.Q.value = 0.5;
     const high = ctx.createBiquadFilter(); high.type = 'highshelf'; high.frequency.value = 3200;

     input.connect(low);
     low.connect(mid);
     mid.connect(high);
     high.connect(masterGain);

     // Store Refs
     masterInputRef.current = input;
     masterLowRef.current = low;
     masterMidRef.current = mid;
     masterHighRef.current = high;

  }, [audioStateA.audioContext]);

  // Apply Master EQ Values
  useEffect(() => {
      const ctx = audioStateA.audioContext;
      if (!ctx) return;
      const t = ctx.currentTime;
      if (masterLowRef.current) masterLowRef.current.gain.setTargetAtTime(masterEq.low, t, 0.05);
      if (masterMidRef.current) masterMidRef.current.gain.setTargetAtTime(masterEq.mid, t, 0.05);
      if (masterHighRef.current) masterHighRef.current.gain.setTargetAtTime(masterEq.high, t, 0.05);
  }, [masterEq, audioStateA.audioContext]);

  // Update EQ/Trim/Filter on Decks
  useEffect(() => {
      audioStateA.setEQ('high', eqA.high); audioStateA.setEQ('mid', eqA.mid); audioStateA.setEQ('low', eqA.low);
      audioStateA.setTrim(trimA); audioStateA.setFilter(filterA);
  }, [eqA, trimA, filterA]);

  useEffect(() => {
      audioStateB.setEQ('high', eqB.high); audioStateB.setEQ('mid', eqB.mid); audioStateB.setEQ('low', eqB.low);
      audioStateB.setTrim(trimB); audioStateB.setFilter(filterB);
  }, [eqB, trimB, filterB]);

  // Routing Logic: Deck Output -> Channel Gain -> Master Bus (via Master EQ Input)
  const gainARef = useRef<GainNode | null>(null);
  const gainBRef = useRef<GainNode | null>(null);

  useEffect(() => {
      const ctx = audioStateA.audioContext;
      // Target is Master Input if available, else Master Gain
      const targetNode = masterInputRef.current || masterGainRef.current;
      
      if (!ctx || !targetNode) return;

      // Init Channel Gains if needed
      if (!gainARef.current) { gainARef.current = ctx.createGain(); gainARef.current.connect(targetNode); }
      if (!gainBRef.current) { gainBRef.current = ctx.createGain(); gainBRef.current.connect(targetNode); }

      // Connect Deck Outputs to Channel Gains
      if (audioStateA.outputNode) {
          try { audioStateA.outputNode.disconnect(); } catch(e) {} 
          audioStateA.outputNode.connect(gainARef.current); 
      }
      if (audioStateB.outputNode) {
          try { audioStateB.outputNode.disconnect(); } catch(e) {}
          audioStateB.outputNode.connect(gainBRef.current);
      }
  }, [audioStateA.outputNode, audioStateB.outputNode]);

  // Handle Crossfader & Volume Logic with Curve
  useEffect(() => {
    const ctx = audioStateA.audioContext;
    if (!ctx || !gainARef.current || !gainBRef.current) return;
    
    // Normalize crossfader from -1..1 to 0..1
    const x = (crossfader + 1) / 2;
    let gainA = 0;
    let gainB = 0;

    switch (curve) {
        case 'LINEAR':
            // Simple Linear Fade
            gainA = 1 - x;
            gainB = x;
            break;
        case 'CUT':
            // Sharp Cut (Scratch Mode)
            // Slope determines sharpness. 25 means full volume is reached at ~4% travel
            const cutSlope = 25; 
            gainA = Math.min(1, (1 - x) * cutSlope);
            gainB = Math.min(1, x * cutSlope);
            break;
        case 'SMOOTH':
        default:
            // Constant Power (Cosine) - Standard for mixing
            gainA = Math.cos(x * 0.5 * Math.PI);
            gainB = Math.cos((1 - x) * 0.5 * Math.PI);
            break;
    }

    // Apply gains with smoothing
    gainARef.current.gain.setTargetAtTime(volA * gainA, ctx.currentTime, 0.05);
    gainBRef.current.gain.setTargetAtTime(volB * gainB, ctx.currentTime, 0.05);
  }, [crossfader, volA, volB, curve]);


  // Recording Logic
  const toggleRecord = () => {
      if (isRecording) {
          mediaRecorderRef.current?.stop();
          setIsRecording(false);
      } else {
          const ctx = audioStateA.audioContext;
          const master = masterGainRef.current;
          if (!ctx || !master) return;

          const dest = ctx.createMediaStreamDestination();
          master.connect(dest);
          
          const recorder = new MediaRecorder(dest.stream);
          chunksRef.current = [];
          
          recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
          recorder.onstop = () => {
              const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `groovemix_rec_${new Date().getTime()}.webm`;
              a.click();
          };
          
          recorder.start();
          mediaRecorderRef.current = recorder;
          setIsRecording(true);
      }
  };

  const updateEq = (side: 'A' | 'B', type: 'high' | 'mid' | 'low', val: number) => {
      if (side === 'A') setEqA(prev => ({...prev, [type]: val}));
      else setEqB(prev => ({...prev, [type]: val}));
  };

  // --- Real Level Meter (Using AnalyserNode) ---
  const RealLevelMeter = ({ analyser }: { analyser: AnalyserNode | null }) => {
      const canvasRef = useRef<HTMLCanvasElement>(null);
      const dataArrayRef = useRef<Uint8Array | null>(null);

      useEffect(() => {
          if (!analyser || !canvasRef.current) return;
          const canvas = canvasRef.current;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          
          // Set up data array
          const bufferLength = analyser.frequencyBinCount;
          if (!dataArrayRef.current || dataArrayRef.current.length !== bufferLength) {
             dataArrayRef.current = new Uint8Array(bufferLength);
          }
          
          let animationId: number;

          const draw = () => {
              animationId = requestAnimationFrame(draw);
              if (!dataArrayRef.current) return;
              
              analyser.getByteTimeDomainData(dataArrayRef.current);
              
              // Calculate RMS (Root Mean Square) for volume level
              let sum = 0;
              for(let i = 0; i < bufferLength; i++) {
                  const x = dataArrayRef.current[i];
                  const val = (x - 128) / 128; // Normalize to -1..1
                  sum += val * val;
              }
              const rms = Math.sqrt(sum / bufferLength);
              // Boost the signal a bit for visual clarity
              const level = Math.min(1, rms * 4); 

              // Draw Meter
              const segments = 24; // More granularity
              const activeSegments = Math.floor(level * segments);
              
              ctx.clearRect(0, 0, canvas.width, canvas.height);
              
              const segmentHeight = (canvas.height - (segments - 1)) / segments; // spacing
              
              for (let i = 0; i < segments; i++) {
                  // Invert: i=0 is top, we want bottom to fill up.
                  const isLit = (segments - 1 - i) < activeSegments;
                  
                  // Color coding
                  const segmentIndex = segments - 1 - i;
                  let color = '#22c55e'; // Green
                  if (segmentIndex > 16) color = '#eab308'; // Yellow
                  if (segmentIndex > 21) color = '#ef4444'; // Red
                  
                  ctx.fillStyle = isLit ? color : '#1f2937'; // gray-800 for off
                  
                  const y = i * (segmentHeight + 1);
                  ctx.fillRect(0, y, canvas.width, segmentHeight);
              }
          };
          
          draw();
          return () => cancelAnimationFrame(animationId);
      }, [analyser]);

      return (
        <div className="w-4 bg-gray-950 rounded p-0.5 border border-gray-800 shadow-inner h-36">
           <canvas ref={canvasRef} width={12} height={140} className="w-full h-full" />
        </div>
      );
  }

  const ChannelStrip = ({ label, color, eq, updateEq, trim, setTrim, filter, setFilter, vol, setVol, analyser }: any) => (
      <div className="flex flex-col items-center bg-gray-900/50 p-2 rounded-lg border border-gray-800 w-24">
          <div className={`text-${color}-500 font-bold text-xs mb-2 bg-black px-2 py-0.5 rounded`}>{label}</div>
          <Knob label="TRIM" value={trim} min={0} max={2} onChange={setTrim} color="gray" resetValue={1} />
          <div className="w-full h-[1px] bg-gray-700 my-2"></div>
          <div className="flex flex-col gap-2">
            <Knob label="HI" value={eq.high} min={-15} max={15} onChange={(v:number) => updateEq('high', v)} color="gray" resetValue={0} />
            <Knob label="MID" value={eq.mid} min={-15} max={15} onChange={(v:number) => updateEq('mid', v)} color="gray" resetValue={0} />
            <Knob label="LOW" value={eq.low} min={-15} max={15} onChange={(v:number) => updateEq('low', v)} color="gray" resetValue={0} />
          </div>
          <div className="w-full h-[1px] bg-gray-700 my-2"></div>
          <Knob label="FILTER" value={filter} min={-1} max={1} onChange={setFilter} color={color} size="large" resetValue={0} />
          <div className="mt-4 w-full px-2">
             <Fader value={vol} onChange={setVol} color={color} vertical={true} resetValue={0.8} />
          </div>
      </div>
  );

  return (
    <div className="bg-gradient-to-b from-gray-800 to-black rounded-lg p-3 flex flex-col items-center border-2 border-gray-700 shadow-2xl min-w-[300px]">
        {/* Recorder UI */}
        <div className="w-full flex justify-between items-center mb-4 px-2">
             <div className="flex items-center gap-2 opacity-50">
                <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                <span className="font-tech text-xs tracking-[0.3em]">MIXER</span>
            </div>
            <button 
                onClick={toggleRecord}
                className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold transition-all
                    ${isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
            >
                {isRecording ? <Square size={10} fill="currentColor" /> : <Circle size={10} fill="currentColor" />}
                {isRecording ? 'REC' : 'REC'}
            </button>
        </div>

        <div className="flex justify-between w-full gap-2 mb-4">
            <ChannelStrip label="CH 1" color="cyan" eq={eqA} updateEq={(t:any,v:any) => updateEq('A',t,v)} trim={trimA} setTrim={setTrimA} filter={filterA} setFilter={setFilterA} vol={volA} setVol={setVolA} analyser={audioStateA.outputNode} />
            
            {/* Center Section with Master EQ and Meters */}
            <div className="flex flex-col justify-end pb-4 gap-3">
                {/* Master EQ */}
                <div className="bg-gray-900/50 p-2 rounded-lg border border-gray-800 flex flex-col items-center gap-2">
                    <span className="text-[10px] text-gray-500 font-bold tracking-wider">MASTER</span>
                    <Knob label="HI" value={masterEq.high} min={-12} max={12} onChange={(v:number) => setMasterEq(p => ({...p, high: v}))} color="gray" resetValue={0} />
                    <Knob label="MID" value={masterEq.mid} min={-12} max={12} onChange={(v:number) => setMasterEq(p => ({...p, mid: v}))} color="gray" resetValue={0} />
                    <Knob label="LOW" value={masterEq.low} min={-12} max={12} onChange={(v:number) => setMasterEq(p => ({...p, low: v}))} color="gray" resetValue={0} />
                </div>

                <div className="flex gap-2 bg-gray-950 p-2 rounded border border-gray-800">
                    <RealLevelMeter analyser={audioStateA.outputNode} />
                    <RealLevelMeter analyser={audioStateB.outputNode} />
                </div>
            </div>

            <ChannelStrip label="CH 2" color="fuchsia" eq={eqB} updateEq={(t:any,v:any) => updateEq('B',t,v)} trim={trimB} setTrim={setTrimB} filter={filterB} setFilter={setFilterB} vol={volB} setVol={setVolB} analyser={audioStateB.outputNode} />
        </div>
        <div className="w-full bg-gray-900 p-3 rounded border-t border-gray-700">
            <div className="flex justify-between items-center text-[10px] text-gray-500 font-mono mb-1 px-4">
                <span>A</span> 
                <div className="flex items-center gap-2">
                    <span className="tracking-widest text-gray-400 hidden sm:inline">CROSSFADER</span> 
                    <div className="flex bg-gray-950 rounded border border-gray-800 p-0.5 gap-0.5">
                        <button 
                            onClick={() => setCurve('LINEAR')} 
                            className={`text-[8px] px-1.5 py-0.5 rounded ${curve === 'LINEAR' ? 'bg-blue-600 text-white' : 'hover:bg-gray-800'}`}
                            title="Linear Curve"
                        >LIN</button>
                        <button 
                            onClick={() => setCurve('SMOOTH')} 
                            className={`text-[8px] px-1.5 py-0.5 rounded ${curve === 'SMOOTH' ? 'bg-green-600 text-white' : 'hover:bg-gray-800'}`}
                            title="Constant Power Curve"
                        >PWR</button>
                        <button 
                            onClick={() => setCurve('CUT')} 
                            className={`text-[8px] px-1.5 py-0.5 rounded ${curve === 'CUT' ? 'bg-red-600 text-white' : 'hover:bg-gray-800'}`}
                            title="Sharp Cut (Scratch)"
                        >CUT</button>
                    </div>
                </div>
                <span>B</span>
            </div>
            <Fader value={crossfader} onChange={setCrossfader} resetValue={0} />
        </div>
    </div>
  );
};

export default Mixer;
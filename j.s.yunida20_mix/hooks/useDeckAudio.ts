import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getAudioContext, createReverbBuffer } from '../utils/audioContext';
import { detectBpm } from '../utils/bpm';

interface UseDeckAudioProps {
  initialVolume?: number;
}

export type FXType = 'NONE' | 'ECHO' | 'REVERB' | 'FLANGER';

export const useDeckAudio = ({ initialVolume = 1 }: UseDeckAudioProps) => {
  // Transport
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [isReverse, setIsReverse] = useState(false); // Reverse State
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  
  // Speed / Sync
  const [pitch, setPitch] = useState(1);
  const [bend, setBend] = useState(0);
  const [syncRate, setSyncRate] = useState(1); // For Sync multiplier
  const [isWidePitch, setIsWidePitch] = useState(false); // Wide Pitch Range

  // Playback Rate includes Reverse direction
  const playbackRate = (pitch + bend + (syncRate - 1)) * (isReverse ? -1 : 1);
  const lastPlaybackRateRef = useRef(playbackRate); // Track previous rate for smooth transitions

  const [hotCues, setHotCues] = useState<(number | null)[]>([null, null, null]);

  // File Info
  const [isLoaded, setIsLoaded] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [bpm, setBpm] = useState<number>(128);
  const [isBpmAnalyzing, setIsBpmAnalyzing] = useState(false);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null); // Expose for visualizer

  // FX State (Main Track)
  const [activeFX, setActiveFX] = useState<FXType>('NONE');
  const [fxWet, setFxWet] = useState(0); // 0 to 1

  // Nodes
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  
  // Resources
  const reverbBufferRef = useRef<AudioBuffer | null>(null);

  // Channel Strip Nodes
  const trimNodeRef = useRef<GainNode | null>(null);
  const lowPassNodeRef = useRef<BiquadFilterNode | null>(null);
  const highPassNodeRef = useRef<BiquadFilterNode | null>(null);
  const lowNodeRef = useRef<BiquadFilterNode | null>(null);
  const midNodeRef = useRef<BiquadFilterNode | null>(null);
  const highNodeRef = useRef<BiquadFilterNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null); // Channel Fader
  const analyserNodeRef = useRef<AnalyserNode | null>(null); // Output Point

  // Tap BPM
  const tapTimesRef = useRef<number[]>([]);

  // Main FX Nodes
  const fxInputGainRef = useRef<GainNode | null>(null);
  const fxOutputGainRef = useRef<GainNode | null>(null);
  const delayNodeRef = useRef<DelayNode | null>(null);
  const delayFeedbackRef = useRef<GainNode | null>(null);
  const convolverNodeRef = useRef<ConvolverNode | null>(null);
  const flangerDelayRef = useRef<DelayNode | null>(null);
  const flangerOscRef = useRef<OscillatorNode | null>(null);
  const flangerGainRef = useRef<GainNode | null>(null);

  // Time Refs
  const startTimeRef = useRef<number>(0);
  const pauseTimeRef = useRef<number>(0);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const ctx = getAudioContext();
    audioContextRef.current = ctx;

    // Pre-calculate Reverb Buffer
    if (!reverbBufferRef.current) {
        reverbBufferRef.current = createReverbBuffer(ctx, 2.5, 2.0);
    }

    // --- Create Channel Strip Nodes ---
    const trimNode = ctx.createGain();
    const lowPass = ctx.createBiquadFilter(); lowPass.type = 'lowpass'; lowPass.frequency.value = 22050;
    const highPass = ctx.createBiquadFilter(); highPass.type = 'highpass'; highPass.frequency.value = 0;
    const low = ctx.createBiquadFilter(); low.type = 'lowshelf'; low.frequency.value = 320;
    const mid = ctx.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 1000; mid.Q.value = 0.5;
    const high = ctx.createBiquadFilter(); high.type = 'highshelf'; high.frequency.value = 3200;
    const gainNode = ctx.createGain(); gainNode.gain.value = initialVolume;
    const analyserNode = ctx.createAnalyser(); analyserNode.fftSize = 512;

    // Store Refs
    trimNodeRef.current = trimNode;
    lowPassNodeRef.current = lowPass;
    highPassNodeRef.current = highPass;
    lowNodeRef.current = low;
    midNodeRef.current = mid;
    highNodeRef.current = high;
    gainNodeRef.current = gainNode;
    analyserNodeRef.current = analyserNode;

    // --- Create FX Chain (Parallel Bus) ---
    const fxInput = ctx.createGain();
    const fxOutput = ctx.createGain(); fxOutput.gain.value = 0;
    fxInputGainRef.current = fxInput;
    fxOutputGainRef.current = fxOutput;

    // Delay
    const delay = ctx.createDelay(1.0); delay.delayTime.value = 0.5; // default 500ms
    const feedback = ctx.createGain(); feedback.gain.value = 0.4;
    delay.connect(feedback); feedback.connect(delay);
    delayNodeRef.current = delay;
    delayFeedbackRef.current = feedback;

    // Reverb (Main)
    const convolver = ctx.createConvolver();
    if (reverbBufferRef.current) convolver.buffer = reverbBufferRef.current;
    convolverNodeRef.current = convolver;

    // Flanger
    const fDelay = ctx.createDelay(); fDelay.delayTime.value = 0.005;
    const fOsc = ctx.createOscillator(); fOsc.frequency.value = 0.5; fOsc.type = 'sine';
    const fGain = ctx.createGain(); fGain.gain.value = 0.002;
    fOsc.connect(fGain); fGain.connect(fDelay.delayTime);
    fOsc.start();
    flangerDelayRef.current = fDelay;
    flangerOscRef.current = fOsc;
    flangerGainRef.current = fGain;

    // Routing
    trimNode.connect(lowPass);
    lowPass.connect(highPass);
    highPass.connect(high);
    high.connect(mid);
    mid.connect(low);
    low.connect(gainNode);
    gainNode.connect(analyserNode);

    // FX Path
    low.connect(fxInput);
    fxOutput.connect(gainNode);

    return () => {
      if (sourceNodeRef.current) sourceNodeRef.current.stop();
      if (flangerOscRef.current) flangerOscRef.current.stop();
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [initialVolume]);

  // Update Playback Rate & Re-anchor time tracking
  useEffect(() => {
      if (isPlaying && sourceNodeRef.current && audioContextRef.current) {
          const ctx = audioContextRef.current;
          const now = ctx.currentTime;
          const prevRate = lastPlaybackRateRef.current;
          
          // Calculate exact position based on previous rate
          const elapsed = now - startTimeRef.current;
          let newPos = pauseTimeRef.current + (elapsed * prevRate);
          
          // Normalize loops/bounds
          if (duration > 0) {
             while (newPos < 0) newPos += duration;
             newPos = newPos % duration;
          }
          
          // Re-anchor to current time
          pauseTimeRef.current = newPos;
          startTimeRef.current = now;
          
          // Apply new rate
          sourceNodeRef.current.playbackRate.setValueAtTime(playbackRate, now);
      }
      lastPlaybackRateRef.current = playbackRate;
  }, [playbackRate, duration, isPlaying]);

  // Handle FX Selection and Routing
  useEffect(() => {
      const fxIn = fxInputGainRef.current;
      const fxOut = fxOutputGainRef.current;
      if (!fxIn || !fxOut) return;

      fxIn.disconnect();

      if (activeFX === 'ECHO' && delayNodeRef.current) {
          fxIn.connect(delayNodeRef.current);
          delayNodeRef.current.connect(fxOut);
      } else if (activeFX === 'REVERB' && convolverNodeRef.current) {
          fxIn.connect(convolverNodeRef.current);
          convolverNodeRef.current.connect(fxOut);
      } else if (activeFX === 'FLANGER' && flangerDelayRef.current) {
          fxIn.connect(flangerDelayRef.current);
          flangerDelayRef.current.connect(fxOut);
      }
  }, [activeFX]);

  // Handle FX Wet Amount
  useEffect(() => {
      if (fxOutputGainRef.current && audioContextRef.current) {
          fxOutputGainRef.current.gain.setTargetAtTime(fxWet, audioContextRef.current.currentTime, 0.02);
      }
  }, [fxWet]);

  // TAP BPM
  const tapBpm = () => {
      const now = Date.now();
      const times = tapTimesRef.current;
      if (times.length > 0 && now - times[times.length - 1] > 2000) {
          tapTimesRef.current = [now];
          return;
      }
      times.push(now);
      if (times.length > 4) times.shift();
      if (times.length >= 2) {
          const intervals = [];
          for (let i = 1; i < times.length; i++) {
              intervals.push(times[i] - times[i-1]);
          }
          const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
          const newBpm = 60000 / avgInterval;
          setBpm(Math.round(newBpm * 10) / 10);
      }
  };

  const loadFile = async (file: File) => {
    if (!audioContextRef.current) return;
    setIsPlaying(false);
    setFileName(file.name);
    setBpm(128); 
    setIsBpmAnalyzing(true);
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      const decodedBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
      setAudioBuffer(decodedBuffer);
      setDuration(decodedBuffer.duration);
      setIsLoaded(true);
      setCurrentTime(0);
      pauseTimeRef.current = 0;
      setHotCues([null, null, null]);
      setSyncRate(1);
      setIsReverse(false);
      lastPlaybackRateRef.current = 1;

      // Perform BPM Detection
      detectBpm(decodedBuffer).then(detectedBpm => {
          console.log(`BPM Detected for ${file.name}: ${detectedBpm}`);
          setBpm(detectedBpm);
          setIsBpmAnalyzing(false);
      }).catch(err => {
          console.warn('Auto BPM detection failed', err);
          setIsBpmAnalyzing(false);
      });

    } catch (error) {
      console.error("Error decoding", error);
      setIsBpmAnalyzing(false);
    }
  };

  const play = useCallback(() => {
    if (!audioContextRef.current || !audioBuffer) return;
    
    if (audioContextRef.current.state === 'suspended') audioContextRef.current.resume();
    if (sourceNodeRef.current) sourceNodeRef.current.disconnect();

    const source = audioContextRef.current.createBufferSource();
    source.buffer = audioBuffer;
    source.playbackRate.value = playbackRate;
    source.loop = isLooping;
    
    if (trimNodeRef.current) source.connect(trimNodeRef.current);

    const offset = pauseTimeRef.current % audioBuffer.duration;
    // Handle reverse start
    const startOffset = offset < 0 ? audioBuffer.duration + offset : offset;

    source.start(0, startOffset);
    startTimeRef.current = audioContextRef.current.currentTime - startOffset;
    sourceNodeRef.current = source;
    setIsPlaying(true);
  }, [playbackRate, isLooping, audioBuffer]);

  const pause = useCallback(() => {
    if (sourceNodeRef.current && isPlaying && audioContextRef.current) {
      sourceNodeRef.current.stop();
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
      
      const now = audioContextRef.current.currentTime;
      const elapsed = now - startTimeRef.current;
      
      // Calculate new position using the current playback rate
      let newPos = pauseTimeRef.current + (elapsed * playbackRate);
      
      // Normalize position
      if (duration > 0) {
         while (newPos < 0) newPos += duration;
         newPos = newPos % duration;
      }
      
      pauseTimeRef.current = newPos;
      setIsPlaying(false);
    }
  }, [isPlaying, playbackRate, duration]);

  const togglePlay = () => (isPlaying ? pause() : play());
  
  const toggleLoop = () => {
    setIsLooping(!isLooping);
    if (sourceNodeRef.current) sourceNodeRef.current.loop = !isLooping;
  };

  const toggleReverse = () => {
     setIsReverse(!isReverse);
  };

  const toggleWidePitch = () => {
      setIsWidePitch(!isWidePitch);
  };

  const seek = (time: number) => {
    const wasPlaying = isPlaying;
    if (wasPlaying) pause();
    pauseTimeRef.current = time;
    setCurrentTime(time);
    if (wasPlaying) play();
  };

  const syncToBpm = (targetBpm: number) => {
      if (bpm === 0) return;
      const ratio = targetBpm / bpm;
      setSyncRate(ratio);
      setPitch(1);
  };

  const setTrim = (val: number) => {
      if (audioContextRef.current && trimNodeRef.current) {
          trimNodeRef.current.gain.setTargetAtTime(val, audioContextRef.current.currentTime, 0.05);
      }
  };

  const setEQ = (type: 'low' | 'mid' | 'high', value: number) => {
      if (!audioContextRef.current) return;
      const target = type === 'low' ? lowNodeRef.current : type === 'mid' ? midNodeRef.current : highNodeRef.current;
      if (target) target.gain.setTargetAtTime(value, audioContextRef.current.currentTime, 0.05);
  };

  const setFilter = (val: number) => {
      if (!audioContextRef.current || !lowPassNodeRef.current || !highPassNodeRef.current) return;
      const time = audioContextRef.current.currentTime;
      if (val < 0) {
           const freq = 100 * Math.pow(22050 / 100, 1 + val);
           lowPassNodeRef.current.frequency.setTargetAtTime(freq, time, 0.05);
           highPassNodeRef.current.frequency.setTargetAtTime(0, time, 0.05);
      } else {
           const freq = 10 * Math.pow(10000 / 10, val);
           highPassNodeRef.current.frequency.setTargetAtTime(freq, time, 0.05);
           lowPassNodeRef.current.frequency.setTargetAtTime(22050, time, 0.05);
      }
  };

  const triggerHotCue = (index: number) => {
      if (hotCues[index] !== null) seek(hotCues[index]!);
      else {
          const newCues = [...hotCues]; newCues[index] = currentTime; setHotCues(newCues);
      }
  };
  const deleteHotCue = (index: number, e: React.MouseEvent) => {
      e.stopPropagation(); const newCues = [...hotCues]; newCues[index] = null; setHotCues(newCues);
  };

  // Loop for Time Update
  useEffect(() => {
    const updateLoop = () => {
        if (isPlaying && audioContextRef.current) {
            const elapsed = audioContextRef.current.currentTime - startTimeRef.current;
            let calculatedTime = pauseTimeRef.current + (elapsed * playbackRate);
            
            // Normalize time for display
            if (duration > 0) {
                while(calculatedTime < 0) calculatedTime += duration;
                calculatedTime = calculatedTime % duration;
            }

            setCurrentTime(calculatedTime);
        } else if (!isPlaying) {
             setCurrentTime(pauseTimeRef.current);
        }
        animationFrameRef.current = requestAnimationFrame(updateLoop);
    };
    updateLoop();
    return () => { if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current); }
  }, [isPlaying, duration, playbackRate]);

  return {
    loadFile, play, pause, togglePlay, toggleLoop, seek,
    isLooping, isPlaying, isLoaded, fileName, bpm, isBpmAnalyzing, audioBuffer,
    duration, currentTime,
    playbackRate, pitch, setSpeed: setPitch, setBendAmount: setBend,
    isReverse, toggleReverse,
    isWidePitch, toggleWidePitch,
    setEQ, setTrim, setFilter,
    hotCues, triggerHotCue, deleteHotCue,
    activeFX, setActiveFX, fxWet, setFxWet,
    syncToBpm, tapBpm, 
    outputNode: analyserNodeRef.current, // Used by Mixer to connect to Master
    audioContext: audioContextRef.current
  };
};
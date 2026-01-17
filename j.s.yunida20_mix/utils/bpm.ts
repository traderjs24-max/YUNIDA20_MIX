/**
 * Detects BPM from an AudioBuffer by analyzing a slice of the audio data.
 * Uses a low-pass filter and peak detection algorithm.
 */
export const detectBpm = async (buffer: AudioBuffer): Promise<number> => {
    try {
      const sourceData = buffer.getChannelData(0);
      const sampleRate = buffer.sampleRate;
      
      // Process a 30-second chunk from the middle of the track
      // This is usually sufficient for dance music and saves processing time
      const sliceDuration = 30;
      const sliceSamples = sliceDuration * sampleRate;
      let startSample = Math.floor((sourceData.length - sliceSamples) / 2);
      if (startSample < 0) startSample = 0;
      
      const length = Math.min(sliceSamples, sourceData.length);
      
      // Use OfflineAudioContext for filtering
      const offlineCtx = new OfflineAudioContext(1, length, sampleRate);
      
      const sliceBuffer = offlineCtx.createBuffer(1, length, sampleRate);
      const sliceData = sliceBuffer.getChannelData(0);
      
      // Copy data manually
      for (let i = 0; i < length; i++) {
          sliceData[i] = sourceData[startSample + i];
      }
      
      const source = offlineCtx.createBufferSource();
      source.buffer = sliceBuffer;
      
      // Lowpass filter to isolate kick drums/bass (around 150Hz)
      const filter = offlineCtx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 150;
      filter.Q.value = 1;
      
      source.connect(filter);
      filter.connect(offlineCtx.destination);
      source.start(0);
      
      const renderedBuffer = await offlineCtx.startRendering();
      const data = renderedBuffer.getChannelData(0);
      
      // Peak Detection
      // 1. Calculate threshold based on max amplitude in the chunk
      let maxAmp = 0;
      // Sampling for max amp to save cycles
      for (let i=0; i<data.length; i+=1000) {
          if (Math.abs(data[i]) > maxAmp) maxAmp = Math.abs(data[i]);
      }
      const threshold = maxAmp * 0.35; // Threshold
  
      const peaks: number[] = [];
      const minDistance = 0.3 * sampleRate; // Minimum distance ~0.3s (limits max BPM to ~200)
      let lastPeak = -minDistance;
  
      for (let i = 0; i < data.length; i++) {
          if (data[i] > threshold) {
              if (i - lastPeak > minDistance) {
                  peaks.push(i);
                  lastPeak = i;
              }
          }
      }
  
      if (peaks.length < 10) return 128; // Fallback if detection fails
  
      // Interval Analysis
      const intervals: number[] = [];
      for (let i = 1; i < peaks.length; i++) {
          intervals.push(peaks[i] - peaks[i-1]);
      }
      
      // Group intervals (Histogram)
      const histogram: Record<string, number> = {};
      intervals.forEach(interval => {
          // Round to nearest ~10ms (approx 441 samples at 44.1k) to group timing variations
          const rounded = Math.round(interval / 500) * 500;
          histogram[rounded] = (histogram[rounded] || 0) + 1;
      });
      
      let maxCount = 0;
      let bestInterval = 0;
      
      Object.entries(histogram).forEach(([intervalStr, count]) => {
          const interval = parseInt(intervalStr);
          if (count > maxCount) {
              maxCount = count;
              bestInterval = interval;
          }
      });
  
      if (bestInterval === 0) return 128;

      let bpm = 60 / (bestInterval / sampleRate);
      
      // Normalize to common range 70-180
      // If detected half-time (e.g., 60), double it.
      // If detected double-time (e.g., 240), halve it.
      while (bpm < 70) bpm *= 2;
      while (bpm > 180) bpm /= 2;
      
      return Math.round(bpm);
  
    } catch (e) {
        console.warn("BPM detection failed", e);
        return 128;
    }
  }
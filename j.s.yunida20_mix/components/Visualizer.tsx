import React, { useEffect, useRef } from 'react';

interface VisualizerProps {
  analyser: AnalyserNode | null;
  isPlaying: boolean;
  color: string;
}

const Visualizer: React.FC<VisualizerProps> = ({ analyser, isPlaying, color }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !analyser) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    let animationId: number;

    const draw = () => {
      animationId = requestAnimationFrame(draw);
      
      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2.5;
      let barHeight;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        barHeight = (dataArray[i] / 255) * canvas.height;

        ctx.fillStyle = color; // Use the passed tailwind-like hex or name? Better to use hex or computed style.
        // Let's assume color is a valid CSS string
        
        // Add a glow effect
        ctx.shadowBlur = 10;
        ctx.shadowColor = color;

        // Draw rounded bars
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

        x += barWidth + 1;
      }
      
      if (!isPlaying) {
          // Draw a flat line if paused but powered on
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.beginPath();
          ctx.moveTo(0, canvas.height / 2);
          ctx.lineTo(canvas.width, canvas.height / 2);
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.stroke();
      }
    };

    draw();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [analyser, isPlaying, color]);

  return (
    <canvas 
        ref={canvasRef} 
        width={300} 
        height={80} 
        className="w-full h-20 rounded-lg bg-black/40 border border-gray-700/50"
    />
  );
};

export default Visualizer;
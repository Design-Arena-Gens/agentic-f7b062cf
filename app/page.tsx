'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type RecorderState = 'idle' | 'recording' | 'finalizing';

const VIDEO_LENGTH_SECONDS = 12;
const FPS = 60;

function drawFrame(ctx: CanvasRenderingContext2D, time: number) {
  const canvas = ctx.canvas;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const t = time * 0.001;
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, `hsl(${(t * 40) % 360}, 80%, 65%)`);
  gradient.addColorStop(1, `hsl(${((t * 40) + 120) % 360}, 75%, 30%)`);

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const layerCount = 6;
  for (let layer = 0; layer < layerCount; layer += 1) {
    const phase = t * (0.3 + layer * 0.08);
    const amplitude = (0.08 + layer * 0.02) * height;
    const waveCount = 3 + layer;
    ctx.beginPath();
    for (let x = 0; x <= width; x += 4) {
      const pct = x / width;
      const y =
        height * 0.5 +
        Math.sin(pct * waveCount * Math.PI * 2 + phase) * amplitude * Math.cos(phase * 0.5 + pct * 3);
      if (x === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.strokeStyle = `hsla(${((layer * 40 + t * 60) % 360 + 360) % 360}, 90%, ${55 - layer * 4}%, ${0.6 - layer * 0.07})`;
    ctx.lineWidth = 2 + layer * 0.4;
    ctx.stroke();
  }

  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 80; i += 1) {
    const angle = (i / 80) * Math.PI * 2 + t * 0.3;
    const radius = (Math.sin(t * 0.4 + i * 0.15) * 0.35 + 0.5) * Math.min(width, height) * 0.45;
    const x = width * 0.5 + Math.cos(angle) * radius;
    const y = height * 0.5 + Math.sin(angle) * radius;
    const pulse = Math.sin(t * 2 + i * 0.5) * 0.5 + 0.5;
    const dotRadius = 2 + pulse * 3;

    const glow = ctx.createRadialGradient(x, y, 0, x, y, dotRadius * 6);
    glow.addColorStop(0, `hsla(${(t * 50 + i * 2) % 360}, 85%, 70%, 0.9)`);
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, dotRadius * 6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

export default function Page() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const progressLoopRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [recorderState, setRecorderState] = useState<RecorderState>('idle');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [progressPct, setProgressPct] = useState(0);
  const startTimestampRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const setSize = () => {
      const scale = window.devicePixelRatio || 1;
      const cssWidth = canvas.clientWidth;
      const cssHeight = canvas.clientHeight;
      const width = cssWidth * scale;
      const height = cssHeight * scale;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(scale, scale);
    };

    setSize();

    const handleResize = () => {
      setSize();
    };

    const render = (time: number) => {
      drawFrame(ctx, time);
      animationRef.current = window.requestAnimationFrame(render);
    };

    animationRef.current = window.requestAnimationFrame(render);
    window.addEventListener('resize', handleResize);

    return () => {
      if (animationRef.current) {
        window.cancelAnimationFrame(animationRef.current);
      }
      if (progressLoopRef.current) {
        window.cancelAnimationFrame(progressLoopRef.current);
      }
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    if (recorder.state === 'inactive') return;
    if (progressLoopRef.current) {
      window.cancelAnimationFrame(progressLoopRef.current);
      progressLoopRef.current = null;
    }
    setRecorderState('finalizing');
    recorder.stop();
  }, []);

  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, [stopRecording]);

  const beginRecording = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (recorderState !== 'idle') return;
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
      setVideoUrl(null);
    }

    const stream = canvas.captureStream(FPS);
    if (!stream) return;

    const chunks: Blob[] = [];
    try {
      const recorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9',
        videoBitsPerSecond: 8_000_000,
      });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onstop = () => {
        if (progressLoopRef.current) {
          window.cancelAnimationFrame(progressLoopRef.current);
          progressLoopRef.current = null;
        }
        const blob = new Blob(chunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        setVideoUrl(url);
        setRecorderState('idle');
        setProgressPct(100);
        mediaRecorderRef.current = null;
      };

      recorder.onerror = () => {
        setRecorderState('idle');
        mediaRecorderRef.current = null;
        setProgressPct(0);
      };

      setProgressPct(0);
      setRecorderState('recording');
      startTimestampRef.current = performance.now();
      recorder.start();

      const trackProgress = () => {
        const elapsed = (performance.now() - startTimestampRef.current) / 1000;
        const pct = Math.min(100, (elapsed / VIDEO_LENGTH_SECONDS) * 100);
        setProgressPct(pct);
        if (elapsed >= VIDEO_LENGTH_SECONDS) {
          stopRecording();
          return;
        }
        progressLoopRef.current = window.requestAnimationFrame(trackProgress);
      };
      progressLoopRef.current = window.requestAnimationFrame(trackProgress);
    } catch (error) {
      setRecorderState('idle');
      setProgressPct(0);
    }
  }, [recorderState, stopRecording, videoUrl]);

  useEffect(() => {
    return () => {
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
    };
  }, [videoUrl]);

  const recording = recorderState === 'recording';
  const finalizing = recorderState === 'finalizing';

  return (
    <main>
      <section className="hero">
        <span className="badge">Aesthetic Render Studio</span>
        <h1>Create a Dreamy Ambient Video</h1>
        <p>
          Generate a luminous, flowing abstract ambience and export it as a WebM clip ready for your mood boards,
          backgrounds, or social loops. Hit render and let the waves bloom into motion.
        </p>
      </section>

      <div className="canvas-shell">
        <canvas ref={canvasRef} />
      </div>

      <div className="timeline" aria-hidden="true">
        <div className="timeline-progress" style={{ width: `${progressPct}%` }} />
      </div>

      <section className="controls">
        <button type="button" onClick={beginRecording} disabled={recording || finalizing}>
          {recording ? 'Rendering...' : finalizing ? 'Finishing...' : 'Render 12s Clip'}
        </button>
        <div className="info">
          <strong>Flow Notes</strong>
          <p>
            The recorder captures the live generative canvas at 60 FPS for 12 seconds, then produces a WebM video with
            luminous gradients and orbiting particles.
          </p>
        </div>
        {videoUrl ? (
          <a className="download-link" download="aesthetic-loop.webm" href={videoUrl}>
            Download Clip ↘
          </a>
        ) : null}
      </section>

      <footer>
        <span>Tip: Hold the render panel in view to keep the vibes flowing.</span>
        <span>Crafted with Canvas + MediaRecorder.</span>
      </footer>
    </main>
  );
}

import { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, RefreshCw, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { api, extractErrorMessage } from '../services/api';
import type { InferenceResult } from '../types';

interface CameraCaptureStepProps {
  venueId: number;
  consentId: string;
  onComplete: (result: InferenceResult) => void;
  onCancelToDirectFeedback: () => void;
}

interface QualityReadout {
  brightness: number;
  blur_score: number;
  framing_score: number;
  face_detected: boolean;
  smile_signal: number;
}

function evaluateCanvasFrame(canvas: HTMLCanvasElement): QualityReadout {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return { brightness: 0, blur_score: 0, framing_score: 0, face_detected: false, smile_signal: 0.5 };
  }

  const w = canvas.width;
  const h = canvas.height;
  const { data } = ctx.getImageData(0, 0, w, h);

  let luminanceSum = 0;
  let centerLuminanceSum = 0;
  let centerCount = 0;
  let skinToneLikePixels = 0;
  let edgeEnergySum = 0;
  let upperCenterLum = 0;
  let lowerCenterLum = 0;

  const cx0 = Math.floor(w * 0.28);
  const cx1 = Math.floor(w * 0.72);
  const cy0 = Math.floor(h * 0.18);
  const cy1 = Math.floor(h * 0.82);
  const midY = Math.floor(h * 0.52);

  const lumGrid = new Float32Array(w * h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      lumGrid[y * w + x] = lum;
      luminanceSum += lum;

      if (x >= cx0 && x <= cx1 && y >= cy0 && y <= cy1) {
        centerLuminanceSum += lum;
        centerCount++;
        if (y < midY) upperCenterLum += lum;
        else lowerCenterLum += lum;

        // Broad illumination-tolerant foreground contrast/skin heuristic for framing check only (not biometric)
        const maxC = Math.max(r, g, b);
        const minC = Math.min(r, g, b);
        if (r > 60 && g > 40 && b > 25 && maxC - minC > 12 && r >= g) {
          skinToneLikePixels++;
        }
      }
    }
  }

  // Laplacian-style gradient magnitude in center box for blur estimation
  for (let y = cy0 + 1; y < cy1 - 1; y += 2) {
    for (let x = cx0 + 1; x < cx1 - 1; x += 2) {
      const c = lumGrid[y * w + x];
      const dx = Math.abs(c - lumGrid[y * w + (x + 1)]);
      const dy = Math.abs(c - lumGrid[(y + 1) * w + x]);
      edgeEnergySum += dx + dy;
    }
  }

  const totalPixels = w * h;
  const brightness = luminanceSum / totalPixels;
  const sampledCenterEdges = Math.max(1, Math.floor((cx1 - cx0) / 2) * Math.floor((cy1 - cy0) / 2));
  const avgEdge = edgeEnergySum / sampledCenterEdges;
  const blur_score = Math.min(1, avgEdge * 12);

  const skinRatio = centerCount > 0 ? skinToneLikePixels / centerCount : 0;
  const centerAvgLum = centerCount > 0 ? centerLuminanceSum / centerCount : 0;
  const framing_score = Math.min(1, skinRatio * 2.2 + (centerAvgLum > 0.15 ? 0.25 : 0));
  const face_detected = skinRatio >= 0.08 && brightness >= 0.14;

  // Ephemeral non-identifying contrast ratio used only by demonstration provider
  const halfCount = Math.max(1, centerCount / 2);
  const diff = (lowerCenterLum / halfCount) - (upperCenterLum / halfCount);
  const smile_signal = Math.max(0.15, Math.min(0.88, 0.52 + diff * 1.5));

  return {
    brightness: Number(brightness.toFixed(2)),
    blur_score: Number(blur_score.toFixed(2)),
    framing_score: Number(framing_score.toFixed(2)),
    face_detected,
    smile_signal: Number(smile_signal.toFixed(2)),
  };
}

export default function CameraCaptureStep({
  venueId,
  consentId,
  onComplete,
  onCancelToDirectFeedback,
}: CameraCaptureStepProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [quality, setQuality] = useState<QualityReadout | null>(null);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<InferenceResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stopCameraStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  const startCamera = useCallback(async () => {
    setError(null);
    setPermissionDenied(false);
    setResult(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setPermissionDenied(true);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
    } catch {
      setPermissionDenied(true);
      setCameraActive(false);
    }
  }, []);

  useEffect(() => {
    startCamera();
    return () => {
      stopCameraStream();
    };
  }, [startCamera, stopCameraStream]);

  // Live lightweight local quality guidance every 600ms while preview is open
  useEffect(() => {
    if (!cameraActive) return;
    const interval = window.setInterval(() => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) return;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      canvas.width = 160;
      canvas.height = 120;
      ctx.drawImage(video, 0, 0, 160, 120);
      setQuality(evaluateCanvasFrame(canvas));
    }, 600);

    return () => window.clearInterval(interval);
  }, [cameraActive]);

  const submitQualityForInference = async (metrics: QualityReadout, isDemoMode: boolean) => {
    setProcessing(true);
    setError(null);
    try {
      const res = await api.post('/inference-events', {
        venue_id: venueId,
        consent_id: consentId,
        quality_metrics: metrics,
        is_demo_mode: isDemoMode,
      });
      setResult(res.data as InferenceResult);
    } catch (err) {
      setError(extractErrorMessage(err, 'Unable to complete expression cue check. Please continue camera-free.'));
    } finally {
      setProcessing(false);
    }
  };

  const handleCaptureFrame = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    canvas.width = 240;
    canvas.height = 180;
    ctx.drawImage(video, 0, 0, 240, 180);
    const metrics = evaluateCanvasFrame(canvas);

    // Immediately clear canvas pixel buffer and stop camera stream
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    stopCameraStream();

    await submitQualityForInference(metrics, false);
  };

  const handleDemoSimulatedCapture = async () => {
    stopCameraStream();
    await submitQualityForInference(
      {
        face_detected: true,
        brightness: 0.56,
        blur_score: 0.68,
        framing_score: 0.78,
        smile_signal: 0.71,
      },
      true
    );
  };

  const lightingText = !quality
    ? 'Checking lighting...'
    : quality.brightness < 0.2
      ? 'Too dark — move toward light'
      : quality.brightness > 0.9
        ? 'Too bright — reduce glare'
        : 'Lighting acceptable';

  const blurText = !quality
    ? 'Checking focus...'
    : quality.blur_score < 0.25
      ? 'Hold steady — frame is blurry'
      : 'Focus sharp';

  const framingText = !quality
    ? 'Checking framing...'
    : !quality.face_detected || quality.framing_score < 0.4
      ? 'Center face in guide box'
      : 'Face framed';

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900">
            Brief Camera Cue Check
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Single-frame capture only · Raw frame is discarded immediately after processing
          </p>
        </div>

        {cameraActive && (
          <div className="inline-flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">
            <Camera className="h-3.5 w-3.5" />
            <span>Camera Active — Single Frame Mode</span>
          </div>
        )}
      </div>

      {!result && !permissionDenied && (
        <div className="grid gap-6 lg:grid-cols-5 items-start">
          <div className="lg:col-span-3 relative overflow-hidden rounded-xl border border-slate-200 bg-slate-900 aspect-[4/3]">
            <video
              ref={videoRef}
              playsInline
              muted
              className="h-full w-full object-cover scale-x-[-1]"
            />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-48 w-36 sm:h-56 sm:w-44 rounded-2xl border-2 border-dashed border-white/70" />
            </div>
            <canvas ref={canvasRef} className="hidden" />
          </div>

          <div className="lg:col-span-2 space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2.5">
              <p className="text-xs font-semibold text-slate-900">Live Frame Quality Checks</p>
              <div className="text-xs text-slate-700 flex items-center justify-between">
                <span>Lighting</span>
                <span className="font-medium tabular-nums">{lightingText}</span>
              </div>
              <div className="text-xs text-slate-700 flex items-center justify-between">
                <span>Sharpness</span>
                <span className="font-medium tabular-nums">{blurText}</span>
              </div>
              <div className="text-xs text-slate-700 flex items-center justify-between">
                <span>Framing</span>
                <span className="font-medium tabular-nums">{framingText}</span>
              </div>
            </div>

            <button
              type="button"
              disabled={!cameraActive || processing}
              onClick={handleCaptureFrame}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 transition-colors min-h-[44px]"
            >
              <Camera className="h-4 w-4" />
              <span>{processing ? 'Processing Brief Frame...' : 'Capture Brief Frame'}</span>
            </button>

            <button
              type="button"
              disabled={processing}
              onClick={handleDemoSimulatedCapture}
              className="w-full inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors min-h-[40px]"
            >
              Run Demonstration Sample Check (No Webcam Required)
            </button>

            <button
              type="button"
              onClick={() => {
                stopCameraStream();
                onCancelToDirectFeedback();
              }}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              <span>Cancel Camera &amp; Continue Direct Rating</span>
            </button>
          </div>
        </div>
      )}

      {permissionDenied && !result && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-900">
                Camera Access Unavailable or Declined
              </h3>
              <p className="text-sm text-slate-700">
                Browser camera permission was denied or no camera device was detected. You can complete your feedback directly without a camera, or run a labeled demonstration sample check.
              </p>
              <div className="flex flex-wrap gap-3 pt-1">
                <button
                  type="button"
                  onClick={onCancelToDirectFeedback}
                  className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 min-h-[44px]"
                >
                  Continue with Camera-Free Feedback
                </button>
                <button
                  type="button"
                  disabled={processing}
                  onClick={handleDemoSimulatedCapture}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 min-h-[44px]"
                >
                  Run Demo Sample Check
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 space-y-4">
          <div className="flex items-start gap-3">
            {result.status === 'success' ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-700 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
            )}
            <div className="space-y-1.5">
              <h3 className="text-base font-semibold text-slate-900">
                {result.status === 'success'
                  ? `Visual Cue Recorded (${result.expression_cue.replace('_', '-')})`
                  : result.message || 'Unable to assess – Please use another feedback method.'}
              </h3>
              <p className="text-xs text-slate-600 tabular-nums">
                Provider: {result.model_version} (Demonstration) · Confidence Band: {result.confidence_band} ({Math.round(result.confidence * 100)}%) · Quality: {result.quality_status}
              </p>
              <p className="text-xs text-slate-600 leading-relaxed pt-1">
                {result.note}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => onComplete(result)}
              className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800 min-h-[44px]"
            >
              Proceed to Direct Star Ratings
            </button>
            {result.status === 'abstention' && (
              <button
                type="button"
                onClick={onCancelToDirectFeedback}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 min-h-[44px]"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Skip Camera &amp; Rate Directly</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

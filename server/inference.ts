import db from './db.ts';

export type ExpressionCue = 'smile_like' | 'neutral_like' | 'other_expression' | 'uncertain';
export type ConfidenceBand = 'high' | 'medium' | 'low';

export interface InferenceRequestPayload {
  venue_id: number;
  consent_id: string;
  quality_metrics: {
    face_detected: boolean;
    brightness: number; // 0..1
    blur_score: number; // 0..1 (higher = sharper)
    framing_score: number; // 0..1
    smile_signal?: number; // optional ephemeral geometry ratio 0..1 from client canvas check
  };
  is_demo_mode?: boolean;
}

export interface InferenceResponsePayload {
  status: 'success' | 'abstention';
  expression_cue: ExpressionCue;
  confidence: number;
  confidence_band: ConfidenceBand;
  quality_status: 'acceptable' | 'insufficient';
  model_version: string;
  is_demo: boolean;
  message?: string;
  note: string;
}

const ABSTENTION_THRESHOLD = 0.55;
const MODEL_VERSION = 'demo-v1';
const UNABLE_MESSAGE = 'Unable to assess – Please use another feedback method.';
const ETHICAL_NOTE =
  'This is an uncertain visual cue from a demonstration provider, not a measure of customer satisfaction or actual emotion.';

export function runConsentVerifiedInference(payload: InferenceRequestPayload): {
  httpStatus: number;
  body: InferenceResponsePayload | { detail: string };
} {
  const { venue_id, consent_id, quality_metrics } = payload;

  if (!venue_id || !consent_id) {
    return {
      httpStatus: 400,
      body: { detail: 'Both venue_id and consent_id are required.' },
    };
  }

  // Strictly validate affirmative consent before any processing
  const consentRow = db
    .prepare('SELECT id, venue_id, consent_choice, used_for_inference FROM consent_events WHERE id = ?')
    .get(consent_id) as
    | { id: string; venue_id: number; consent_choice: string; used_for_inference: number }
    | undefined;

  if (!consentRow) {
    return {
      httpStatus: 403,
      body: { detail: 'Consent record not found. Camera inference requires prior affirmative consent.' },
    };
  }

  if (Number(consentRow.venue_id) !== Number(venue_id)) {
    return {
      httpStatus: 403,
      body: { detail: 'Consent record does not match the target venue.' },
    };
  }

  if (consentRow.consent_choice !== 'accepted') {
    return {
      httpStatus: 403,
      body: { detail: 'Camera consent was declined. Inference cannot proceed.' },
    };
  }

  if (consentRow.used_for_inference === 1) {
    return {
      httpStatus: 409,
      body: { detail: 'This consent token has already been used for a single brief interaction.' },
    };
  }

  // Mark single-use consent immediately so raw interaction cannot be replayed
  db.prepare('UPDATE consent_events SET used_for_inference = 1 WHERE id = ?').run(consent_id);

  // Validate image quality gates (face presence, lighting, blur, framing)
  const { face_detected, brightness, blur_score, framing_score, smile_signal } = quality_metrics;
  const lightingOk = brightness >= 0.20 && brightness <= 0.90;
  const sharpnessOk = blur_score >= 0.25;
  const framingOk = framing_score >= 0.40;

  if (!face_detected || !lightingOk || !sharpnessOk || !framingOk) {
    recordDeidentifiedCue(venue_id, 'uncertain', 'low', 'insufficient', Boolean(payload.is_demo_mode));
    return {
      httpStatus: 200,
      body: {
        status: 'abstention',
        expression_cue: 'uncertain',
        confidence: 0.0,
        confidence_band: 'low',
        quality_status: 'insufficient',
        model_version: MODEL_VERSION,
        is_demo: true,
        message: UNABLE_MESSAGE,
        note: ETHICAL_NOTE,
      },
    };
  }

  // Demonstration Provider: calculates bounded, calibrated cue probabilities from ephemeral non-biometric quality/luminance signal.
  // Never claims real emotion recognition and enforces abstention when below threshold.
  const signal = typeof smile_signal === 'number' ? Math.max(0, Math.min(1, smile_signal)) : 0.5;
  let cue: ExpressionCue = 'neutral_like';
  let rawConfidence = 0.62;

  if (signal >= 0.63) {
    cue = 'smile_like';
    rawConfidence = Math.min(0.84, 0.58 + (signal - 0.6) * 0.65);
  } else if (signal <= 0.34) {
    cue = 'other_expression';
    rawConfidence = Math.min(0.76, 0.50 + (0.35 - signal) * 0.7);
  } else {
    cue = 'neutral_like';
    rawConfidence = Math.min(0.79, 0.56 + (0.15 - Math.abs(signal - 0.48)) * 0.9);
  }

  // Quality attenuation
  const qualityFactor = Math.min(1, (blur_score + framing_score) / 1.5);
  const calibratedConfidence = Number((rawConfidence * (0.75 + 0.25 * qualityFactor)).toFixed(2));

  if (calibratedConfidence < ABSTENTION_THRESHOLD) {
    recordDeidentifiedCue(venue_id, 'uncertain', 'low', 'acceptable', Boolean(payload.is_demo_mode));
    return {
      httpStatus: 200,
      body: {
        status: 'abstention',
        expression_cue: 'uncertain',
        confidence: calibratedConfidence,
        confidence_band: 'low',
        quality_status: 'acceptable',
        model_version: MODEL_VERSION,
        is_demo: true,
        message: UNABLE_MESSAGE,
        note: ETHICAL_NOTE,
      },
    };
  }

  const band: ConfidenceBand =
    calibratedConfidence >= 0.78 ? 'high' : calibratedConfidence >= 0.62 ? 'medium' : 'low';

  recordDeidentifiedCue(venue_id, cue, band, 'acceptable', Boolean(payload.is_demo_mode));

  return {
    httpStatus: 200,
    body: {
      status: 'success',
      expression_cue: cue,
      confidence: calibratedConfidence,
      confidence_band: band,
      quality_status: 'acceptable',
      model_version: MODEL_VERSION,
      is_demo: true,
      note: ETHICAL_NOTE,
    },
  };
}

function recordDeidentifiedCue(
  venueId: number,
  cue: ExpressionCue,
  band: ConfidenceBand,
  qualityStatus: 'acceptable' | 'insufficient',
  isDemo: boolean
): void {
  const timeBucket = new Date().toISOString().slice(0, 13).replace('T', ' ') + ':00';
  db.prepare(`
    INSERT INTO feedback_events (venue_id, time_bucket, model_version, expression_cue, confidence_band, quality_status, is_demo)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(venueId, timeBucket, MODEL_VERSION, cue, band, qualityStatus, isDemo ? 1 : 0);
}

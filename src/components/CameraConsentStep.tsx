import { useState } from 'react';
import { ShieldCheck, CameraOff, ArrowRight } from 'lucide-react';
import { api, extractErrorMessage } from '../services/api';

interface CameraConsentStepProps {
  venueId: number;
  venueName: string;
  onConsentGranted: (consentId: string) => void;
  onDeclineCamera: () => void;
}

export default function CameraConsentStep({
  venueId,
  venueName,
  onConsentGranted,
  onDeclineCamera,
}: CameraConsentStepProps) {
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recordConsent = async (choice: 'accepted' | 'declined') => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.post('/consents', {
        venue_id: venueId,
        notice_version: 'v2.1-2026',
        consent_choice: choice,
      });
      if (choice === 'accepted') {
        onConsentGranted(res.data.consent_id);
      } else {
        onDeclineCamera();
      }
    } catch (err) {
      setError(extractErrorMessage(err, 'Unable to record your consent preference.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
      <div className="flex items-start gap-3">
        <ShieldCheck className="h-6 w-6 text-slate-900 shrink-0 mt-0.5" />
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900">
            Optional Camera Feedback Consent
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {venueName} invites you to optionally share a single brief facial-expression cue. Declining has zero effect on submitting your star ratings or comments.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3 border-t border-b border-slate-200 py-5">
        <div>
          <p className="text-xs font-semibold text-slate-900">What Is Processed</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            One guest-initiated camera frame checked briefly for lighting, focus, and broad visible expression cues (such as smile-like or neutral-like).
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-900">Why It Is Processed</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            Only to add an anonymous, aggregate signal alongside direct guest ratings. Facial cues never determine actual emotion or satisfaction.
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-900">Retention & Non-Storage</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            Raw image frames are discarded immediately after inference. No photos, videos, face templates, or guest identities are ever saved.
          </p>
        </div>
      </div>

      <div className="mt-5 rounded-lg bg-slate-50 border border-slate-200 p-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
          />
          <span className="text-sm text-slate-800 leading-relaxed">
            I understand this camera step is completely optional, uses no face recognition or identity tracking, discards my image immediately after processing, and I give affirmative consent for one brief camera check.
          </span>
        </label>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <button
          type="button"
          disabled={submitting}
          onClick={() => recordConsent('declined')}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors min-h-[44px]"
        >
          <CameraOff className="h-4 w-4" />
          <span>Decline &amp; Use Camera-Free Feedback</span>
        </button>

        <button
          type="button"
          disabled={!checked || submitting}
          onClick={() => recordConsent('accepted')}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors min-h-[44px]"
        >
          <span>{submitting ? 'Recording Consent...' : 'Confirm Consent & Open Camera'}</span>
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

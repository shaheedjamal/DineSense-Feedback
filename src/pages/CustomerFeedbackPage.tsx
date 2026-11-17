import React, { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Camera, ShieldCheck, MessageSquare, ArrowLeft } from 'lucide-react';
import Navbar from '../components/Navbar';
import StarRatingInput from '../components/StarRatingInput';
import CameraConsentStep from '../components/CameraConsentStep';
import CameraCaptureStep from '../components/CameraCaptureStep';
import { api, extractErrorMessage } from '../services/api';
import type { InferenceResult, Venue } from '../types';

type FeedbackStep = 'method' | 'consent' | 'camera' | 'survey' | 'thankyou';

export default function CustomerFeedbackPage() {
  const { venueId: paramVenueId } = useParams<{ venueId?: string }>();
  const [searchParams] = useSearchParams();
  const channelParam = searchParams.get('channel');
  const channel: 'web' | 'qr' | 'kiosk' =
    channelParam === 'qr' || channelParam === 'kiosk' ? channelParam : 'web';

  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState<number | null>(
    paramVenueId ? Number(paramVenueId) : null
  );
  const [loadingVenues, setLoadingVenues] = useState(true);

  const [step, setStep] = useState<FeedbackStep>('method');
  const [consentId, setConsentId] = useState<string | null>(null);
  const [inferenceResult, setInferenceResult] = useState<InferenceResult | null>(null);

  const [foodRating, setFoodRating] = useState(0);
  const [serviceRating, setServiceRating] = useState(0);
  const [cleanlinessRating, setCleanlinessRating] = useState(0);
  const [waitingTimeRating, setWaitingTimeRating] = useState(0);
  const [comment, setComment] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedOverall, setSubmittedOverall] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoadingVenues(true);
      try {
        const res = await api.get('/venues/public');
        const list = (res.data.venues || []) as Venue[];
        if (!active) return;
        setVenues(list);
        if (paramVenueId) {
          setSelectedVenueId(Number(paramVenueId));
        } else if (list.length > 0 && !selectedVenueId) {
          setSelectedVenueId(list[0].id);
        }
      } catch (err) {
        if (active) setError(extractErrorMessage(err, 'Failed to load restaurant list.'));
      } finally {
        if (active) setLoadingVenues(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [paramVenueId]);

  const currentVenue = venues.find((v) => v.id === selectedVenueId) || null;
  const cameraAllowedAtVenue = Boolean(currentVenue?.camera_feedback_enabled);

  const allRated =
    foodRating >= 1 && serviceRating >= 1 && cleanlinessRating >= 1 && waitingTimeRating >= 1;

  const computedAverage = allRated
    ? ((foodRating + serviceRating + cleanlinessRating + waitingTimeRating) / 4).toFixed(2)
    : null;

  const handleSubmitSurvey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVenueId) return;
    if (!allRated) {
      setError('Please select a 1–5 star rating for all four dining categories.');
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const res = await api.post('/survey-responses', {
        venue_id: selectedVenueId,
        submission_channel: channel,
        used_camera_cue: Boolean(inferenceResult && inferenceResult.status === 'success'),
        food_rating: foodRating,
        service_rating: serviceRating,
        cleanliness_rating: cleanlinessRating,
        waiting_time_rating: waitingTimeRating,
        comment: comment.trim() || null,
      });
      setSubmittedOverall(res.data.overall_rating);
      setStep('thankyou');
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not submit your feedback. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  const resetForAnotherGuest = () => {
    setFoodRating(0);
    setServiceRating(0);
    setCleanlinessRating(0);
    setWaitingTimeRating(0);
    setComment('');
    setConsentId(null);
    setInferenceResult(null);
    setSubmittedOverall(null);
    setError(null);
    setStep('method');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Navbar />

      <main className="mx-auto max-w-3xl px-6 py-10 lg:py-14">
        {loadingVenues ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 space-y-4">
            <div className="h-6 w-48 animate-pulse rounded bg-slate-200" />
            <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
            <div className="h-32 w-full animate-pulse rounded bg-slate-100" />
          </div>
        ) : !currentVenue ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
            <h1 className="font-display text-xl font-bold text-slate-900">
              No Active Restaurant Selected
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              This feedback link is invalid or no active restaurant venues are currently configured.
            </p>
            <Link
              to="/"
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white"
            >
              Return Home
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Venue Header & Privacy Summary */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <p className="text-xs font-medium text-slate-500">
                    Guest Experience Survey · Channel: {channel.toUpperCase()}
                  </p>
                  <h1 className="mt-1 font-display text-2xl font-bold text-slate-900">
                    {currentVenue.restaurant_name}
                  </h1>
                  <p className="text-sm text-slate-500">{currentVenue.location}</p>
                </div>

                {!paramVenueId && venues.length > 1 && step === 'method' && (
                  <div className="sm:w-56">
                    <label htmlFor="venue-select" className="block text-xs font-medium text-slate-600 mb-1">
                      Switch Restaurant
                    </label>
                    <select
                      id="venue-select"
                      value={selectedVenueId ?? ''}
                      onChange={(e) => setSelectedVenueId(Number(e.target.value))}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
                    >
                      {venues.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.restaurant_name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <p className="mt-4 text-sm leading-relaxed text-slate-700">
                {currentVenue.welcome_message}
              </p>

              <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-600">
                <ShieldCheck className="h-4 w-4 text-slate-800 shrink-0 mt-0.5" />
                <span>
                  Privacy Notice: No account or personal contact details are required. Camera use is completely optional and never stores photos or identifies you.
                </span>
              </div>
            </div>

            {/* Step 1: Choose Feedback Method */}
            {step === 'method' && (
              <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8 space-y-5">
                <div>
                  <h2 className="font-display text-lg font-bold text-slate-900">
                    Choose How to Share Feedback
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Direct star ratings are our primary way of listening to guests.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setStep('survey')}
                    className="flex flex-col items-start text-left rounded-xl border-2 border-slate-900 bg-white p-5 hover:bg-slate-50 transition-colors"
                  >
                    <MessageSquare className="h-5 w-5 text-slate-900" />
                    <p className="mt-3 font-display text-base font-semibold text-slate-900">
                      Camera-Free Direct Feedback
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">
                      Rate food, service, cleanliness, and wait time directly using touch controls. Fastest option.
                    </p>
                  </button>

                  <button
                    type="button"
                    disabled={!cameraAllowedAtVenue}
                    onClick={() => setStep('consent')}
                    className="flex flex-col items-start text-left rounded-xl border border-slate-300 bg-white p-5 hover:border-slate-900 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Camera className="h-5 w-5 text-slate-700" />
                    <p className="mt-3 font-display text-base font-semibold text-slate-900">
                      Optional Camera Cue + Ratings
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">
                      {cameraAllowedAtVenue
                        ? 'Review explicit camera consent first, optionally capture one brief frame, then complete ratings.'
                        : 'Camera cue option is currently disabled by this restaurant.'}
                    </p>
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Explicit Camera Consent */}
            {step === 'consent' && (
              <CameraConsentStep
                venueId={currentVenue.id}
                venueName={currentVenue.restaurant_name}
                onConsentGranted={(id) => {
                  setConsentId(id);
                  setStep('camera');
                }}
                onDeclineCamera={() => {
                  setConsentId(null);
                  setStep('survey');
                }}
              />
            )}

            {/* Step 3: Brief Camera Capture */}
            {step === 'camera' && consentId && (
              <CameraCaptureStep
                venueId={currentVenue.id}
                consentId={consentId}
                onComplete={(res) => {
                  setInferenceResult(res);
                  setStep('survey');
                }}
                onCancelToDirectFeedback={() => setStep('survey')}
              />
            )}

            {/* Step 4: Direct Star Ratings & Comment */}
            {step === 'survey' && (
              <form
                onSubmit={handleSubmitSurvey}
                className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8 space-y-6"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="font-display text-lg font-bold text-slate-900">
                      Rate Your Dining Experience
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Tap 1 to 5 stars for each aspect of your visit.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStep('method')}
                    className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    <span>Change Method</span>
                  </button>
                </div>

                {inferenceResult && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-700">
                    Optional camera check completed ({inferenceResult.status === 'success' ? inferenceResult.expression_cue.replace('_', '-') : 'abstained — no cue recorded'}). Your direct ratings below remain the primary feedback.
                  </div>
                )}

                <div>
                  <StarRatingInput
                    label="Food Quality"
                    description="Taste, temperature, freshness, and presentation"
                    value={foodRating}
                    onChange={setFoodRating}
                  />
                  <StarRatingInput
                    label="Staff Service"
                    description="Warmth, attentiveness, and order accuracy"
                    value={serviceRating}
                    onChange={setServiceRating}
                  />
                  <StarRatingInput
                    label="Cleanliness"
                    description="Tableware, seating area, and dining environment"
                    value={cleanlinessRating}
                    onChange={setCleanlinessRating}
                  />
                  <StarRatingInput
                    label="Waiting Time"
                    description="Seating wait, drink delivery, and course pacing"
                    value={waitingTimeRating}
                    onChange={setWaitingTimeRating}
                  />
                </div>

                <div>
                  <label htmlFor="guest-comment" className="block text-sm font-semibold text-slate-900">
                    Optional Written Comment
                  </label>
                  <textarea
                    id="guest-comment"
                    rows={3}
                    maxLength={1200}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Share anything that made your meal great or what our team can improve..."
                    className="mt-2 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-slate-900 focus:outline-none"
                  />
                </div>

                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-2 border-t border-slate-200">
                  <div className="text-sm text-slate-600 tabular-nums">
                    {computedAverage ? (
                      <span>
                        Calculated Overall Rating:{' '}
                        <strong className="text-slate-900">{computedAverage} / 5.00</strong>
                      </span>
                    ) : (
                      <span>Select all 4 ratings to submit</span>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={submitting || !allRated}
                    className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-6 py-3 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors min-h-[44px]"
                  >
                    {submitting ? 'Submitting Feedback...' : 'Submit Feedback'}
                  </button>
                </div>
              </form>
            )}

            {/* Step 5: Thank You Screen */}
            {step === 'thankyou' && (
              <div className="rounded-xl border border-slate-200 bg-white p-8 sm:p-10 text-center space-y-4">
                <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-700" />
                <h2 className="font-display text-2xl font-bold text-slate-900">
                  Thank You for Your Feedback
                </h2>
                <p className="mx-auto max-w-md text-sm text-slate-600 leading-relaxed">
                  Your direct rating ({submittedOverall?.toFixed(2)} / 5.00) has been securely recorded for {currentVenue.restaurant_name}. No personal identity or camera image was saved.
                </p>

                <div className="pt-4 flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={resetForAnotherGuest}
                    className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800 min-h-[44px]"
                  >
                    Submit Another Response
                  </button>
                  <Link
                    to="/"
                    className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 min-h-[44px] inline-flex items-center"
                  >
                    Back to DineSense Home
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

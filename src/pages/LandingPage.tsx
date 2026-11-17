import { Link } from 'react-router-dom';
import { ArrowRight, ShieldCheck, Star, BarChart3, QrCode, Lock } from 'lucide-react';
import Navbar from '../components/Navbar';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <Navbar />

      {/* Hero Section */}
      <section className="mx-auto max-w-7xl px-6 py-12 lg:py-20">
        <div className="grid gap-10 lg:grid-cols-12 lg:items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-center">
            <p className="text-xs font-semibold tracking-wide text-slate-500">
              Privacy-First Hospitality Feedback
            </p>
            <h1
              className="mt-3 font-display font-bold tracking-tight text-slate-900 text-balance"
              style={{ fontSize: 'clamp(2.25rem, 4vw, 3.5rem)', lineHeight: 1.08 }}
            >
              Understand every dining service through direct guest feedback.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600">
              DineSense Feedback pairs touch-friendly QR and kiosk surveys with optional, consent-verified facial-expression cue analytics—giving managers clear operational insight without storing guest images or tracking identities.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                to="/feedback"
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-6 py-3 text-sm font-medium text-white hover:bg-slate-800 transition-colors min-h-[44px]"
              >
                <span>Try Guest Feedback</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-6 py-3 text-sm font-medium text-slate-900 hover:bg-slate-50 transition-colors min-h-[44px]"
              >
                Get Started / Staff Login
              </Link>
            </div>

            <div className="mt-10 grid grid-cols-3 gap-6 border-t border-slate-200 pt-6">
              <div>
                <p className="font-mono text-xl font-semibold text-slate-900 tabular-nums">100%</p>
                <p className="mt-1 text-xs text-slate-500">Opt-in camera consent</p>
              </div>
              <div>
                <p className="font-mono text-xl font-semibold text-slate-900 tabular-nums">0 Frames</p>
                <p className="mt-1 text-xs text-slate-500">Saved after inference</p>
              </div>
              <div>
                <p className="font-mono text-xl font-semibold text-slate-900 tabular-nums">n &ge; 5</p>
                <p className="mt-1 text-xs text-slate-500">Privacy group threshold</p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="h-full min-h-[320px] overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
              <img
                src="/src/assets/images/hero_restaurant_dining_1794910010477.jpg"
                alt="Evening service inside a modern restaurant dining room"
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* How the System Works */}
      <section id="how-it-works" className="border-t border-slate-200 bg-slate-50 py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-6">
          <div className="max-w-2xl">
            <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              How DineSense Feedback Works
            </h2>
            <p className="mt-3 text-base text-slate-600">
              Direct customer ratings always come first. Optional camera cues serve only as a supplementary, uncertain visual signal.
            </p>
          </div>

          <div className="mt-10 grid gap-8 md:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <p className="font-mono text-xs font-medium text-slate-500">01. Direct Guest Choice</p>
              <h3 className="mt-2 font-display text-lg font-semibold text-slate-900">
                Scan QR or Tap Kiosk
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Guests open the venue feedback page without creating an account, read a plain-language privacy notice, and choose camera-free feedback or optional camera consent.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <p className="font-mono text-xs font-medium text-slate-500">02. Ephemeral Processing</p>
              <h3 className="mt-2 font-display text-lg font-semibold text-slate-900">
                Brief Quality-Checked Cue
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                If consented, a single frame is checked locally for lighting, sharpness, and framing. Raw images are discarded immediately; low-confidence inputs return a safe abstention.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <p className="font-mono text-xs font-medium text-slate-500">03. Actionable Service Trends</p>
              <h3 className="mt-2 font-display text-lg font-semibold text-slate-900">
                Aggregate Manager Reports
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Managers review food, service, cleanliness, and wait-time scores alongside customer comments and create corrective service actions—never accessing individual guest images.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Capabilities & Table Kiosk Bento */}
      <section id="capabilities" className="py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid gap-10 lg:grid-cols-12 items-stretch">
            <div className="lg:col-span-5 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
              <img
                src="/src/assets/images/table_kiosk_feedback_1794910009438.jpg"
                alt="Tabletop restaurant feedback kiosk resting on a wooden dining table"
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            </div>

            <div className="lg:col-span-7 grid gap-5 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white p-6">
                <Star className="h-5 w-5 text-slate-900" />
                <h3 className="mt-3 font-display text-base font-semibold text-slate-900">
                  Structured Service Ratings
                </h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  Capture separate 1–5 star ratings for food quality, staff hospitality, cleanliness, and waiting time with optional guest comments.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-6">
                <QrCode className="h-5 w-5 text-slate-900" />
                <h3 className="mt-3 font-display text-base font-semibold text-slate-900">
                  QR &amp; Touch Kiosk Channels
                </h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  Generate venue-specific QR codes for table tents or run dedicated tablet kiosk URLs with 44px touch targets.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-6">
                <BarChart3 className="h-5 w-5 text-slate-900" />
                <h3 className="mt-3 font-display text-base font-semibold text-slate-900">
                  Daily, Weekly &amp; Monthly Trends
                </h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  Interactive Recharts visualizations track service shifts and let managers export de-identified CSV and PDF reports.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-6">
                <Lock className="h-5 w-5 text-slate-900" />
                <h3 className="mt-3 font-display text-base font-semibold text-slate-900">
                  Tenant-Isolated RBAC &amp; Audit Logs
                </h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  Strict separation across Super Admins, Restaurant Admins, and Managers with hashed credentials, JWT sessions, and retention purges.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Privacy-First Commitment */}
      <section id="privacy" className="border-t border-slate-200 bg-slate-900 text-white py-16">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid gap-10 lg:grid-cols-12 items-start">
            <div className="lg:col-span-5">
              <div className="inline-flex items-center gap-2 text-xs font-semibold text-slate-300">
                <ShieldCheck className="h-4 w-4" />
                <span>Responsible AI &amp; Privacy Architecture</span>
              </div>
              <h2 className="mt-3 font-display text-2xl sm:text-3xl font-bold tracking-tight text-white">
                Built against covert monitoring and biometric tracking.
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-300">
                Facial expressions cannot reliably determine a guest's real emotion, honesty, or satisfaction. DineSense keeps expression analysis strictly optional, uncertain, and aggregate.
              </p>
            </div>

            <div className="lg:col-span-7 grid gap-4 sm:grid-cols-2 text-sm">
              <div className="rounded-xl border border-slate-800 bg-slate-800/50 p-5">
                <p className="font-semibold text-white">Prohibited by Design</p>
                <ul className="mt-2 space-y-1.5 text-slate-300 text-xs leading-relaxed">
                  <li>No face recognition or guest identity matching</li>
                  <li>No persistent face embeddings or cross-visit tracking</li>
                  <li>No covert capture or continuous video recording</li>
                  <li>No employee scoring or automated access decisions</li>
                </ul>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-800/50 p-5">
                <p className="font-semibold text-white">Technical Safeguards</p>
                <ul className="mt-2 space-y-1.5 text-slate-300 text-xs leading-relaxed">
                  <li>Consent token checked before every inference call</li>
                  <li>Immediate in-memory disposal of single image frames</li>
                  <li>Small-group suppression when sample count n &lt; 5</li>
                  <li>Configurable retention schedules &amp; audit trails</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-200 bg-white py-10">
        <div className="mx-auto max-w-7xl px-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-slate-500">
          <div>
            <p className="font-semibold text-slate-900">DineSense Feedback</p>
            <p className="mt-1">
              Production-oriented architecture · Review applicable local data-protection laws (such as India DPDP Act, 2023) before commercial deployment.
            </p>
          </div>
          <div className="flex items-center gap-6 shrink-0">
            <Link to="/feedback" className="hover:text-slate-900">Guest Feedback</Link>
            <Link to="/login" className="hover:text-slate-900">Staff Login</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

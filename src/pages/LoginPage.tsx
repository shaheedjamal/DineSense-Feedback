import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ArrowRight, KeyRound } from 'lucide-react';
import Navbar from '../components/Navbar';
import { useAuth } from '../contexts/AuthContext';
import { api, extractErrorMessage } from '../services/api';

type AuthView = 'login' | 'register' | 'forgot';

const DEMO_ACCOUNTS = [
  { label: 'Super Admin', email: 'superadmin@dinesense.demo', role: 'Platform Governance' },
  { label: 'Restaurant Admin', email: 'admin@bistromeridian.demo', role: 'Bistro Meridian' },
  { label: 'Restaurant Manager', email: 'manager@bistromeridian.demo', role: 'Bistro Meridian' },
];

export default function LoginPage() {
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const [view, setView] = useState<AuthView>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Registration fields
  const [fullName, setFullName] = useState('');
  const [restaurantName, setRestaurantName] = useState('');
  const [location, setLocation] = useState('');

  // Forgot/Reset password fields
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetRequested, setResetRequested] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const redirectByRole = (role: string) => {
    if (role === 'super_admin') navigate('/admin');
    else navigate('/dashboard');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!email.trim() || !password) {
      setError('Please enter both your email address and password.');
      return;
    }
    setSubmitting(true);
    try {
      const loggedUser = await login(email.trim(), password);
      redirectByRole(loggedUser.role);
    } catch (err) {
      setError(extractErrorMessage(err, 'Login failed. Please check your credentials.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!fullName.trim() || !email.trim() || password.length < 8 || !restaurantName.trim()) {
      setError('Full name, restaurant name, email, and an 8+ character password are required.');
      return;
    }
    setSubmitting(true);
    try {
      const created = await register({
        full_name: fullName.trim(),
        email: email.trim(),
        password,
        restaurant_name: restaurantName.trim(),
        location: location.trim() || 'Main Dining Room',
      });
      redirectByRole(created.role);
    } catch (err) {
      setError(extractErrorMessage(err, 'Registration failed.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!email.trim()) {
      setError('Enter your account email first.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post('/auth/forgot-password', { email: email.trim() });
      setResetRequested(true);
      if (res.data.dev_reset_token) {
        setResetToken(res.data.dev_reset_token);
        setNotice('Development reset token generated and pre-filled below.');
      } else {
        setNotice(res.data.message);
      }
    } catch (err) {
      setError(extractErrorMessage(err, 'Unable to initiate password reset.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!resetToken.trim() || newPassword.length < 8) {
      setError('Reset token and a new password (min 8 characters) are required.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post('/auth/reset-password', {
        token: resetToken.trim(),
        new_password: newPassword,
      });
      setNotice(res.data.message);
      setView('login');
      setResetRequested(false);
      setPassword('');
    } catch (err) {
      setError(extractErrorMessage(err, 'Unable to reset password.'));
    } finally {
      setSubmitting(false);
    }
  };

  const fillDemo = (demoEmail: string) => {
    setView('login');
    setEmail(demoEmail);
    setPassword('DemoPass!2026');
    setError(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Navbar />

      <div className="mx-auto max-w-5xl px-6 py-12 lg:py-16">
        <div className="grid gap-8 lg:grid-cols-12 items-start">
          {/* Form Column */}
          <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
            <div className="flex items-center gap-2 border-b border-slate-200 pb-4 mb-6">
              <button
                type="button"
                onClick={() => {
                  setView('login');
                  setError(null);
                  setNotice(null);
                }}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  view === 'login' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setView('register');
                  setError(null);
                  setNotice(null);
                }}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  view === 'register' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Register Venue
              </button>
              <button
                type="button"
                onClick={() => {
                  setView('forgot');
                  setError(null);
                  setNotice(null);
                }}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  view === 'forgot' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Reset Password
              </button>
            </div>

            {error && (
              <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}
            {notice && (
              <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                {notice}
              </div>
            )}

            {view === 'login' && (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <h1 className="font-display text-2xl font-bold text-slate-900">Staff Sign In</h1>
                  <p className="mt-1 text-sm text-slate-600">
                    Access your restaurant analytics, service actions, or platform admin console.
                  </p>
                </div>

                <div>
                  <label htmlFor="login-email" className="block text-sm font-medium text-slate-700">
                    Email Address
                  </label>
                  <input
                    id="login-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="manager@restaurant.com"
                    className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-slate-900 focus:outline-none"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label htmlFor="login-password" className="block text-sm font-medium text-slate-700">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => setView('forgot')}
                      className="text-xs font-medium text-slate-600 hover:text-slate-900"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative mt-1.5">
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 pr-11 text-sm focus:border-slate-900 focus:outline-none"
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-2 text-slate-500 hover:text-slate-900"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 py-3 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 transition-colors min-h-[44px]"
                >
                  <span>{submitting ? 'Signing In...' : 'Sign In'}</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </form>
            )}

            {view === 'register' && (
              <form onSubmit={handleRegister} className="space-y-4">
                <div>
                  <h1 className="font-display text-2xl font-bold text-slate-900">
                    Register a Restaurant
                  </h1>
                  <p className="mt-1 text-sm text-slate-600">
                    Creates a new venue workspace and assigns you as the Restaurant Administrator.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Your Full Name</label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Ananya Rao"
                      className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-slate-900 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Work Email</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="ananya@mybistro.com"
                      className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-slate-900 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Restaurant Name</label>
                    <input
                      type="text"
                      required
                      value={restaurantName}
                      onChange={(e) => setRestaurantName(e.target.value)}
                      placeholder="The Courtyard Table"
                      className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-slate-900 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">City / Location</label>
                    <input
                      type="text"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="Koramangala, Bengaluru"
                      className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-slate-900 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    Password (minimum 8 characters)
                  </label>
                  <div className="relative mt-1.5">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Create a strong password"
                      className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 pr-11 text-sm focus:border-slate-900 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-2 text-slate-500 hover:text-slate-900"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 py-3 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 min-h-[44px]"
                >
                  <span>{submitting ? 'Creating Workspace...' : 'Create Restaurant Workspace'}</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </form>
            )}

            {view === 'forgot' && (
              <div className="space-y-4">
                <div>
                  <h1 className="font-display text-2xl font-bold text-slate-900">Password Recovery</h1>
                  <p className="mt-1 text-sm text-slate-600">
                    Request a single-use reset token for your staff account.
                  </p>
                </div>

                {!resetRequested ? (
                  <form onSubmit={handleForgotRequest} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700">Account Email</label>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="manager@bistromeridian.demo"
                        className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-slate-900 focus:outline-none"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full rounded-lg bg-slate-900 px-5 py-3 text-sm font-medium text-white hover:bg-slate-800 min-h-[44px]"
                    >
                      {submitting ? 'Generating Token...' : 'Request Reset Token'}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleResetConfirm} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700">Reset Token</label>
                      <input
                        type="text"
                        required
                        value={resetToken}
                        onChange={(e) => setResetToken(e.target.value)}
                        className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 font-mono text-xs focus:border-slate-900 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700">
                        New Password (min 8 characters)
                      </label>
                      <input
                        type="password"
                        required
                        minLength={8}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-slate-900 focus:outline-none"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full rounded-lg bg-slate-900 px-5 py-3 text-sm font-medium text-white hover:bg-slate-800 min-h-[44px]"
                    >
                      {submitting ? 'Updating Password...' : 'Set New Password'}
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>

          {/* Demo Accounts Sidebar */}
          <div className="lg:col-span-5 space-y-5">
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <KeyRound className="h-4 w-4" />
                <span>Demonstration Accounts</span>
              </div>
              <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                Select any seeded demonstration role below to populate the sign-in form and test role-based dashboards. Password:{' '}
                <code className="font-mono text-slate-900">DemoPass!2026</code>
              </p>

              <div className="mt-4 divide-y divide-slate-200 border-t border-slate-200">
                {DEMO_ACCOUNTS.map((acc) => (
                  <div key={acc.email} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">{acc.label}</p>
                      <p className="text-xs text-slate-500 truncate">
                        {acc.role} · {acc.email}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => fillDemo(acc.email)}
                      className="shrink-0 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50"
                    >
                      Use Account
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <p className="text-sm font-semibold text-slate-900">Are you a dining guest?</p>
              <p className="mt-1 text-xs text-slate-600">
                Guests never need an account or password to share dining feedback.
              </p>
              <Link
                to="/feedback"
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-900 hover:underline"
              >
                <span>Open Guest Feedback Page</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

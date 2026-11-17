import React, { useEffect, useState, useCallback } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts';
import { Plus, Info, CheckCircle2, Clock } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import { useAuth } from '../contexts/AuthContext';
import { api, extractErrorMessage } from '../services/api';
import type {
  DashboardSummary,
  ServiceAction,
  SurveyResponseItem,
  TrendPoint,
  Venue,
} from '../types';

export default function ManagerDashboardPage() {
  const { user } = useAuth();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState<number | ''>('');
  const [granularity, setGranularity] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [dataScope, setDataScope] = useState<'all' | 'live' | 'demo'>('all');

  const [summaryData, setSummaryData] = useState<DashboardSummary | null>(null);
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [dimensions, setDimensions] = useState<Array<{ metric: string; score: number }>>([]);
  const [recentComments, setRecentComments] = useState<SurveyResponseItem[]>([]);
  const [actions, setActions] = useState<ServiceAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New Service Action form state
  const [showNewAction, setShowNewAction] = useState(false);
  const [issue, setIssue] = useState('');
  const [actionDescription, setActionDescription] = useState('');
  const [assignedRole, setAssignedRole] = useState('Floor Supervisor');
  const [savingAction, setSavingAction] = useState(false);

  useEffect(() => {
    async function loadVenues() {
      try {
        const res = await api.get('/venues');
        const list = (res.data.venues || []) as Venue[];
        setVenues(list);
        if (user?.venue_id) {
          setSelectedVenueId(user.venue_id);
        }
      } catch {
        // Non-blocking if venues fail
      }
    }
    loadVenues();
  }, [user]);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params: Record<string, string | number> = {
      data_scope: dataScope,
      days: granularity === 'monthly' ? 365 : granularity === 'weekly' ? 90 : 30,
    };
    if (selectedVenueId !== '') {
      params.venue_id = selectedVenueId;
    }

    try {
      const [sumRes, trendRes, ratRes, respRes, actRes] = await Promise.all([
        api.get('/dashboard/summary', { params }),
        api.get('/dashboard/trends', { params: { ...params, granularity } }),
        api.get('/dashboard/ratings', { params }),
        api.get('/survey-responses', { params }),
        api.get('/actions', { params: selectedVenueId !== '' ? { venue_id: selectedVenueId } : {} }),
      ]);

      setSummaryData(sumRes.data);
      setTrends(trendRes.data.trends || []);
      setDimensions(ratRes.data.dimensions || []);
      const allResponses = (respRes.data.responses || []) as SurveyResponseItem[];
      setRecentComments(allResponses.filter((r) => r.comment && r.comment.trim().length > 0).slice(0, 6));
      setActions(actRes.data.actions || []);
    } catch (err) {
      setError(extractErrorMessage(err, 'Unable to load dashboard analytics.'));
    } finally {
      setLoading(false);
    }
  }, [selectedVenueId, granularity, dataScope]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const handleCreateAction = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetVenue =
      user?.role === 'super_admin'
        ? selectedVenueId !== ''
          ? Number(selectedVenueId)
          : venues[0]?.id
        : user?.venue_id;
    if (!targetVenue || !issue.trim() || !actionDescription.trim()) return;

    setSavingAction(true);
    try {
      await api.post('/actions', {
        venue_id: targetVenue,
        issue: issue.trim(),
        action_description: actionDescription.trim(),
        assigned_role: assignedRole.trim() || 'Manager',
      });
      setIssue('');
      setActionDescription('');
      setShowNewAction(false);
      await fetchDashboard();
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to create service action.'));
    } finally {
      setSavingAction(false);
    }
  };

  const handleCycleActionStatus = async (act: ServiceAction) => {
    const nextStatus =
      act.status === 'open' ? 'in_progress' : act.status === 'in_progress' ? 'resolved' : 'open';
    try {
      await api.put(`/actions/${act.id}`, { status: nextStatus });
      await fetchDashboard();
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to update action status.'));
    }
  };

  const s = summaryData?.summary;
  const cues = summaryData?.expression_cue_analytics;

  const categoryData = s
    ? [
        { name: 'Positive', count: s.positive_count, fill: '#16A34A' },
        { name: 'Neutral', count: s.neutral_count, fill: '#D97706' },
        { name: 'Negative', count: s.negative_count, fill: '#DC2626' },
      ]
    : [];

  return (
    <DashboardLayout
      breadcrumb="Analytics / Restaurant Manager"
      title="Service Quality & Feedback Analytics"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {user?.role === 'super_admin' && venues.length > 0 && (
            <select
              aria-label="Filter by restaurant"
              value={selectedVenueId}
              onChange={(e) => setSelectedVenueId(e.target.value ? Number(e.target.value) : '')}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-slate-900 focus:outline-none"
            >
              <option value="">All Restaurants</option>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.restaurant_name}
                </option>
              ))}
            </select>
          )}

          <select
            aria-label="Filter data source"
            value={dataScope}
            onChange={(e) => setDataScope(e.target.value as 'all' | 'live' | 'demo')}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-slate-900 focus:outline-none"
          >
            <option value="all">All Data (Live + Demo)</option>
            <option value="live">Live Submissions Only</option>
            <option value="demo">Demo Seed Data Only</option>
          </select>
        </div>
      }
    >
      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* KPI Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">Total Direct Submissions</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {loading ? '—' : s?.total_feedback ?? 0}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            Comment rate: {s?.comment_response_rate ?? 0}%
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">Average Customer Rating</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {loading ? '—' : `${(s?.avg_overall_rating ?? 0).toFixed(2)} / 5.0`}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            Food {s?.avg_food_rating ?? 0} · Service {s?.avg_service_rating ?? 0}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">Direct Sentiment Split</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {loading ? '—' : `${s?.positive_count ?? 0} Pos`}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {s?.neutral_count ?? 0} Neutral · {s?.negative_count ?? 0} Negative
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">Optional Camera Consent</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {loading ? '—' : `${s?.camera_participation_rate ?? 0}%`}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            Accepted: {s?.consent_accepted ?? 0} · Declined: {s?.consent_declined ?? 0}
          </p>
        </div>
      </div>

      {/* Charts Row 1: Trend & Dimension Averages */}
      <div className="mt-6 grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Customer Rating &amp; Volume Trends
              </h2>
              <p className="text-xs text-slate-500">
                Direct customer survey averages across selected period
              </p>
            </div>
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
              {(['daily', 'weekly', 'monthly'] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGranularity(g)}
                  className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors ${
                    granularity === g ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          <div className="h-64 w-full">
            {trends.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                No trend data available for this filter.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trends}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#64748B' }} />
                  <YAxis domain={[0, 5]} tick={{ fontSize: 11, fill: '#64748B' }} />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="avg_rating"
                    name="Avg Overall Rating"
                    stroke="#0F172A"
                    fill="#CBD5E1"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="font-display text-base font-semibold text-slate-900">
            Service Quality Breakdown
          </h2>
          <p className="text-xs text-slate-500 mb-4">
            Average 1–5 star scores by hospitality dimension
          </p>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dimensions} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis type="number" domain={[0, 5]} tick={{ fontSize: 11, fill: '#64748B' }} />
                <YAxis type="category" dataKey="metric" width={100} tick={{ fontSize: 11, fill: '#334155' }} />
                <Tooltip />
                <Bar dataKey="score" name="Avg Rating" fill="#0F172A" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Charts Row 2: Direct Categories vs Separated AI Expression Cues */}
      <div className="mt-6 grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="font-display text-base font-semibold text-slate-900">
            Direct Feedback Categories
          </h2>
          <p className="text-xs text-slate-500 mb-4">
            Based strictly on customer-submitted star ratings
          </p>

          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#334155' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748B' }} />
                <Tooltip />
                <Bar dataKey="count" name="Responses" radius={[4, 4, 0, 0]}>
                  {categoryData.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Optional Aggregate Expression-Cue Distribution
              </h2>
              <p className="text-xs text-slate-500">
                Supplementary visual pattern counts (strictly separated from satisfaction ratings)
              </p>
            </div>
            <span className="font-mono text-xs text-slate-600 tabular-nums">
              Sample size n = {cues?.sample_size ?? 0}
            </span>
          </div>

          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 flex items-start gap-2.5 text-xs text-slate-700">
            <Info className="h-4 w-4 text-slate-700 shrink-0 mt-0.5" />
            <span>
              {cues?.disclaimer ||
                'Expression cues are uncertain visual cues, not measures of actual emotion or guest satisfaction.'}{' '}
              Groups with fewer than {cues?.k_anonymity_threshold ?? 5} observations are suppressed.
            </span>
          </div>

          <div className="mt-4 divide-y divide-slate-200 border-t border-slate-200">
            {(cues?.cues || []).length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">
                No consented expression cue events recorded for this selection.
              </p>
            ) : (
              cues?.cues.map((c) => (
                <div key={c.expression_cue} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="font-medium text-slate-800 capitalize">
                    {c.expression_cue.replace('_', '-')}
                  </span>
                  {c.suppressed ? (
                    <span className="text-xs text-amber-700 font-medium">
                      {c.suppression_reason}
                    </span>
                  ) : (
                    <span className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
                      {c.count} events
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Bottom Row: Recent Guest Comments + Service Improvement Actions */}
      <div className="mt-6 grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-6 rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="font-display text-base font-semibold text-slate-900">
            Recent Guest Comments
          </h2>
          <p className="text-xs text-slate-500 mb-4">
            Anonymous written feedback with overall rating and channel
          </p>

          <div className="divide-y divide-slate-200">
            {recentComments.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">
                No written comments submitted yet.
              </p>
            ) : (
              recentComments.map((item) => (
                <div key={item.id} className="py-3.5">
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                    <span className="font-semibold text-slate-900 tabular-nums">
                      {item.overall_rating.toFixed(1)} / 5.0 · {item.feedback_category}
                    </span>
                    <span className="tabular-nums">
                      {item.submission_channel.toUpperCase()} · {item.created_at.slice(0, 10)}
                      {item.is_demo ? ' · Demo' : ''}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm text-slate-700 leading-relaxed">{item.comment}</p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="lg:col-span-6 rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Service Improvement Actions
              </h2>
              <p className="text-xs text-slate-500">
                Track corrective actions triggered by direct guest feedback
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNewAction((prev) => !prev)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Action</span>
            </button>
          </div>

          {showNewAction && (
            <form onSubmit={handleCreateAction} className="mb-5 rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700">Identified Issue</label>
                <input
                  type="text"
                  required
                  value={issue}
                  onChange={(e) => setIssue(e.target.value)}
                  placeholder="e.g., Slow dessert clearing during Sunday brunch"
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">Corrective Plan</label>
                <textarea
                  rows={2}
                  required
                  value={actionDescription}
                  onChange={(e) => setActionDescription(e.target.value)}
                  placeholder="Assign bussing runner to patio section 11:30–14:30"
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <input
                  type="text"
                  value={assignedRole}
                  onChange={(e) => setAssignedRole(e.target.value)}
                  placeholder="Assigned role"
                  className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
                />
                <button
                  type="submit"
                  disabled={savingAction}
                  className="rounded-md bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800"
                >
                  {savingAction ? 'Saving...' : 'Save Action'}
                </button>
              </div>
            </form>
          )}

          <div className="divide-y divide-slate-200">
            {actions.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">
                No service improvement actions logged yet.
              </p>
            ) : (
              actions.map((act) => (
                <div key={act.id} className="py-3.5 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{act.issue}</p>
                    <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                      {act.action_description}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Owner: {act.assigned_role}
                      {act.outcome ? ` · Outcome: ${act.outcome}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCycleActionStatus(act)}
                    title="Click to advance status"
                    className={`shrink-0 inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                      act.status === 'resolved'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        : act.status === 'in_progress'
                          ? 'border-amber-200 bg-amber-50 text-amber-800'
                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {act.status === 'resolved' ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      <Clock className="h-3.5 w-3.5" />
                    )}
                    <span className="capitalize">{act.status.replace('_', ' ')}</span>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

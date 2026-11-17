import { useEffect, useState, useCallback } from 'react';
import { Search } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import { useAuth } from '../contexts/AuthContext';
import { api, extractErrorMessage } from '../services/api';
import type { SurveyResponseItem, Venue } from '../types';

export default function FeedbackHistoryPage() {
  const { user } = useAuth();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState<number | ''>('');
  const [category, setCategory] = useState<string>('');
  const [dataScope, setDataScope] = useState<'all' | 'live' | 'demo'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const [responses, setResponses] = useState<SurveyResponseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get('/venues')
      .then((res) => setVenues(res.data.venues || []))
      .catch(() => {});
  }, []);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params: Record<string, string | number> = { data_scope: dataScope };
    if (selectedVenueId !== '') params.venue_id = selectedVenueId;
    if (category) params.category = category;

    try {
      const res = await api.get('/survey-responses', { params });
      setResponses(res.data.responses || []);
    } catch (err) {
      setError(extractErrorMessage(err, 'Unable to load feedback history.'));
    } finally {
      setLoading(false);
    }
  }, [selectedVenueId, category, dataScope]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const filtered = responses.filter((r) => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      r.restaurant_name.toLowerCase().includes(q) ||
      (r.comment || '').toLowerCase().includes(q) ||
      r.feedback_category.toLowerCase().includes(q)
    );
  });

  return (
    <DashboardLayout
      breadcrumb="Feedback / History"
      title="Direct Feedback History"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {user?.role === 'super_admin' && venues.length > 0 && (
            <select
              aria-label="Filter by restaurant"
              value={selectedVenueId}
              onChange={(e) => setSelectedVenueId(e.target.value ? Number(e.target.value) : '')}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800"
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
            aria-label="Filter by category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800"
          >
            <option value="">All Categories</option>
            <option value="positive">Positive</option>
            <option value="neutral">Neutral</option>
            <option value="negative">Negative</option>
          </select>
          <select
            aria-label="Filter by data source"
            value={dataScope}
            onChange={(e) => setDataScope(e.target.value as 'all' | 'live' | 'demo')}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800"
          >
            <option value="all">Live + Demo</option>
            <option value="live">Live Only</option>
            <option value="demo">Demo Seed Only</option>
          </select>
        </div>
      }
    >
      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-xs text-slate-600">
            Showing de-identified survey records only. Guest photos, identities, and individual expression cues are never exposed.
          </p>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search comments or venue..."
              className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-1.5 text-xs focus:border-slate-900 focus:outline-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
              <tr>
                <th className="px-6 py-3">Date (UTC)</th>
                <th className="px-6 py-3">Restaurant</th>
                <th className="px-6 py-3 text-right">Overall</th>
                <th className="px-6 py-3">Breakdown (F/S/C/W)</th>
                <th className="px-6 py-3">Category</th>
                <th className="px-6 py-3">Comment</th>
                <th className="px-6 py-3">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-sm text-slate-500">
                    Loading feedback history...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-sm text-slate-500">
                    No matching survey responses found.
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/70">
                    <td className="px-6 py-3.5 font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap">
                      {row.created_at.slice(0, 16)}
                    </td>
                    <td className="px-6 py-3.5 font-medium text-slate-900 whitespace-nowrap">
                      {row.restaurant_name}
                    </td>
                    <td className="px-6 py-3.5 text-right font-mono font-semibold text-slate-900 tabular-nums">
                      {row.overall_rating.toFixed(2)}
                    </td>
                    <td className="px-6 py-3.5 font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap">
                      {row.food_rating}/{row.service_rating}/{row.cleanliness_rating}/{row.waiting_time_rating}
                    </td>
                    <td className="px-6 py-3.5">
                      <span
                        className={`text-xs font-semibold capitalize ${
                          row.feedback_category === 'positive'
                            ? 'text-emerald-700'
                            : row.feedback_category === 'negative'
                              ? 'text-red-700'
                              : 'text-amber-700'
                        }`}
                      >
                        {row.feedback_category}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-xs text-slate-700 max-w-md">
                      {row.comment || <span className="text-slate-400">No written comment</span>}
                    </td>
                    <td className="px-6 py-3.5 text-xs text-slate-500 whitespace-nowrap">
                      {row.submission_channel.toUpperCase()} · {row.is_demo ? 'Demo' : 'Live'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  );
}

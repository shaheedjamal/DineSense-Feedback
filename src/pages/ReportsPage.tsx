import { useEffect, useState, useCallback } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { Download, ShieldAlert } from 'lucide-react';
import { jsPDF } from 'jspdf';
import DashboardLayout from '../components/DashboardLayout';
import { useAuth } from '../contexts/AuthContext';
import { api, extractErrorMessage, getStoredToken } from '../services/api';
import type { Venue } from '../types';

interface ReportPeriod {
  period: string;
  submission_count: number;
  avg_overall: number;
  avg_food: number;
  avg_service: number;
  avg_cleanliness: number;
  avg_waiting: number;
  positive_count: number;
  neutral_count: number;
  negative_count: number;
}

interface ReportResponse {
  granularity: 'daily' | 'weekly' | 'monthly';
  total_submissions: number;
  k_anonymity_threshold: number;
  export_permitted: boolean;
  periods: ReportPeriod[];
}

export default function ReportsPage() {
  const { user } = useAuth();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState<number | ''>('');
  const [granularity, setGranularity] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [dataScope, setDataScope] = useState<'all' | 'live' | 'demo'>('all');

  const [report, setReport] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get('/venues')
      .then((res) => setVenues(res.data.venues || []))
      .catch(() => {});
  }, []);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params: Record<string, string | number> = { data_scope: dataScope };
    if (selectedVenueId !== '') params.venue_id = selectedVenueId;

    try {
      const res = await api.get(`/reports/${granularity}`, { params });
      setReport(res.data);
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to load aggregate report.'));
    } finally {
      setLoading(false);
    }
  }, [granularity, selectedVenueId, dataScope]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const handleCsvExport = async () => {
    setError(null);
    try {
      const params = new URLSearchParams({
        granularity,
        data_scope: dataScope,
        format: 'csv',
      });
      if (selectedVenueId !== '') params.set('venue_id', String(selectedVenueId));

      const response = await fetch(`/api/reports/export?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${getStoredToken()}`,
        },
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.detail || 'Export failed.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dinesense_${granularity}_aggregate_report.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not export CSV.'));
    }
  };

  const handlePdfExport = () => {
    if (!report || !report.export_permitted) {
      setError(
        `Aggregate PDF export requires at least ${report?.k_anonymity_threshold ?? 5} total responses.`
      );
      return;
    }

    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('DineSense Feedback — Aggregate Service Report', 14, 20);
    doc.setFontSize(10);
    doc.text(
      `Granularity: ${granularity.toUpperCase()} | Total Submissions: ${report.total_submissions} | Scope: ${dataScope.toUpperCase()}`,
      14,
      28
    );
    doc.text(
      'Privacy Notice: Only de-identified aggregate statistics are included. Small periods (n < 5) are suppressed.',
      14,
      34
    );

    let y = 46;
    doc.setFontSize(9);
    doc.text('Period | Count | Overall | Food | Service | Clean | Wait | Pos/Neu/Neg', 14, y);
    y += 6;

    for (const p of report.periods.slice(0, 28)) {
      const line =
        p.submission_count < report.k_anonymity_threshold
          ? `${p.period} | ${p.submission_count} | SUPPRESSED (n < ${report.k_anonymity_threshold})`
          : `${p.period} | ${p.submission_count} | ${p.avg_overall} | ${p.avg_food} | ${p.avg_service} | ${p.avg_cleanliness} | ${p.avg_waiting} | ${p.positive_count}/${p.neutral_count}/${p.negative_count}`;
      doc.text(line, 14, y);
      y += 6;
      if (y > 275) {
        doc.addPage();
        y = 20;
      }
    }

    doc.save(`dinesense_${granularity}_aggregate_report.pdf`);
  };

  const chartData = [...(report?.periods || [])].reverse();

  return (
    <DashboardLayout
      breadcrumb="Analytics / Aggregate Reports"
      title="Service Quality Reports & Exports"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!report?.export_permitted}
            onClick={handleCsvExport}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            disabled={!report?.export_permitted}
            onClick={handlePdfExport}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export PDF</span>
          </button>
        </div>
      }
    >
      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Filter Bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
          {(['daily', 'weekly', 'monthly'] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGranularity(g)}
              className={`rounded-md px-3.5 py-1.5 text-xs font-medium capitalize transition-colors ${
                granularity === g ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {g} Reports
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {user?.role === 'super_admin' && venues.length > 0 && (
            <select
              value={selectedVenueId}
              onChange={(e) => setSelectedVenueId(e.target.value ? Number(e.target.value) : '')}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800"
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
            value={dataScope}
            onChange={(e) => setDataScope(e.target.value as 'all' | 'live' | 'demo')}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800"
          >
            <option value="all">Live + Demo</option>
            <option value="live">Live Only</option>
            <option value="demo">Demo Seed Only</option>
          </select>
        </div>
      </div>

      {report && !report.export_permitted && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 flex items-start gap-3 text-xs text-amber-900">
          <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            Privacy protection active: aggregate exports require at least {report.k_anonymity_threshold} responses in the selected window (currently {report.total_submissions}).
          </span>
        </div>
      )}

      {/* Volume & Rating Chart */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900 capitalize">
              {granularity} Submission Volume
            </h2>
            <p className="text-xs text-slate-500 tabular-nums">
              Total sample size n = {report?.total_submissions ?? 0}
            </p>
          </div>
        </div>

        <div className="h-64 w-full">
          {chartData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              No periods recorded in this timeframe.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#64748B' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748B' }} />
                <Tooltip />
                <Bar dataKey="submission_count" name="Submissions" fill="#0F172A" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Period Summary Table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
              <tr>
                <th className="px-6 py-3">Period</th>
                <th className="px-6 py-3 text-right">Count</th>
                <th className="px-6 py-3 text-right">Overall</th>
                <th className="px-6 py-3 text-right">Food</th>
                <th className="px-6 py-3 text-right">Service</th>
                <th className="px-6 py-3 text-right">Cleanliness</th>
                <th className="px-6 py-3 text-right">Waiting</th>
                <th className="px-6 py-3 text-right">Pos / Neu / Neg</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-slate-500">
                    Loading report periods...
                  </td>
                </tr>
              ) : (report?.periods || []).length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-slate-500">
                    No report entries found.
                  </td>
                </tr>
              ) : (
                report?.periods.map((p) => {
                  const isSmall = p.submission_count < report.k_anonymity_threshold;
                  return (
                    <tr key={p.period}>
                      <td className="px-6 py-3.5 font-mono text-xs font-medium text-slate-900 tabular-nums">
                        {p.period}
                      </td>
                      <td className="px-6 py-3.5 text-right font-mono tabular-nums">
                        {p.submission_count}
                      </td>
                      {isSmall ? (
                        <td colSpan={6} className="px-6 py-3.5 text-right text-xs text-amber-700 font-medium">
                          Detailed metrics suppressed (n &lt; {report.k_anonymity_threshold}) for guest privacy
                        </td>
                      ) : (
                        <>
                          <td className="px-6 py-3.5 text-right font-mono font-semibold tabular-nums">
                            {Number(p.avg_overall).toFixed(2)}
                          </td>
                          <td className="px-6 py-3.5 text-right font-mono tabular-nums">
                            {Number(p.avg_food).toFixed(2)}
                          </td>
                          <td className="px-6 py-3.5 text-right font-mono tabular-nums">
                            {Number(p.avg_service).toFixed(2)}
                          </td>
                          <td className="px-6 py-3.5 text-right font-mono tabular-nums">
                            {Number(p.avg_cleanliness).toFixed(2)}
                          </td>
                          <td className="px-6 py-3.5 text-right font-mono tabular-nums">
                            {Number(p.avg_waiting).toFixed(2)}
                          </td>
                          <td className="px-6 py-3.5 text-right font-mono text-xs tabular-nums">
                            {p.positive_count} / {p.neutral_count} / {p.negative_count}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  );
}

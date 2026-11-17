import React, { useEffect, useState, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Building2, Plus, QrCode, ShieldCheck, Trash2, X } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import { useAuth } from '../contexts/AuthContext';
import { api, extractErrorMessage } from '../services/api';
import type { AuditLog, User, Venue } from '../types';

interface SystemHealth {
  system_status: string;
  database_engine: string;
  inference_provider: string;
  counts: {
    total_venues: number;
    active_venues: number;
    total_admins: number;
    total_managers: number;
    total_surveys: number;
    total_expression_events: number;
  };
}

export default function AdminDashboardPage() {
  const { user } = useAuth();
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [staff, setStaff] = useState<User[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create venue modal/form
  const [showAddVenue, setShowAddVenue] = useState(false);
  const [vName, setVName] = useState('');
  const [vLocation, setVLocation] = useState('');
  const [vEmail, setVEmail] = useState('');
  const [vRetention, setVRetention] = useState(90);

  // QR Code Modal
  const [qrVenue, setQrVenue] = useState<Venue | null>(null);

  const loadAdminData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const requests: Array<Promise<any>> = [api.get('/venues'), api.get('/users')];
      if (user?.role === 'super_admin') {
        requests.push(api.get('/admin/system-health'));
        requests.push(api.get('/admin/audit-logs'));
      }
      const results = await Promise.all(requests);
      setVenues(results[0].data.venues || []);
      setStaff(results[1].data.users || []);
      if (user?.role === 'super_admin') {
        setHealth(results[2].data);
        setAuditLogs(results[3].data.logs || []);
      }
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to load administration console.'));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  const handleCreateVenue = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/venues', {
        restaurant_name: vName,
        location: vLocation,
        contact_email: vEmail,
        retention_days: vRetention,
      });
      setVName('');
      setVLocation('');
      setVEmail('');
      setShowAddVenue(false);
      await loadAdminData();
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not create venue.'));
    }
  };

  const handleToggleVenueStatus = async (venue: Venue) => {
    const nextStatus = venue.status === 'active' ? 'inactive' : 'active';
    try {
      await api.put(`/venues/${venue.id}`, { status: nextStatus });
      await loadAdminData();
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not update venue status.'));
    }
  };

  const handleDeleteVenue = async (venueId: number) => {
    try {
      await api.delete(`/venues/${venueId}`);
      await loadAdminData();
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not remove venue.'));
    }
  };

  const qrUrlForVenue = (venueId: number) =>
    `${window.location.origin}/feedback/${venueId}?channel=qr`;

  return (
    <DashboardLayout
      breadcrumb="Administration / Platform & Venue Controls"
      title={user?.role === 'super_admin' ? 'Platform Admin Dashboard' : 'Restaurant Admin Dashboard'}
      actions={
        user?.role === 'super_admin' && (
          <button
            type="button"
            onClick={() => setShowAddVenue((prev) => !prev)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            <span>Add Restaurant</span>
          </button>
        )
      }
    >
      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Platform KPI Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">Total Restaurants</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {loading ? '—' : health?.counts.total_venues ?? venues.length}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            Active: {health?.counts.active_venues ?? venues.filter((v) => v.status === 'active').length}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">Registered Admins</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {loading
              ? '—'
              : health?.counts.total_admins ?? staff.filter((s) => s.role === 'restaurant_admin').length}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">Venue Managers</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {loading
              ? '—'
              : health?.counts.total_managers ?? staff.filter((s) => s.role === 'restaurant_manager').length}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">Total Surveys</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {loading
              ? '—'
              : health?.counts.total_surveys ??
                venues.reduce((acc, v) => acc + (v.total_surveys || 0), 0)}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">System Health</p>
          <p className="mt-2 inline-flex items-center gap-1.5 text-base font-semibold text-emerald-700">
            <ShieldCheck className="h-4 w-4" />
            <span>{health?.system_status === 'operational' ? 'Operational' : 'Active'}</span>
          </p>
          <p className="mt-1 text-xs text-slate-500 truncate">
            Provider: {health?.inference_provider || 'demo-v1'}
          </p>
        </div>
      </div>

      {/* Add Restaurant Form */}
      {showAddVenue && user?.role === 'super_admin' && (
        <form
          onSubmit={handleCreateVenue}
          className="mt-6 rounded-xl border border-slate-200 bg-white p-6 space-y-4"
        >
          <h2 className="font-display text-base font-semibold text-slate-900">
            Onboard New Restaurant Venue
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="block text-xs font-medium text-slate-700">Restaurant Name</label>
              <input
                type="text"
                required
                value={vName}
                onChange={(e) => setVName(e.target.value)}
                placeholder="Oakwood Grill"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Location</label>
              <input
                type="text"
                required
                value={vLocation}
                onChange={(e) => setVLocation(e.target.value)}
                placeholder="Jubilee Hills, Hyderabad"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Contact Email</label>
              <input
                type="email"
                required
                value={vEmail}
                onChange={(e) => setVEmail(e.target.value)}
                placeholder="ops@oakwoodgrill.com"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Retention (Days)</label>
              <input
                type="number"
                min={7}
                max={365}
                value={vRetention}
                onChange={(e) => setVRetention(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddVenue(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800"
            >
              Create Venue
            </button>
          </div>
        </form>
      )}

      {/* Restaurant Management Table */}
      <div className="mt-6 rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Restaurant Venues &amp; QR Access
            </h2>
            <p className="text-xs text-slate-500">
              Manage venue status, retention policy, and guest QR feedback endpoints
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
              <tr>
                <th className="px-6 py-3">Restaurant</th>
                <th className="px-6 py-3">Location</th>
                <th className="px-6 py-3 text-right">Surveys</th>
                <th className="px-6 py-3 text-right">Avg Rating</th>
                <th className="px-6 py-3 text-right">Retention</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {venues.map((v) => (
                <tr key={v.id} className="hover:bg-slate-50/70">
                  <td className="px-6 py-3.5 font-medium text-slate-900">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-slate-400 shrink-0" />
                      <span>{v.restaurant_name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-3.5 text-slate-600">{v.location}</td>
                  <td className="px-6 py-3.5 text-right font-mono tabular-nums">
                    {v.total_surveys ?? 0}
                  </td>
                  <td className="px-6 py-3.5 text-right font-mono tabular-nums">
                    {v.avg_rating ? Number(v.avg_rating).toFixed(2) : '—'}
                  </td>
                  <td className="px-6 py-3.5 text-right font-mono tabular-nums text-xs text-slate-600">
                    {v.retention_days ?? 90}d
                  </td>
                  <td className="px-6 py-3.5">
                    <button
                      type="button"
                      onClick={() => handleToggleVenueStatus(v)}
                      className={`text-xs font-semibold capitalize ${
                        v.status === 'active' ? 'text-emerald-700' : 'text-slate-500'
                      }`}
                    >
                      {v.status}
                    </button>
                  </td>
                  <td className="px-6 py-3.5 text-right">
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setQrVenue(v)}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        <QrCode className="h-3.5 w-3.5" />
                        <span>QR Code</span>
                      </button>
                      {user?.role === 'super_admin' && (
                        <button
                          type="button"
                          aria-label={`Delete ${v.restaurant_name}`}
                          onClick={() => handleDeleteVenue(v.id)}
                          className="rounded-md p-1.5 text-slate-400 hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Security Audit Logs (Super Admin only) */}
      {user?.role === 'super_admin' && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Security Audit Logs
            </h2>
            <p className="text-xs text-slate-500">
              Recent authentication, RBAC, configuration, and export events
            </p>
          </div>
          <div className="overflow-x-auto max-h-80">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                <tr>
                  <th className="px-6 py-2.5">Timestamp (UTC)</th>
                  <th className="px-6 py-2.5">Actor</th>
                  <th className="px-6 py-2.5">Action</th>
                  <th className="px-6 py-2.5">Object</th>
                  <th className="px-6 py-2.5">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="px-6 py-2.5 font-mono text-slate-500 tabular-nums">
                      {log.timestamp}
                    </td>
                    <td className="px-6 py-2.5 text-slate-800">{log.actor_email || 'System'}</td>
                    <td className="px-6 py-2.5 font-mono text-slate-900">{log.action}</td>
                    <td className="px-6 py-2.5 text-slate-600">
                      {log.object_type} {log.object_id ? `#${log.object_id}` : ''}
                    </td>
                    <td
                      className={`px-6 py-2.5 font-semibold capitalize ${
                        log.result === 'success'
                          ? 'text-emerald-700'
                          : log.result === 'denied'
                            ? 'text-amber-700'
                            : 'text-red-700'
                      }`}
                    >
                      {log.result}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      {qrVenue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 text-center relative">
            <button
              aria-label="Close QR dialog"
              onClick={() => setQrVenue(null)}
              className="absolute right-4 top-4 rounded-md p-1 text-slate-500 hover:text-slate-900"
            >
              <X className="h-4 w-4" />
            </button>
            <h3 className="font-display text-lg font-bold text-slate-900">
              {qrVenue.restaurant_name}
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Scan to launch direct guest feedback
            </p>
            <div className="my-5 inline-flex rounded-xl border border-slate-200 bg-white p-4">
              <QRCodeSVG value={qrUrlForVenue(qrVenue.id)} size={180} />
            </div>
            <p className="break-all font-mono text-[11px] text-slate-500">
              {qrUrlForVenue(qrVenue.id)}
            </p>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

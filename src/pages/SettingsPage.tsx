import React, { useEffect, useState, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Trash2, UserPlus, Save, ShieldAlert } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import { useAuth } from '../contexts/AuthContext';
import { api, extractErrorMessage } from '../services/api';
import type { User, UserRole, Venue } from '../types';

export default function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState<number | null>(null);

  // Venue profile fields
  const [restaurantName, setRestaurantName] = useState('');
  const [location, setLocation] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [welcomeMessage, setWelcomeMessage] = useState('');
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [qrEnabled, setQrEnabled] = useState(true);
  const [retentionDays, setRetentionDays] = useState(90);

  // Staff list & new staff form
  const [staff, setStaff] = useState<User[]>([]);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('restaurant_manager');

  // Password change
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canManageVenue = user?.role === 'super_admin' || user?.role === 'restaurant_admin';

  const loadData = useCallback(async () => {
    try {
      const venueRes = await api.get('/venues');
      const vList = (venueRes.data.venues || []) as Venue[];
      setVenues(vList);

      const targetId = selectedVenueId || user?.venue_id || vList[0]?.id || null;
      setSelectedVenueId(targetId);

      const activeVenue = vList.find((v) => v.id === targetId);
      if (activeVenue) {
        setRestaurantName(activeVenue.restaurant_name);
        setLocation(activeVenue.location);
        setContactEmail(activeVenue.contact_email || '');
        setWelcomeMessage(activeVenue.welcome_message);
        setCameraEnabled(Boolean(activeVenue.camera_feedback_enabled));
        setQrEnabled(Boolean(activeVenue.qr_feedback_enabled));
        setRetentionDays(activeVenue.retention_days || 90);
      }

      if (canManageVenue) {
        const usersRes = await api.get('/users');
        setStaff(usersRes.data.users || []);
      }
    } catch (err) {
      setError(extractErrorMessage(err, 'Unable to load settings.'));
    }
  }, [selectedVenueId, user, canManageVenue]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveVenue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVenueId || !canManageVenue) return;
    setMessage(null);
    setError(null);
    try {
      await api.put(`/venues/${selectedVenueId}`, {
        restaurant_name: restaurantName,
        location,
        contact_email: contactEmail,
        welcome_message: welcomeMessage,
        camera_feedback_enabled: cameraEnabled,
        qr_feedback_enabled: qrEnabled,
        retention_days: retentionDays,
      });
      await refreshUser();
      await loadData();
      setMessage('Restaurant profile, feedback options, and retention period saved.');
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to update venue settings.'));
    }
  };

  const handleRunRetentionPurge = async () => {
    setMessage(null);
    setError(null);
    try {
      const res = await api.post('/admin/retention/purge', {
        venue_id: selectedVenueId,
      });
      setMessage(
        `Retention purge completed: removed ${res.data.deleted_survey_responses} surveys and ${res.data.deleted_feedback_events} cue events older than ${retentionDays} days.`
      );
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to run retention purge.'));
    }
  };

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setError(null);
    try {
      await api.post('/users', {
        full_name: newName,
        email: newEmail,
        password: newPassword,
        role: user?.role === 'super_admin' ? newRole : 'restaurant_manager',
        venue_id: selectedVenueId,
      });
      setNewName('');
      setNewEmail('');
      setNewPassword('');
      await loadData();
      setMessage('Staff account created successfully.');
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to create staff account.'));
    }
  };

  const handleDeleteUser = async (id: number) => {
    setMessage(null);
    setError(null);
    try {
      await api.delete(`/users/${id}`);
      await loadData();
      setMessage('User account removed.');
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not remove user.'));
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setError(null);
    try {
      await api.put('/auth/change-password', {
        current_password: currentPassword,
        new_password: nextPassword,
      });
      setCurrentPassword('');
      setNextPassword('');
      setMessage('Your account password has been updated.');
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to change password.'));
    }
  };

  const guestQrUrl = selectedVenueId
    ? `${window.location.origin}/feedback/${selectedVenueId}?channel=qr`
    : `${window.location.origin}/feedback`;

  return (
    <DashboardLayout
      breadcrumb="Configuration / Settings & Privacy"
      title="Restaurant Settings, Users & Retention"
    >
      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {message && (
        <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Restaurant Profile & Privacy Settings */}
        <div className="lg:col-span-7 space-y-6">
          {venues.length > 0 && (
            <form
              onSubmit={handleSaveVenue}
              className="rounded-xl border border-slate-200 bg-white p-6 space-y-4"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Restaurant Profile &amp; Feedback Options
                </h2>
                {user?.role === 'super_admin' && venues.length > 1 && (
                  <select
                    value={selectedVenueId ?? ''}
                    onChange={(e) => setSelectedVenueId(Number(e.target.value))}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium"
                  >
                    {venues.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.restaurant_name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Restaurant Name</label>
                  <input
                    type="text"
                    disabled={!canManageVenue}
                    value={restaurantName}
                    onChange={(e) => setRestaurantName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Location</label>
                  <input
                    type="text"
                    disabled={!canManageVenue}
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">Contact Email</label>
                <input
                  type="email"
                  disabled={!canManageVenue}
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Guest Welcome Message
                </label>
                <textarea
                  rows={2}
                  disabled={!canManageVenue}
                  value={welcomeMessage}
                  onChange={(e) => setWelcomeMessage(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2 pt-2">
                <label className="flex items-center gap-2.5 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    disabled={!canManageVenue}
                    checked={cameraEnabled}
                    onChange={(e) => setCameraEnabled(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  <span>Enable Optional Camera Cues</span>
                </label>
                <label className="flex items-center gap-2.5 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    disabled={!canManageVenue}
                    checked={qrEnabled}
                    onChange={(e) => setQrEnabled(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  <span>Enable QR Feedback Channel</span>
                </label>
              </div>

              <div className="border-t border-slate-200 pt-4">
                <label className="block text-xs font-medium text-slate-700">
                  Data Retention Window (7–365 days)
                </label>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <input
                    type="number"
                    min={7}
                    max={365}
                    disabled={!canManageVenue}
                    value={retentionDays}
                    onChange={(e) => setRetentionDays(Number(e.target.value))}
                    className="w-28 rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums disabled:bg-slate-50"
                  />
                  {canManageVenue && (
                    <button
                      type="button"
                      onClick={handleRunRetentionPurge}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50"
                    >
                      <ShieldAlert className="h-3.5 w-3.5" />
                      <span>Run Retention Purge Now</span>
                    </button>
                  )}
                </div>
              </div>

              {canManageVenue && (
                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
                  >
                    <Save className="h-4 w-4" />
                    <span>Save Venue Settings</span>
                  </button>
                </div>
              )}
            </form>
          )}

          {/* Staff Management */}
          {canManageVenue && (
            <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Staff &amp; Manager Accounts
                </h2>
                <p className="text-xs text-slate-500">
                  Create restaurant manager accounts or review staff access
                </p>
              </div>

              <form onSubmit={handleCreateStaff} className="grid gap-3 sm:grid-cols-2 bg-slate-50 border border-slate-200 rounded-lg p-4">
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Full Name"
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                />
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="staff@restaurant.com"
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                />
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Temporary Password (8+ chars)"
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                />
                <div className="flex items-center gap-2">
                  {user?.role === 'super_admin' && (
                    <select
                      value={newRole}
                      onChange={(e) => setNewRole(e.target.value as UserRole)}
                      className="flex-1 rounded-md border border-slate-300 bg-white px-2.5 py-2 text-xs"
                    >
                      <option value="restaurant_manager">Manager</option>
                      <option value="restaurant_admin">Venue Admin</option>
                    </select>
                  )}
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center gap-1.5 rounded-md bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    <span>Add Staff</span>
                  </button>
                </div>
              </form>

              <div className="divide-y divide-slate-200 border-t border-slate-200">
                {staff.map((member) => (
                  <div key={member.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900 truncate">{member.full_name}</p>
                      <p className="text-xs text-slate-500 truncate">
                        {member.email} · {member.role.replace('_', ' ')}
                        {member.restaurant_name ? ` · ${member.restaurant_name}` : ''}
                      </p>
                    </div>
                    {member.id !== user?.id && (
                      <button
                        type="button"
                        aria-label={`Remove ${member.full_name}`}
                        onClick={() => handleDeleteUser(member.id)}
                        className="rounded-md p-1.5 text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: QR Code Card + Password Security */}
        <div className="lg:col-span-5 space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Table Tent QR Feedback Link
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Guests scan this code to submit ratings directly without logging in.
            </p>
            <div className="my-5 inline-flex rounded-xl border border-slate-200 bg-white p-4">
              <QRCodeSVG value={guestQrUrl} size={172} />
            </div>
            <p className="break-all font-mono text-[11px] text-slate-500">{guestQrUrl}</p>
          </div>

          <form
            onSubmit={handleChangePassword}
            className="rounded-xl border border-slate-200 bg-white p-6 space-y-4"
          >
            <h2 className="font-display text-base font-semibold text-slate-900">
              Account Security
            </h2>
            <div>
              <label className="block text-xs font-medium text-slate-700">Current Password</label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">
                New Password (min 8 chars)
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={nextPassword}
                onChange={(e) => setNextPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
            >
              Update Password
            </button>
          </form>
        </div>
      </div>
    </DashboardLayout>
  );
}

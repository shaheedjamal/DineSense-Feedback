import { Router, type Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import db from './db.ts';
import {
  type AuthenticatedRequest,
  logAudit,
  requireAuth,
  requireRole,
  resolveAuthorizedVenueId,
  signToken,
  type UserRole,
} from './auth.ts';
import { runConsentVerifiedInference } from './inference.ts';

const router = Router();
const K_ANONYMITY_THRESHOLD = 5;

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { detail: 'Too many authentication attempts. Please try again later.' },
});

const feedbackLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { detail: 'Rate limit exceeded for feedback submissions.' },
});

// ==================== AUTHENTICATION ====================

router.post('/auth/register', authLimiter, (req, res: Response) => {
  const { full_name, email, password, restaurant_name, location } = req.body || {};
  if (!full_name || !email || !password) {
    res.status(400).json({ detail: 'Full name, email, and password are required.' });
    return;
  }
  if (typeof password !== 'string' || password.length < 8) {
    res.status(400).json({ detail: 'Password must be at least 8 characters long.' });
    return;
  }
  const normalizedEmail = String(email).trim().toLowerCase();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
  if (existing) {
    res.status(409).json({ detail: 'An account with this email already exists.' });
    return;
  }

  const passwordHash = bcrypt.hashSync(password, 10);

  let createdVenueId: number | null = null;
  let assignedRole: UserRole = 'restaurant_manager';

  const tx = db.transaction(() => {
    if (restaurant_name && String(restaurant_name).trim().length > 1) {
      const venueResult = db
        .prepare(
          `INSERT INTO venues (restaurant_name, location, contact_email, status) VALUES (?, ?, ?, 'active')`
        )
        .run(String(restaurant_name).trim(), String(location || 'Main Branch').trim(), normalizedEmail);
      createdVenueId = Number(venueResult.lastInsertRowid);
      assignedRole = 'restaurant_admin';
    }

    const userResult = db
      .prepare(
        `INSERT INTO users (full_name, email, password_hash, role, venue_id, status) VALUES (?, ?, ?, ?, ?, 'active')`
      )
      .run(String(full_name).trim(), normalizedEmail, passwordHash, assignedRole, createdVenueId);

    const newUserId = Number(userResult.lastInsertRowid);
    logAudit(newUserId, normalizedEmail, 'REGISTER_ACCOUNT', 'user', String(newUserId), 'success');
    return newUserId;
  });

  const userId = tx();
  const authUser = {
    id: userId,
    full_name: String(full_name).trim(),
    email: normalizedEmail,
    role: assignedRole,
    venue_id: createdVenueId,
  };
  const access_token = signToken(authUser);
  res.status(201).json({ access_token, token_type: 'bearer', user: authUser });
});

router.post('/auth/login', authLimiter, (req, res: Response) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    res.status(400).json({ detail: 'Email and password are required.' });
    return;
  }
  const normalizedEmail = String(email).trim().toLowerCase();
  const userRow = db
    .prepare('SELECT id, full_name, email, password_hash, role, venue_id, status FROM users WHERE email = ?')
    .get(normalizedEmail) as
    | {
        id: number;
        full_name: string;
        email: string;
        password_hash: string;
        role: UserRole;
        venue_id: number | null;
        status: string;
      }
    | undefined;

  if (!userRow || !bcrypt.compareSync(String(password), userRow.password_hash)) {
    logAudit(userRow?.id ?? null, normalizedEmail, 'LOGIN_FAILED', 'auth', null, 'denied');
    res.status(401).json({ detail: 'Invalid email or password.' });
    return;
  }

  if (userRow.status !== 'active') {
    logAudit(userRow.id, normalizedEmail, 'LOGIN_INACTIVE', 'auth', String(userRow.id), 'denied');
    res.status(403).json({ detail: 'This account has been deactivated. Contact your administrator.' });
    return;
  }

  const authUser = {
    id: userRow.id,
    full_name: userRow.full_name,
    email: userRow.email,
    role: userRow.role,
    venue_id: userRow.venue_id,
  };
  const access_token = signToken(authUser);
  logAudit(userRow.id, userRow.email, 'LOGIN_SUCCESS', 'auth', String(userRow.id), 'success');
  res.json({ access_token, token_type: 'bearer', user: authUser });
});

router.post('/auth/logout', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  if (req.user) {
    logAudit(req.user.id, req.user.email, 'LOGOUT', 'auth', String(req.user.id), 'success');
  }
  res.json({ message: 'Logged out successfully.' });
});

router.get('/auth/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const venue = req.user?.venue_id
    ? db.prepare('SELECT id, restaurant_name, location, status FROM venues WHERE id = ?').get(req.user.venue_id)
    : null;
  res.json({ user: req.user, venue });
});

router.post('/auth/forgot-password', authLimiter, (req, res: Response) => {
  const { email } = req.body || {};
  if (!email) {
    res.status(400).json({ detail: 'Email is required.' });
    return;
  }
  const normalizedEmail = String(email).trim().toLowerCase();
  const userRow = db.prepare('SELECT id, email FROM users WHERE email = ?').get(normalizedEmail) as
    | { id: number; email: string }
    | undefined;

  if (userRow) {
    const rawToken = crypto.randomBytes(16).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    db.prepare(`INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)`).run(
      userRow.id,
      tokenHash,
      expiresAt
    );
    logAudit(userRow.id, userRow.email, 'PASSWORD_RESET_REQUESTED', 'auth', String(userRow.id), 'success');

    // In local dev/demo mode without SMTP, return token hint only in non-production environments
    res.json({
      message: 'If an account matches that email, a reset token has been generated.',
      ...(process.env.NODE_ENV !== 'production' ? { dev_reset_token: rawToken } : {}),
    });
    return;
  }

  res.json({ message: 'If an account matches that email, a reset token has been generated.' });
});

router.post('/auth/reset-password', authLimiter, (req, res: Response) => {
  const { token, new_password } = req.body || {};
  if (!token || !new_password || String(new_password).length < 8) {
    res.status(400).json({ detail: 'A valid reset token and a password of at least 8 characters are required.' });
    return;
  }

  const tokenHash = crypto.createHash('sha256').update(String(token).trim()).digest('hex');
  const tokenRow = db
    .prepare(
      `SELECT id, user_id, expires_at, used FROM password_reset_tokens WHERE token_hash = ? ORDER BY id DESC LIMIT 1`
    )
    .get(tokenHash) as { id: number; user_id: number; expires_at: string; used: number } | undefined;

  if (!tokenRow || tokenRow.used === 1 || new Date(tokenRow.expires_at).getTime() < Date.now()) {
    res.status(400).json({ detail: 'Reset token is invalid or has expired.' });
    return;
  }

  const newHash = bcrypt.hashSync(String(new_password), 10);
  db.transaction(() => {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, tokenRow.user_id);
    db.prepare('UPDATE password_reset_tokens SET used = 1 WHERE id = ?').run(tokenRow.id);
    logAudit(tokenRow.user_id, null, 'PASSWORD_RESET_COMPLETED', 'auth', String(tokenRow.user_id), 'success');
  })();

  res.json({ message: 'Password updated successfully. You may now log in.' });
});

router.put('/auth/change-password', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { current_password, new_password } = req.body || {};
  if (!req.user || !current_password || !new_password || String(new_password).length < 8) {
    res.status(400).json({ detail: 'Current password and a new password (min 8 chars) are required.' });
    return;
  }
  const userRow = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id) as
    | { password_hash: string }
    | undefined;
  if (!userRow || !bcrypt.compareSync(String(current_password), userRow.password_hash)) {
    res.status(400).json({ detail: 'Current password is incorrect.' });
    return;
  }
  const newHash = bcrypt.hashSync(String(new_password), 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, req.user.id);
  logAudit(req.user.id, req.user.email, 'CHANGE_PASSWORD', 'user', String(req.user.id), 'success');
  res.json({ message: 'Password updated.' });
});

// ==================== PUBLIC VENUE DIRECTORY FOR GUESTS ====================

router.get('/venues/public', (_req, res: Response) => {
  const rows = db
    .prepare(
      `SELECT id, restaurant_name, location, welcome_message, camera_feedback_enabled, qr_feedback_enabled
       FROM venues WHERE status = 'active' ORDER BY restaurant_name ASC`
    )
    .all();
  res.json({ venues: rows });
});

router.get('/venues/public/:id', (req, res: Response) => {
  const venue = db
    .prepare(
      `SELECT id, restaurant_name, location, welcome_message, camera_feedback_enabled, qr_feedback_enabled
       FROM venues WHERE id = ? AND status = 'active'`
    )
    .get(Number(req.params.id));
  if (!venue) {
    res.status(404).json({ detail: 'Restaurant venue not found or inactive.' });
    return;
  }
  res.json({ venue });
});

// ==================== RESTAURANT MANAGEMENT ====================

router.get('/venues', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return;
  if (req.user.role === 'super_admin') {
    const venues = db
      .prepare(
        `SELECT v.*,
          (SELECT COUNT(*) FROM survey_responses sr WHERE sr.venue_id = v.id) as total_surveys,
          (SELECT ROUND(AVG(sr.overall_rating), 2) FROM survey_responses sr WHERE sr.venue_id = v.id) as avg_rating
         FROM venues v ORDER BY v.created_at DESC`
      )
      .all();
    res.json({ venues });
    return;
  }

  if (!req.user.venue_id) {
    res.json({ venues: [] });
    return;
  }

  const venue = db
    .prepare(
      `SELECT v.*,
        (SELECT COUNT(*) FROM survey_responses sr WHERE sr.venue_id = v.id) as total_surveys,
        (SELECT ROUND(AVG(sr.overall_rating), 2) FROM survey_responses sr WHERE sr.venue_id = v.id) as avg_rating
       FROM venues v WHERE v.id = ?`
    )
    .get(req.user.venue_id);
  res.json({ venues: venue ? [venue] : [] });
});

router.post('/venues', requireAuth, requireRole('super_admin'), (req: AuthenticatedRequest, res: Response) => {
  const {
    restaurant_name,
    location,
    contact_email,
    welcome_message,
    camera_feedback_enabled = true,
    qr_feedback_enabled = true,
    retention_days = 90,
  } = req.body || {};

  if (!restaurant_name || !location || !contact_email) {
    res.status(400).json({ detail: 'Restaurant name, location, and contact email are required.' });
    return;
  }

  const result = db
    .prepare(
      `INSERT INTO venues (restaurant_name, location, contact_email, welcome_message, camera_feedback_enabled, qr_feedback_enabled, retention_days)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      String(restaurant_name).trim(),
      String(location).trim(),
      String(contact_email).trim().toLowerCase(),
      String(
        welcome_message ||
          'We value your dining experience. Share your direct ratings below; optional camera cues require explicit consent.'
      ).trim(),
      camera_feedback_enabled ? 1 : 0,
      qr_feedback_enabled ? 1 : 0,
      Math.max(7, Math.min(365, Number(retention_days) || 90))
    );

  const created = db.prepare('SELECT * FROM venues WHERE id = ?').get(result.lastInsertRowid);
  logAudit(req.user!.id, req.user!.email, 'CREATE_VENUE', 'venue', String(result.lastInsertRowid), 'success');
  res.status(201).json({ venue: created });
});

router.get('/venues/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const venueId = Number(req.params.id);
  if (req.user!.role !== 'super_admin' && req.user!.venue_id !== venueId) {
    res.status(403).json({ detail: 'Tenant isolation: access denied for this restaurant.' });
    return;
  }
  const venue = db.prepare('SELECT * FROM venues WHERE id = ?').get(venueId);
  if (!venue) {
    res.status(404).json({ detail: 'Venue not found.' });
    return;
  }
  res.json({ venue });
});

router.put(
  '/venues/:id',
  requireAuth,
  requireRole('super_admin', 'restaurant_admin'),
  (req: AuthenticatedRequest, res: Response) => {
    const venueId = Number(req.params.id);
    if (req.user!.role !== 'super_admin' && req.user!.venue_id !== venueId) {
      res.status(403).json({ detail: 'Tenant isolation: you can only update your assigned venue.' });
      return;
    }

    const existing = db.prepare('SELECT * FROM venues WHERE id = ?').get(venueId) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ detail: 'Venue not found.' });
      return;
    }

    const {
      restaurant_name,
      location,
      contact_email,
      welcome_message,
      camera_feedback_enabled,
      qr_feedback_enabled,
      retention_days,
      status,
    } = req.body || {};

    db.prepare(
      `UPDATE venues SET
        restaurant_name = ?,
        location = ?,
        contact_email = ?,
        welcome_message = ?,
        camera_feedback_enabled = ?,
        qr_feedback_enabled = ?,
        retention_days = ?,
        status = ?
       WHERE id = ?`
    ).run(
      restaurant_name !== undefined ? String(restaurant_name).trim() : existing.restaurant_name,
      location !== undefined ? String(location).trim() : existing.location,
      contact_email !== undefined ? String(contact_email).trim().toLowerCase() : existing.contact_email,
      welcome_message !== undefined ? String(welcome_message).trim() : existing.welcome_message,
      camera_feedback_enabled !== undefined ? (camera_feedback_enabled ? 1 : 0) : existing.camera_feedback_enabled,
      qr_feedback_enabled !== undefined ? (qr_feedback_enabled ? 1 : 0) : existing.qr_feedback_enabled,
      retention_days !== undefined ? Math.max(7, Math.min(365, Number(retention_days))) : existing.retention_days,
      status === 'inactive' ? 'inactive' : status === 'active' ? 'active' : existing.status,
      venueId
    );

    const updated = db.prepare('SELECT * FROM venues WHERE id = ?').get(venueId);
    logAudit(req.user!.id, req.user!.email, 'UPDATE_VENUE', 'venue', String(venueId), 'success');
    res.json({ venue: updated });
  }
);

router.delete('/venues/:id', requireAuth, requireRole('super_admin'), (req: AuthenticatedRequest, res: Response) => {
  const venueId = Number(req.params.id);
  const info = db.prepare('DELETE FROM venues WHERE id = ?').run(venueId);
  if (info.changes === 0) {
    res.status(404).json({ detail: 'Venue not found.' });
    return;
  }
  logAudit(req.user!.id, req.user!.email, 'DELETE_VENUE', 'venue', String(venueId), 'success');
  res.json({ message: 'Venue deleted.' });
});

// ==================== USER MANAGEMENT ====================

router.get(
  '/users',
  requireAuth,
  requireRole('super_admin', 'restaurant_admin'),
  (req: AuthenticatedRequest, res: Response) => {
    if (req.user!.role === 'super_admin') {
      const users = db
        .prepare(
          `SELECT u.id, u.full_name, u.email, u.role, u.venue_id, u.status, u.created_at, v.restaurant_name
           FROM users u LEFT JOIN venues v ON u.venue_id = v.id
           ORDER BY u.created_at DESC`
        )
        .all();
      res.json({ users });
      return;
    }

    const users = db
      .prepare(
        `SELECT u.id, u.full_name, u.email, u.role, u.venue_id, u.status, u.created_at, v.restaurant_name
         FROM users u LEFT JOIN venues v ON u.venue_id = v.id
         WHERE u.venue_id = ? AND u.role IN ('restaurant_admin', 'restaurant_manager')
         ORDER BY u.created_at DESC`
      )
      .all(req.user!.venue_id);
    res.json({ users });
  }
);

router.post(
  '/users',
  requireAuth,
  requireRole('super_admin', 'restaurant_admin'),
  (req: AuthenticatedRequest, res: Response) => {
    const { full_name, email, password, role, venue_id } = req.body || {};
    if (!full_name || !email || !password || !role) {
      res.status(400).json({ detail: 'full_name, email, password, and role are required.' });
      return;
    }

    const targetRole = role as UserRole;
    if (!['super_admin', 'restaurant_admin', 'restaurant_manager'].includes(targetRole)) {
      res.status(400).json({ detail: 'Invalid role specified.' });
      return;
    }

    // Prevent role escalation by restaurant_admin
    if (req.user!.role === 'restaurant_admin') {
      if (targetRole !== 'restaurant_manager') {
        logAudit(req.user!.id, req.user!.email, 'ROLE_ESCALATION_ATTEMPT', 'user', null, 'denied');
        res.status(403).json({ detail: 'Restaurant administrators may only create manager accounts.' });
        return;
      }
    }

    const assignedVenueId =
      req.user!.role === 'super_admin' ? (targetRole === 'super_admin' ? null : Number(venue_id) || null) : req.user!.venue_id;

    if (targetRole !== 'super_admin' && !assignedVenueId) {
      res.status(400).json({ detail: 'A valid venue_id is required for restaurant roles.' });
      return;
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    if (db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail)) {
      res.status(409).json({ detail: 'A user with that email already exists.' });
      return;
    }

    if (String(password).length < 8) {
      res.status(400).json({ detail: 'Password must be at least 8 characters.' });
      return;
    }

    const hash = bcrypt.hashSync(String(password), 10);
    const result = db
      .prepare(
        `INSERT INTO users (full_name, email, password_hash, role, venue_id, status) VALUES (?, ?, ?, ?, ?, 'active')`
      )
      .run(String(full_name).trim(), normalizedEmail, hash, targetRole, assignedVenueId);

    const created = db
      .prepare('SELECT id, full_name, email, role, venue_id, status, created_at FROM users WHERE id = ?')
      .get(result.lastInsertRowid);
    logAudit(req.user!.id, req.user!.email, 'CREATE_USER', 'user', String(result.lastInsertRowid), 'success');
    res.status(201).json({ user: created });
  }
);

router.put(
  '/users/:id',
  requireAuth,
  requireRole('super_admin', 'restaurant_admin'),
  (req: AuthenticatedRequest, res: Response) => {
    const targetId = Number(req.params.id);
    const targetUser = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId) as
      | { id: number; full_name: string; role: UserRole; venue_id: number | null; status: string }
      | undefined;

    if (!targetUser) {
      res.status(404).json({ detail: 'User not found.' });
      return;
    }

    if (req.user!.role === 'restaurant_admin') {
      if (targetUser.venue_id !== req.user!.venue_id || targetUser.role === 'super_admin') {
        res.status(403).json({ detail: 'Access denied for updating this user.' });
        return;
      }
    }

    const { full_name, status, role, venue_id } = req.body || {};
    const nextRole: UserRole =
      req.user!.role === 'super_admin' && role && ['super_admin', 'restaurant_admin', 'restaurant_manager'].includes(role)
        ? role
        : targetUser.role;

    const nextVenue =
      req.user!.role === 'super_admin' && venue_id !== undefined
        ? nextRole === 'super_admin'
          ? null
          : Number(venue_id)
        : targetUser.venue_id;

    db.prepare(`UPDATE users SET full_name = ?, status = ?, role = ?, venue_id = ? WHERE id = ?`).run(
      full_name !== undefined ? String(full_name).trim() : targetUser.full_name,
      status === 'inactive' ? 'inactive' : status === 'active' ? 'active' : targetUser.status,
      nextRole,
      nextVenue,
      targetId
    );

    const updated = db
      .prepare('SELECT id, full_name, email, role, venue_id, status, created_at FROM users WHERE id = ?')
      .get(targetId);
    logAudit(req.user!.id, req.user!.email, 'UPDATE_USER', 'user', String(targetId), 'success');
    res.json({ user: updated });
  }
);

router.delete(
  '/users/:id',
  requireAuth,
  requireRole('super_admin', 'restaurant_admin'),
  (req: AuthenticatedRequest, res: Response) => {
    const targetId = Number(req.params.id);
    if (targetId === req.user!.id) {
      res.status(400).json({ detail: 'You cannot delete your own active account.' });
      return;
    }
    const target = db.prepare('SELECT id, role, venue_id FROM users WHERE id = ?').get(targetId) as
      | { id: number; role: UserRole; venue_id: number | null }
      | undefined;

    if (!target) {
      res.status(404).json({ detail: 'User not found.' });
      return;
    }

    if (req.user!.role === 'restaurant_admin' && (target.venue_id !== req.user!.venue_id || target.role !== 'restaurant_manager')) {
      res.status(403).json({ detail: 'Restaurant admins can only delete managers within their venue.' });
      return;
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(targetId);
    logAudit(req.user!.id, req.user!.email, 'DELETE_USER', 'user', String(targetId), 'success');
    res.json({ message: 'User removed.' });
  }
);

// ==================== CONSENT & AI INFERENCE ====================

router.post('/consents', feedbackLimiter, (req, res: Response) => {
  const { venue_id, notice_version = 'v2.1-2026', consent_choice } = req.body || {};
  if (!venue_id || !['accepted', 'declined'].includes(consent_choice)) {
    res.status(400).json({ detail: 'venue_id and valid consent_choice ("accepted" | "declined") are required.' });
    return;
  }

  const venue = db.prepare('SELECT id, camera_feedback_enabled, status FROM venues WHERE id = ?').get(Number(venue_id)) as
    | { id: number; camera_feedback_enabled: number; status: string }
    | undefined;

  if (!venue || venue.status !== 'active') {
    res.status(404).json({ detail: 'Active restaurant venue not found.' });
    return;
  }

  const consentId = `consent-${crypto.randomUUID()}`;
  db.prepare(
    `INSERT INTO consent_events (id, venue_id, notice_version, consent_choice) VALUES (?, ?, ?, ?)`
  ).run(consentId, Number(venue_id), String(notice_version), consent_choice);

  res.status(201).json({
    consent_id: consentId,
    venue_id: Number(venue_id),
    notice_version,
    consent_choice,
    camera_enabled_at_venue: Boolean(venue.camera_feedback_enabled),
  });
});

router.get('/consents/status', (req, res: Response) => {
  const consentId = String(req.query.consent_id || '').trim();
  if (!consentId) {
    res.status(400).json({ detail: 'consent_id query parameter is required.' });
    return;
  }
  const row = db
    .prepare('SELECT id, venue_id, notice_version, consent_choice, used_for_inference, timestamp FROM consent_events WHERE id = ?')
    .get(consentId);
  if (!row) {
    res.status(404).json({ detail: 'Consent record not found.' });
    return;
  }
  res.json({ consent: row });
});

router.post('/inference-events', feedbackLimiter, (req, res: Response) => {
  const result = runConsentVerifiedInference(req.body || {});
  res.status(result.httpStatus).json(result.body);
});

// ==================== CUSTOMER SURVEY FEEDBACK ====================

router.post('/survey-responses', feedbackLimiter, (req, res: Response) => {
  const {
    venue_id,
    submission_channel = 'web',
    used_camera_cue = false,
    food_rating,
    service_rating,
    cleanliness_rating,
    waiting_time_rating,
    comment,
  } = req.body || {};

  const ratings = [food_rating, service_rating, cleanliness_rating, waiting_time_rating].map(Number);
  if (!venue_id || ratings.some((r) => !Number.isInteger(r) || r < 1 || r > 5)) {
    res.status(400).json({ detail: 'venue_id and integer ratings (1–5) for food, service, cleanliness, and waiting time are required.' });
    return;
  }

  const venue = db.prepare('SELECT id, status FROM venues WHERE id = ?').get(Number(venue_id)) as
    | { id: number; status: string }
    | undefined;
  if (!venue || venue.status !== 'active') {
    res.status(404).json({ detail: 'Active restaurant venue not found.' });
    return;
  }

  const channel = ['web', 'qr', 'kiosk'].includes(submission_channel) ? submission_channel : 'web';
  const overall = Number(((ratings[0] + ratings[1] + ratings[2] + ratings[3]) / 4).toFixed(2));
  const category = overall >= 4 ? 'positive' : overall >= 3 ? 'neutral' : 'negative';
  const sanitizedComment = comment ? String(comment).trim().slice(0, 1200) : null;

  const result = db
    .prepare(
      `INSERT INTO survey_responses (
        venue_id, submission_channel, used_camera_cue, food_rating, service_rating,
        cleanliness_rating, waiting_time_rating, overall_rating, feedback_category, comment, is_demo
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
    )
    .run(
      Number(venue_id),
      channel,
      used_camera_cue ? 1 : 0,
      ratings[0],
      ratings[1],
      ratings[2],
      ratings[3],
      overall,
      category,
      sanitizedComment
    );

  res.status(201).json({
    id: Number(result.lastInsertRowid),
    overall_rating: overall,
    feedback_category: category,
    message: 'Thank you for your direct feedback.',
  });
});

router.get('/survey-responses', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const requestedVenue = req.query.venue_id ? Number(req.query.venue_id) : null;
  const venueId = resolveAuthorizedVenueId(req.user!, requestedVenue);
  const category = req.query.category ? String(req.query.category) : null;
  const dataScope = String(req.query.data_scope || 'all'); // 'all' | 'live' | 'demo'

  const conditions: string[] = [];
  const params: Array<string | number> = [];

  if (venueId !== null) {
    conditions.push('sr.venue_id = ?');
    params.push(venueId);
  }
  if (category && ['positive', 'neutral', 'negative'].includes(category)) {
    conditions.push('sr.feedback_category = ?');
    params.push(category);
  }
  if (dataScope === 'live') {
    conditions.push('sr.is_demo = 0');
  } else if (dataScope === 'demo') {
    conditions.push('sr.is_demo = 1');
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = db
    .prepare(
      `SELECT sr.id, sr.venue_id, v.restaurant_name, sr.submission_channel, sr.used_camera_cue,
              sr.food_rating, sr.service_rating, sr.cleanliness_rating, sr.waiting_time_rating,
              sr.overall_rating, sr.feedback_category, sr.comment, sr.is_demo, sr.created_at
       FROM survey_responses sr
       JOIN venues v ON sr.venue_id = v.id
       ${whereClause}
       ORDER BY sr.created_at DESC, sr.id DESC
       LIMIT 200`
    )
    .all(...params);

  res.json({ responses: rows });
});

router.get('/survey-responses/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const row = db
    .prepare(
      `SELECT sr.*, v.restaurant_name FROM survey_responses sr JOIN venues v ON sr.venue_id = v.id WHERE sr.id = ?`
    )
    .get(Number(req.params.id)) as (Record<string, unknown> & { venue_id: number }) | undefined;

  if (!row) {
    res.status(404).json({ detail: 'Survey response not found.' });
    return;
  }
  if (req.user!.role !== 'super_admin' && req.user!.venue_id !== row.venue_id) {
    res.status(403).json({ detail: 'Tenant isolation: access denied.' });
    return;
  }
  res.json({ response: row });
});

// ==================== DASHBOARD ANALYTICS ====================

function buildSurveyWhere(
  venueId: number | null,
  days: number,
  dataScope: string,
  alias = ''
): { sql: string; params: Array<string | number> } {
  const prefix = alias ? `${alias}.` : '';
  const conds: string[] = [];
  const params: Array<string | number> = [];

  if (venueId !== null) {
    conds.push(`${prefix}venue_id = ?`);
    params.push(venueId);
  }
  if (days > 0) {
    conds.push(`${prefix}created_at >= datetime('now', ?)`);
    params.push(`-${days} days`);
  }
  if (dataScope === 'live') {
    conds.push(`${prefix}is_demo = 0`);
  } else if (dataScope === 'demo') {
    conds.push(`${prefix}is_demo = 1`);
  }

  return {
    sql: conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '',
    params,
  };
}

router.get('/dashboard/summary', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const requestedVenue = req.query.venue_id ? Number(req.query.venue_id) : null;
  const venueId = resolveAuthorizedVenueId(req.user!, requestedVenue);
  const days = Number(req.query.days || 30);
  const dataScope = String(req.query.data_scope || 'all');

  const { sql, params } = buildSurveyWhere(venueId, days, dataScope);

  const stats = db
    .prepare(
      `SELECT
        COUNT(*) as total_feedback,
        ROUND(AVG(overall_rating), 2) as avg_overall_rating,
        ROUND(AVG(food_rating), 2) as avg_food_rating,
        ROUND(AVG(service_rating), 2) as avg_service_rating,
        ROUND(AVG(cleanliness_rating), 2) as avg_cleanliness_rating,
        ROUND(AVG(waiting_time_rating), 2) as avg_waiting_time_rating,
        SUM(CASE WHEN feedback_category = 'positive' THEN 1 ELSE 0 END) as positive_count,
        SUM(CASE WHEN feedback_category = 'neutral' THEN 1 ELSE 0 END) as neutral_count,
        SUM(CASE WHEN feedback_category = 'negative' THEN 1 ELSE 0 END) as negative_count,
        SUM(CASE WHEN comment IS NOT NULL AND TRIM(comment) != '' THEN 1 ELSE 0 END) as comment_count,
        SUM(CASE WHEN used_camera_cue = 1 THEN 1 ELSE 0 END) as camera_assisted_count
       FROM survey_responses ${sql}`
    )
    .get(...params) as Record<string, number | null>;

  // Aggregate expression cues with k-anonymity suppression (n < 5)
  const cueWhere = buildSurveyWhere(venueId, days, dataScope);
  const rawCues = db
    .prepare(
      `SELECT expression_cue, COUNT(*) as count FROM feedback_events ${cueWhere.sql} GROUP BY expression_cue`
    )
    .all(...cueWhere.params) as Array<{ expression_cue: string; count: number }>;

  let suppressedCount = 0;
  const expressionCues = rawCues.map((row) => {
    if (row.count < K_ANONYMITY_THRESHOLD) {
      suppressedCount += row.count;
      return {
        expression_cue: row.expression_cue,
        count: null,
        suppressed: true,
        suppression_reason: `Suppressed (n < ${K_ANONYMITY_THRESHOLD}) to protect guest privacy`,
      };
    }
    return {
      expression_cue: row.expression_cue,
      count: row.count,
      suppressed: false,
    };
  });

  const totalCueSamples = rawCues.reduce((acc, r) => acc + r.count, 0);

  // Consent summary
  const consentConds: string[] = [];
  const consentParams: Array<string | number> = [];
  if (venueId !== null) {
    consentConds.push('venue_id = ?');
    consentParams.push(venueId);
  }
  const consentWhere = consentConds.length ? `WHERE ${consentConds.join(' AND ')}` : '';
  const consentStats = db
    .prepare(
      `SELECT
        SUM(CASE WHEN consent_choice = 'accepted' THEN 1 ELSE 0 END) as accepted_count,
        SUM(CASE WHEN consent_choice = 'declined' THEN 1 ELSE 0 END) as declined_count
       FROM consent_events ${consentWhere}`
    )
    .get(...consentParams) as { accepted_count: number | null; declined_count: number | null };

  res.json({
    summary: {
      total_feedback: stats.total_feedback || 0,
      avg_overall_rating: stats.avg_overall_rating || 0,
      avg_food_rating: stats.avg_food_rating || 0,
      avg_service_rating: stats.avg_service_rating || 0,
      avg_cleanliness_rating: stats.avg_cleanliness_rating || 0,
      avg_waiting_time_rating: stats.avg_waiting_time_rating || 0,
      positive_count: stats.positive_count || 0,
      neutral_count: stats.neutral_count || 0,
      negative_count: stats.negative_count || 0,
      comment_response_rate:
        stats.total_feedback && stats.total_feedback > 0
          ? Number((((stats.comment_count || 0) / stats.total_feedback) * 100).toFixed(1))
          : 0,
      camera_participation_rate:
        stats.total_feedback && stats.total_feedback > 0
          ? Number((((stats.camera_assisted_count || 0) / stats.total_feedback) * 100).toFixed(1))
          : 0,
      consent_accepted: consentStats.accepted_count || 0,
      consent_declined: consentStats.declined_count || 0,
    },
    expression_cue_analytics: {
      sample_size: totalCueSamples,
      k_anonymity_threshold: K_ANONYMITY_THRESHOLD,
      suppressed_total: suppressedCount,
      cues: expressionCues,
      disclaimer:
        'Expression cues are uncertain visual patterns from demonstration or optional edge inference. They do not measure guest emotion or satisfaction.',
    },
  });
});

router.get('/dashboard/trends', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const requestedVenue = req.query.venue_id ? Number(req.query.venue_id) : null;
  const venueId = resolveAuthorizedVenueId(req.user!, requestedVenue);
  const granularity = String(req.query.granularity || 'daily'); // 'daily' | 'weekly' | 'monthly'
  const dataScope = String(req.query.data_scope || 'all');

  const days = granularity === 'monthly' ? 365 : granularity === 'weekly' ? 90 : 30;
  const { sql, params } = buildSurveyWhere(venueId, days, dataScope);

  let periodExpr = "strftime('%Y-%m-%d', created_at)";
  if (granularity === 'weekly') {
    periodExpr = "strftime('%Y-W%W', created_at)";
  } else if (granularity === 'monthly') {
    periodExpr = "strftime('%Y-%m', created_at)";
  }

  const rows = db
    .prepare(
      `SELECT
        ${periodExpr} as period,
        COUNT(*) as count,
        ROUND(AVG(overall_rating), 2) as avg_rating,
        ROUND(AVG(food_rating), 2) as food_rating,
        ROUND(AVG(service_rating), 2) as service_rating,
        ROUND(AVG(cleanliness_rating), 2) as cleanliness_rating,
        ROUND(AVG(waiting_time_rating), 2) as waiting_time_rating
       FROM survey_responses ${sql}
       GROUP BY period
       ORDER BY period ASC`
    )
    .all(...params);

  res.json({ granularity, trends: rows });
});

router.get('/dashboard/ratings', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const requestedVenue = req.query.venue_id ? Number(req.query.venue_id) : null;
  const venueId = resolveAuthorizedVenueId(req.user!, requestedVenue);
  const days = Number(req.query.days || 30);
  const dataScope = String(req.query.data_scope || 'all');

  const { sql, params } = buildSurveyWhere(venueId, days, dataScope);

  const metrics = db
    .prepare(
      `SELECT
        ROUND(AVG(food_rating), 2) as food,
        ROUND(AVG(service_rating), 2) as service,
        ROUND(AVG(cleanliness_rating), 2) as cleanliness,
        ROUND(AVG(waiting_time_rating), 2) as waiting_time,
        COUNT(*) as sample_size
       FROM survey_responses ${sql}`
    )
    .get(...params) as Record<string, number | null>;

  const distribution = db
    .prepare(
      `SELECT CAST(ROUND(overall_rating) AS INTEGER) as stars, COUNT(*) as count
       FROM survey_responses ${sql}
       GROUP BY stars ORDER BY stars ASC`
    )
    .all(...params);

  res.json({
    dimensions: [
      { metric: 'Food Quality', score: metrics.food || 0 },
      { metric: 'Staff Service', score: metrics.service || 0 },
      { metric: 'Cleanliness', score: metrics.cleanliness || 0 },
      { metric: 'Waiting Time', score: metrics.waiting_time || 0 },
    ],
    sample_size: metrics.sample_size || 0,
    star_distribution: distribution,
  });
});

router.get('/dashboard/categories', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const requestedVenue = req.query.venue_id ? Number(req.query.venue_id) : null;
  const venueId = resolveAuthorizedVenueId(req.user!, requestedVenue);
  const days = Number(req.query.days || 30);
  const dataScope = String(req.query.data_scope || 'all');

  const { sql, params } = buildSurveyWhere(venueId, days, dataScope);
  const categories = db
    .prepare(
      `SELECT feedback_category as category, COUNT(*) as count
       FROM survey_responses ${sql}
       GROUP BY feedback_category`
    )
    .all(...params);

  res.json({ categories });
});

// ==================== SERVICE IMPROVEMENT ACTIONS ====================

router.get('/actions', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const requestedVenue = req.query.venue_id ? Number(req.query.venue_id) : null;
  const venueId = resolveAuthorizedVenueId(req.user!, requestedVenue);

  const rows =
    venueId !== null
      ? db
          .prepare(
            `SELECT a.*, v.restaurant_name FROM service_actions a JOIN venues v ON a.venue_id = v.id WHERE a.venue_id = ? ORDER BY a.created_at DESC`
          )
          .all(venueId)
      : db
          .prepare(
            `SELECT a.*, v.restaurant_name FROM service_actions a JOIN venues v ON a.venue_id = v.id ORDER BY a.created_at DESC`
          )
          .all();

  res.json({ actions: rows });
});

router.post('/actions', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { venue_id, issue, action_description, assigned_role, status = 'open', outcome = null } = req.body || {};
  const targetVenueId = req.user!.role === 'super_admin' ? Number(venue_id) : req.user!.venue_id;

  if (!targetVenueId || !issue || !action_description || !assigned_role) {
    res.status(400).json({ detail: 'venue_id, issue, action_description, and assigned_role are required.' });
    return;
  }

  const validStatus = ['open', 'in_progress', 'resolved'].includes(status) ? status : 'open';
  const result = db
    .prepare(
      `INSERT INTO service_actions (venue_id, issue, action_description, assigned_role, status, outcome)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      targetVenueId,
      String(issue).trim(),
      String(action_description).trim(),
      String(assigned_role).trim(),
      validStatus,
      outcome ? String(outcome).trim() : null
    );

  const created = db
    .prepare('SELECT a.*, v.restaurant_name FROM service_actions a JOIN venues v ON a.venue_id = v.id WHERE a.id = ?')
    .get(result.lastInsertRowid);
  logAudit(req.user!.id, req.user!.email, 'CREATE_SERVICE_ACTION', 'service_action', String(result.lastInsertRowid), 'success');
  res.status(201).json({ action: created });
});

router.put('/actions/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const actionId = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM service_actions WHERE id = ?').get(actionId) as
    | { id: number; venue_id: number; status: string; outcome: string | null; action_description: string }
    | undefined;

  if (!existing) {
    res.status(404).json({ detail: 'Service action not found.' });
    return;
  }

  if (req.user!.role !== 'super_admin' && req.user!.venue_id !== existing.venue_id) {
    res.status(403).json({ detail: 'Tenant isolation: access denied.' });
    return;
  }

  const { status, outcome, action_description } = req.body || {};
  const nextStatus = status && ['open', 'in_progress', 'resolved'].includes(status) ? status : existing.status;

  db.prepare(`UPDATE service_actions SET status = ?, outcome = ?, action_description = ? WHERE id = ?`).run(
    nextStatus,
    outcome !== undefined ? (outcome ? String(outcome).trim() : null) : existing.outcome,
    action_description !== undefined ? String(action_description).trim() : existing.action_description,
    actionId
  );

  const updated = db
    .prepare('SELECT a.*, v.restaurant_name FROM service_actions a JOIN venues v ON a.venue_id = v.id WHERE a.id = ?')
    .get(actionId);
  logAudit(req.user!.id, req.user!.email, 'UPDATE_SERVICE_ACTION', 'service_action', String(actionId), 'success');
  res.json({ action: updated });
});

// ==================== REPORTS & EXPORTS ====================

function buildAggregateReport(venueId: number | null, granularity: 'daily' | 'weekly' | 'monthly', dataScope: string) {
  const days = granularity === 'monthly' ? 365 : granularity === 'weekly' ? 90 : 30;
  const { sql, params } = buildSurveyWhere(venueId, days, dataScope);

  let periodExpr = "strftime('%Y-%m-%d', created_at)";
  if (granularity === 'weekly') periodExpr = "strftime('%Y-W%W', created_at)";
  if (granularity === 'monthly') periodExpr = "strftime('%Y-%m', created_at)";

  const periods = db
    .prepare(
      `SELECT
        ${periodExpr} as period,
        COUNT(*) as submission_count,
        ROUND(AVG(overall_rating), 2) as avg_overall,
        ROUND(AVG(food_rating), 2) as avg_food,
        ROUND(AVG(service_rating), 2) as avg_service,
        ROUND(AVG(cleanliness_rating), 2) as avg_cleanliness,
        ROUND(AVG(waiting_time_rating), 2) as avg_waiting,
        SUM(CASE WHEN feedback_category = 'positive' THEN 1 ELSE 0 END) as positive_count,
        SUM(CASE WHEN feedback_category = 'neutral' THEN 1 ELSE 0 END) as neutral_count,
        SUM(CASE WHEN feedback_category = 'negative' THEN 1 ELSE 0 END) as negative_count
       FROM survey_responses ${sql}
       GROUP BY period
       ORDER BY period DESC`
    )
    .all(...params) as Array<Record<string, unknown> & { submission_count: number }>;

  // Privacy check: mark small periods if < 5 for export notice, while keeping aggregate totals
  const totalSubmissions = periods.reduce((acc, p) => acc + Number(p.submission_count || 0), 0);
  return {
    granularity,
    total_submissions: totalSubmissions,
    k_anonymity_threshold: K_ANONYMITY_THRESHOLD,
    export_permitted: totalSubmissions >= K_ANONYMITY_THRESHOLD,
    periods,
  };
}

router.get('/reports/daily', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const venueId = resolveAuthorizedVenueId(req.user!, req.query.venue_id ? Number(req.query.venue_id) : null);
  const dataScope = String(req.query.data_scope || 'all');
  res.json(buildAggregateReport(venueId, 'daily', dataScope));
});

router.get('/reports/weekly', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const venueId = resolveAuthorizedVenueId(req.user!, req.query.venue_id ? Number(req.query.venue_id) : null);
  const dataScope = String(req.query.data_scope || 'all');
  res.json(buildAggregateReport(venueId, 'weekly', dataScope));
});

router.get('/reports/monthly', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const venueId = resolveAuthorizedVenueId(req.user!, req.query.venue_id ? Number(req.query.venue_id) : null);
  const dataScope = String(req.query.data_scope || 'all');
  res.json(buildAggregateReport(venueId, 'monthly', dataScope));
});

router.get('/reports/export', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const venueId = resolveAuthorizedVenueId(req.user!, req.query.venue_id ? Number(req.query.venue_id) : null);
  const granularity = (['daily', 'weekly', 'monthly'].includes(String(req.query.granularity))
    ? String(req.query.granularity)
    : 'weekly') as 'daily' | 'weekly' | 'monthly';
  const dataScope = String(req.query.data_scope || 'all');
  const format = String(req.query.format || 'csv');

  const report = buildAggregateReport(venueId, granularity, dataScope);

  if (!report.export_permitted) {
    res.status(403).json({
      detail: `Privacy protection: aggregate export requires at least ${K_ANONYMITY_THRESHOLD} total responses in the selected range (currently ${report.total_submissions}).`,
    });
    return;
  }

  logAudit(req.user!.id, req.user!.email, `EXPORT_REPORT_${format.toUpperCase()}`, 'report', granularity, 'success');

  if (format === 'json') {
    res.json(report);
    return;
  }

  const header = [
    'Period',
    'Submissions',
    'Avg Overall',
    'Avg Food',
    'Avg Service',
    'Avg Cleanliness',
    'Avg Waiting Time',
    'Positive',
    'Neutral',
    'Negative',
  ].join(',');

  const lines = report.periods.map((p) => {
    const count = Number(p.submission_count || 0);
    if (count < K_ANONYMITY_THRESHOLD) {
      return [p.period, count, 'SUPPRESSED (n<5)', 'SUPPRESSED', 'SUPPRESSED', 'SUPPRESSED', 'SUPPRESSED', '-', '-', '-'].join(',');
    }
    return [
      p.period,
      count,
      p.avg_overall,
      p.avg_food,
      p.avg_service,
      p.avg_cleanliness,
      p.avg_waiting,
      p.positive_count,
      p.neutral_count,
      p.negative_count,
    ].join(',');
  });

  const csvContent = [header, ...lines].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="dinesense_${granularity}_aggregate_report.csv"`);
  res.send(csvContent);
});

// ==================== SUPER ADMIN & RETENTION CONTROLS ====================

router.get('/admin/system-health', requireAuth, requireRole('super_admin'), (_req, res: Response) => {
  const venueStats = db
    .prepare(
      `SELECT COUNT(*) as total_venues, SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_venues FROM venues`
    )
    .get() as { total_venues: number; active_venues: number };

  const userStats = db
    .prepare(
      `SELECT
        COUNT(*) as total_users,
        SUM(CASE WHEN role = 'restaurant_admin' THEN 1 ELSE 0 END) as total_admins,
        SUM(CASE WHEN role = 'restaurant_manager' THEN 1 ELSE 0 END) as total_managers
       FROM users`
    )
    .get() as { total_users: number; total_admins: number; total_managers: number };

  const surveyTotal = (db.prepare('SELECT COUNT(*) as count FROM survey_responses').get() as { count: number }).count;
  const cueTotal = (db.prepare('SELECT COUNT(*) as count FROM feedback_events').get() as { count: number }).count;

  res.json({
    system_status: 'operational',
    database_engine: 'SQLite (Local WAL) / PostgreSQL Compatible',
    inference_provider: process.env.INFERENCE_PROVIDER || 'demo-v1',
    privacy_guardrails: {
      raw_image_storage: 'disabled',
      face_recognition: 'disabled',
      k_anonymity_threshold: K_ANONYMITY_THRESHOLD,
    },
    counts: {
      total_venues: venueStats.total_venues || 0,
      active_venues: venueStats.active_venues || 0,
      total_admins: userStats.total_admins || 0,
      total_managers: userStats.total_managers || 0,
      total_surveys: surveyTotal,
      total_expression_events: cueTotal,
    },
  });
});

router.get('/admin/audit-logs', requireAuth, requireRole('super_admin'), (_req, res: Response) => {
  const logs = db
    .prepare(
      `SELECT id, actor_id, actor_email, action, object_type, object_id, result, timestamp
       FROM audit_logs ORDER BY id DESC LIMIT 100`
    )
    .all();
  res.json({ logs });
});

router.get(
  '/admin/retention',
  requireAuth,
  requireRole('super_admin', 'restaurant_admin'),
  (req: AuthenticatedRequest, res: Response) => {
    if (req.user!.role === 'super_admin') {
      const venues = db.prepare('SELECT id, restaurant_name, retention_days FROM venues ORDER BY restaurant_name ASC').all();
      res.json({ default_retention_days: Number(process.env.RETENTION_DAYS || 90), venues });
      return;
    }
    const venue = db
      .prepare('SELECT id, restaurant_name, retention_days FROM venues WHERE id = ?')
      .get(req.user!.venue_id);
    res.json({ default_retention_days: Number(process.env.RETENTION_DAYS || 90), venues: venue ? [venue] : [] });
  }
);

router.put(
  '/admin/retention',
  requireAuth,
  requireRole('super_admin', 'restaurant_admin'),
  (req: AuthenticatedRequest, res: Response) => {
    const { venue_id, retention_days } = req.body || {};
    const targetVenue = req.user!.role === 'super_admin' ? Number(venue_id) : req.user!.venue_id;
    const days = Math.max(7, Math.min(365, Number(retention_days)));
    if (!targetVenue || Number.isNaN(days)) {
      res.status(400).json({ detail: 'Valid venue_id and retention_days (7–365) are required.' });
      return;
    }
    db.prepare('UPDATE venues SET retention_days = ? WHERE id = ?').run(days, targetVenue);
    logAudit(req.user!.id, req.user!.email, 'UPDATE_RETENTION_POLICY', 'venue', String(targetVenue), 'success');
    res.json({ message: `Data retention period updated to ${days} days.`, venue_id: targetVenue, retention_days: days });
  }
);

router.post(
  '/admin/retention/purge',
  requireAuth,
  requireRole('super_admin', 'restaurant_admin'),
  (req: AuthenticatedRequest, res: Response) => {
    const venueId = req.user!.role === 'super_admin' ? Number(req.body?.venue_id || 0) : req.user!.venue_id;

    let deletedSurveys = 0;
    let deletedEvents = 0;

    if (venueId) {
      const v = db.prepare('SELECT retention_days FROM venues WHERE id = ?').get(venueId) as
        | { retention_days: number }
        | undefined;
      const days = v?.retention_days || 90;
      deletedSurveys = db
        .prepare(`DELETE FROM survey_responses WHERE venue_id = ? AND created_at < datetime('now', ?)`)
        .run(venueId, `-${days} days`).changes;
      deletedEvents = db
        .prepare(`DELETE FROM feedback_events WHERE venue_id = ? AND created_at < datetime('now', ?)`)
        .run(venueId, `-${days} days`).changes;
    } else if (req.user!.role === 'super_admin') {
      const venues = db.prepare('SELECT id, retention_days FROM venues').all() as Array<{ id: number; retention_days: number }>;
      for (const v of venues) {
        deletedSurveys += db
          .prepare(`DELETE FROM survey_responses WHERE venue_id = ? AND created_at < datetime('now', ?)`)
          .run(v.id, `-${v.retention_days} days`).changes;
        deletedEvents += db
          .prepare(`DELETE FROM feedback_events WHERE venue_id = ? AND created_at < datetime('now', ?)`)
          .run(v.id, `-${v.retention_days} days`).changes;
      }
    }

    logAudit(req.user!.id, req.user!.email, 'RUN_RETENTION_PURGE', 'retention', String(venueId || 'all'), 'success');
    res.json({
      message: 'Retention purge completed.',
      deleted_survey_responses: deletedSurveys,
      deleted_feedback_events: deletedEvents,
    });
  }
);

export default router;

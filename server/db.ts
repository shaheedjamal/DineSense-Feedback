import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';

const dbPath = process.env.SQLITE_DB_PATH || path.resolve(process.cwd(), 'dinesense.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS venues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      restaurant_name TEXT NOT NULL,
      location TEXT NOT NULL,
      contact_email TEXT NOT NULL,
      welcome_message TEXT NOT NULL DEFAULT 'We value your honest dining experience. Share your feedback in under a minute.',
      camera_feedback_enabled INTEGER NOT NULL DEFAULT 1,
      qr_feedback_enabled INTEGER NOT NULL DEFAULT 1,
      retention_days INTEGER NOT NULL DEFAULT 90,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('super_admin', 'restaurant_admin', 'restaurant_manager')),
      venue_id INTEGER REFERENCES venues(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS consent_events (
      id TEXT PRIMARY KEY,
      venue_id INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
      notice_version TEXT NOT NULL DEFAULT 'v2.1-2026',
      consent_choice TEXT NOT NULL CHECK (consent_choice IN ('accepted', 'declined')),
      used_for_inference INTEGER NOT NULL DEFAULT 0,
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS feedback_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_id INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
      time_bucket TEXT NOT NULL,
      model_version TEXT NOT NULL,
      expression_cue TEXT NOT NULL CHECK (expression_cue IN ('smile_like', 'neutral_like', 'other_expression', 'uncertain')),
      confidence_band TEXT NOT NULL CHECK (confidence_band IN ('high', 'medium', 'low')),
      quality_status TEXT NOT NULL CHECK (quality_status IN ('acceptable', 'insufficient')),
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS survey_responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_id INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
      submission_channel TEXT NOT NULL DEFAULT 'web' CHECK (submission_channel IN ('web', 'qr', 'kiosk')),
      used_camera_cue INTEGER NOT NULL DEFAULT 0,
      food_rating INTEGER NOT NULL CHECK (food_rating BETWEEN 1 AND 5),
      service_rating INTEGER NOT NULL CHECK (service_rating BETWEEN 1 AND 5),
      cleanliness_rating INTEGER NOT NULL CHECK (cleanliness_rating BETWEEN 1 AND 5),
      waiting_time_rating INTEGER NOT NULL CHECK (waiting_time_rating BETWEEN 1 AND 5),
      overall_rating REAL NOT NULL CHECK (overall_rating >= 1 AND overall_rating <= 5),
      feedback_category TEXT NOT NULL CHECK (feedback_category IN ('positive', 'neutral', 'negative')),
      comment TEXT,
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS service_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_id INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
      issue TEXT NOT NULL,
      action_description TEXT NOT NULL,
      assigned_role TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
      outcome TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_email TEXT,
      action TEXT NOT NULL,
      object_type TEXT NOT NULL,
      object_id TEXT,
      result TEXT NOT NULL CHECK (result IN ('success', 'denied', 'error')),
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_users_venue ON users(venue_id);
    CREATE INDEX IF NOT EXISTS idx_survey_venue_created ON survey_responses(venue_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_feedback_events_venue_bucket ON feedback_events(venue_id, time_bucket);
    CREATE INDEX IF NOT EXISTS idx_consent_venue ON consent_events(venue_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_actions_venue ON service_actions(venue_id, status);
    CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);
  `);

  seedInitialData();
}

function seedInitialData(): void {
  const venueCountRow = db.prepare('SELECT COUNT(*) as count FROM venues').get() as { count: number };
  if (venueCountRow.count > 0) {
    return;
  }

  const insertVenue = db.prepare(`
    INSERT INTO venues (restaurant_name, location, contact_email, welcome_message, camera_feedback_enabled, qr_feedback_enabled, retention_days, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const v1 = insertVenue.run(
    'Bistro Meridian',
    'Indiranagar, Bengaluru',
    'hospitality@bistromeridian.example',
    'Thank you for dining at Bistro Meridian. Share your direct ratings below; camera cues are completely optional.',
    1,
    1,
    90,
    'active'
  ).lastInsertRowid as number;

  const v2 = insertVenue.run(
    'Saffron & Oak',
    'Bandra West, Mumbai',
    'care@saffronandoak.example',
    'Welcome to Saffron & Oak. Your direct ratings help our kitchen and dining room teams improve every service.',
    1,
    1,
    60,
    'active'
  ).lastInsertRowid as number;

  const v3 = insertVenue.run(
    'Harbor Kitchen',
    'Fort Kochi, Kochi',
    'hello@harborkitchen.example',
    'We appreciate your visit to Harbor Kitchen. Tell us about your meal, service pace, and cleanliness.',
    0,
    1,
    90,
    'active'
  ).lastInsertRowid as number;

  const insertUser = db.prepare(`
    INSERT INTO users (full_name, email, password_hash, role, venue_id, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const demoPasswordHash = bcrypt.hashSync('DemoPass!2026', 10);

  const superAdminId = insertUser.run(
    'Aarav Mehta',
    'superadmin@dinesense.demo',
    demoPasswordHash,
    'super_admin',
    null,
    'active'
  ).lastInsertRowid as number;

  insertUser.run(
    'Priya Nair',
    'admin@bistromeridian.demo',
    demoPasswordHash,
    'restaurant_admin',
    v1,
    'active'
  );

  insertUser.run(
    'Rohan Kapoor',
    'manager@bistromeridian.demo',
    demoPasswordHash,
    'restaurant_manager',
    v1,
    'active'
  );

  insertUser.run(
    'Kavya Sharma',
    'admin@saffronandoak.demo',
    demoPasswordHash,
    'restaurant_admin',
    v2,
    'active'
  );

  insertUser.run(
    'Vikram Iyer',
    'manager@saffronandoak.demo',
    demoPasswordHash,
    'restaurant_manager',
    v2,
    'active'
  );

  insertUser.run(
    'Meera Thomas',
    'manager@harborkitchen.demo',
    demoPasswordHash,
    'restaurant_manager',
    v3,
    'active'
  );

  const insertSurvey = db.prepare(`
    INSERT INTO survey_responses (
      venue_id, submission_channel, used_camera_cue, food_rating, service_rating,
      cleanliness_rating, waiting_time_rating, overall_rating, feedback_category, comment, is_demo, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `);

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  const sampleSurveys: Array<{
    venueId: number;
    daysAgo: number;
    channel: 'web' | 'qr' | 'kiosk';
    cam: number;
    food: number;
    service: number;
    clean: number;
    wait: number;
    comment: string | null;
  }> = [
    { venueId: v1, daysAgo: 0, channel: 'qr', cam: 1, food: 5, service: 5, clean: 5, wait: 4, comment: 'Wood-fired flatbread and attentive table check-ins stood out tonight.' },
    { venueId: v1, daysAgo: 1, channel: 'kiosk', cam: 0, food: 5, service: 4, clean: 5, wait: 4, comment: 'Great pacing between starters and mains.' },
    { venueId: v1, daysAgo: 1, channel: 'qr', cam: 1, food: 4, service: 4, clean: 5, wait: 3, comment: 'Main course was delicious; Friday evening wait for drinks took 12 minutes.' },
    { venueId: v1, daysAgo: 2, channel: 'web', cam: 0, food: 3, service: 3, clean: 4, wait: 2, comment: 'Kitchen seemed backed up around 8:30 PM. Staff remained polite.' },
    { venueId: v1, daysAgo: 3, channel: 'qr', cam: 1, food: 5, service: 5, clean: 5, wait: 5, comment: 'Spotless dining room and thoughtful allergen explanation.' },
    { venueId: v1, daysAgo: 4, channel: 'kiosk', cam: 0, food: 4, service: 5, clean: 4, wait: 4, comment: 'Warm hospitality from the floor lead.' },
    { venueId: v1, daysAgo: 5, channel: 'qr', cam: 0, food: 2, service: 3, clean: 4, wait: 2, comment: 'Soup arrived lukewarm and took 25 minutes after ordering.' },
    { venueId: v1, daysAgo: 6, channel: 'qr', cam: 1, food: 5, service: 5, clean: 5, wait: 5, comment: 'Quiet corner seating made for a memorable anniversary dinner.' },
    { venueId: v1, daysAgo: 8, channel: 'web', cam: 0, food: 4, service: 4, clean: 4, wait: 4, comment: 'Consistent quality on the tasting menu.' },
    { venueId: v1, daysAgo: 10, channel: 'qr', cam: 1, food: 5, service: 4, clean: 5, wait: 4, comment: 'Loved the seasonal citrus dessert.' },
    { venueId: v1, daysAgo: 12, channel: 'kiosk', cam: 0, food: 3, service: 4, clean: 4, wait: 3, comment: 'Good ambiance, slightly loud near the pass.' },
    { venueId: v1, daysAgo: 15, channel: 'qr', cam: 1, food: 5, service: 5, clean: 5, wait: 4, comment: 'Prompt water refills and crisp linens.' },
    { venueId: v1, daysAgo: 18, channel: 'web', cam: 0, food: 4, service: 4, clean: 5, wait: 4, comment: null },
    { venueId: v1, daysAgo: 22, channel: 'qr', cam: 0, food: 5, service: 5, clean: 5, wait: 5, comment: 'Best sourdough and cultured butter in the neighborhood.' },
    { venueId: v2, daysAgo: 0, channel: 'qr', cam: 1, food: 5, service: 5, clean: 5, wait: 5, comment: 'Impeccable spice balance on the coastal curry.' },
    { venueId: v2, daysAgo: 2, channel: 'kiosk', cam: 0, food: 4, service: 3, clean: 4, wait: 3, comment: 'Food was vibrant; took a while to get the check.' },
    { venueId: v2, daysAgo: 4, channel: 'qr', cam: 1, food: 5, service: 4, clean: 5, wait: 4, comment: 'Very clean open kitchen and helpful wine pairing.' },
    { venueId: v2, daysAgo: 7, channel: 'web', cam: 0, food: 4, service: 4, clean: 4, wait: 4, comment: 'Enjoyed the patio seating.' },
    { venueId: v2, daysAgo: 11, channel: 'qr', cam: 0, food: 2, service: 2, clean: 3, wait: 2, comment: 'Table was sticky on arrival and drinks order was mixed up.' },
    { venueId: v2, daysAgo: 16, channel: 'kiosk', cam: 1, food: 5, service: 5, clean: 5, wait: 4, comment: 'Smooth lunch express service.' },
    { venueId: v3, daysAgo: 1, channel: 'qr', cam: 0, food: 5, service: 5, clean: 5, wait: 5, comment: 'Fresh catch grilled perfectly. Camera-free kiosk was quick.' },
    { venueId: v3, daysAgo: 3, channel: 'web', cam: 0, food: 4, service: 4, clean: 5, wait: 4, comment: 'Relaxed harbor view and courteous staff.' },
    { venueId: v3, daysAgo: 9, channel: 'qr', cam: 0, food: 4, service: 4, clean: 4, wait: 3, comment: 'Dessert service slowed slightly during full house.' },
  ];

  for (const s of sampleSurveys) {
    const overall = Number(((s.food + s.service + s.clean + s.wait) / 4).toFixed(2));
    const category = overall >= 4 ? 'positive' : overall >= 3 ? 'neutral' : 'negative';
    const createdAt = new Date(now - s.daysAgo * dayMs).toISOString().replace('T', ' ').slice(0, 19);
    insertSurvey.run(
      s.venueId,
      s.channel,
      s.cam,
      s.food,
      s.service,
      s.clean,
      s.wait,
      overall,
      category,
      s.comment,
      createdAt
    );
  }

  // Seed aggregate de-identified expression cues (strictly >= 5 per cue group for v1 so k-anonymity works and demonstrates suppression on smaller groups)
  const insertCue = db.prepare(`
    INSERT INTO feedback_events (venue_id, time_bucket, model_version, expression_cue, confidence_band, quality_status, is_demo, created_at)
    VALUES (?, ?, 'demo-v1', ?, ?, 'acceptable', 1, ?)
  `);

  const cueMixV1: Array<{ cue: 'smile_like' | 'neutral_like' | 'other_expression' | 'uncertain'; band: 'high' | 'medium' | 'low'; count: number }> = [
    { cue: 'smile_like', band: 'medium', count: 14 },
    { cue: 'neutral_like', band: 'medium', count: 9 },
    { cue: 'other_expression', band: 'low', count: 5 },
    { cue: 'uncertain', band: 'low', count: 3 }, // Deliberately < 5 to demonstrate privacy suppression!
  ];

  let offsetHours = 1;
  for (const item of cueMixV1) {
    for (let i = 0; i < item.count; i++) {
      const dt = new Date(now - offsetHours * 3600 * 1000);
      const bucket = dt.toISOString().slice(0, 13).replace('T', ' ') + ':00';
      const createdAt = dt.toISOString().replace('T', ' ').slice(0, 19);
      insertCue.run(v1, bucket, item.cue, item.band, createdAt);
      offsetHours += 5;
    }
  }

  const cueMixV2: Array<{ cue: 'smile_like' | 'neutral_like' | 'other_expression' | 'uncertain'; band: 'high' | 'medium' | 'low'; count: number }> = [
    { cue: 'smile_like', band: 'medium', count: 8 },
    { cue: 'neutral_like', band: 'medium', count: 6 },
    { cue: 'uncertain', band: 'low', count: 2 }, // Suppressed (< 5)
  ];

  for (const item of cueMixV2) {
    for (let i = 0; i < item.count; i++) {
      const dt = new Date(now - offsetHours * 3600 * 1000);
      const bucket = dt.toISOString().slice(0, 13).replace('T', ' ') + ':00';
      const createdAt = dt.toISOString().replace('T', ' ').slice(0, 19);
      insertCue.run(v2, bucket, item.cue, item.band, createdAt);
      offsetHours += 7;
    }
  }

  const insertAction = db.prepare(`
    INSERT INTO service_actions (venue_id, issue, action_description, assigned_role, status, outcome)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  insertAction.run(
    v1,
    'Peak-hour drink & starter wait time exceeding 15 mins on Friday nights',
    'Add dedicated bar-back runner between 7:30 PM and 10:00 PM Friday–Saturday and stage pre-batched garnish prep.',
    'Floor Lead & Bar Supervisor',
    'in_progress',
    'Wait-time ratings rose from 2.5 to 4.0 across last 4 evening services.'
  );

  insertAction.run(
    v1,
    'Hot soup temperature drop before table delivery',
    'Pre-warm stoneware bowls on pass shelf and institute 90-second runner dispatch chime.',
    'Sous Chef',
    'resolved',
    'Zero temperature complaints in the past 10 days.'
  );

  insertAction.run(
    v2,
    'Check presentation delay at end of meal',
    'Equip section servers with portable wireless POS terminals for tableside settlement.',
    'Restaurant Manager',
    'open',
    null
  );

  const insertConsent = db.prepare(`
    INSERT INTO consent_events (id, venue_id, notice_version, consent_choice, used_for_inference)
    VALUES (?, ?, 'v2.1-2026', ?, 1)
  `);
  insertConsent.run('demo-consent-001', v1, 'accepted');
  insertConsent.run('demo-consent-002', v1, 'declined');
  insertConsent.run('demo-consent-003', v2, 'accepted');

  db.prepare(`
    INSERT INTO audit_logs (actor_id, actor_email, action, object_type, object_id, result)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(superAdminId, 'superadmin@dinesense.demo', 'SEED_DEMO_DATABASE', 'system', 'all', 'success');
}

export default db;

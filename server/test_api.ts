/**
 * Automated Integration & Security Verification Suite for DineSense Feedback
 * Runs against the live Express + SQLite API on http://localhost:3000
 */
import assert from 'node:assert/strict';

const BASE = 'http://127.0.0.1:3000/api';

async function req(path: string, options: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

async function runTests() {
  console.log('1. Checking health endpoint...');
  const health = await req('/health');
  assert.equal(health.status, 200);
  assert.equal(health.body.status, 'ok');

  console.log('2. Testing unauthorized access protection...');
  const unauth = await req('/dashboard/summary');
  assert.equal(unauth.status, 401);

  console.log('3. Testing demo manager login & RBAC...');
  const mgrLogin = await req('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'manager@bistromeridian.demo', password: 'DemoPass!2026' }),
  });
  assert.equal(mgrLogin.status, 200);
  const mgrToken = mgrLogin.body.access_token;
  assert.ok(mgrToken);

  // Manager cannot create venues or access super admin audit logs
  const mgrCreateVenue = await req('/venues', {
    method: 'POST',
    headers: { Authorization: `Bearer ${mgrToken}` },
    body: JSON.stringify({ restaurant_name: 'X', location: 'Y', contact_email: 'x@y.com' }),
  });
  assert.equal(mgrCreateVenue.status, 403);

  const mgrAudit = await req('/admin/audit-logs', {
    headers: { Authorization: `Bearer ${mgrToken}` },
  });
  assert.equal(mgrAudit.status, 403);

  // Tenant isolation: manager of venue 1 cannot view venue 2 details
  const crossTenant = await req('/venues/2', {
    headers: { Authorization: `Bearer ${mgrToken}` },
  });
  assert.equal(crossTenant.status, 403);

  console.log('4. Testing consent enforcement & AI abstention...');
  const noConsent = await req('/inference-events', {
    method: 'POST',
    body: JSON.stringify({
      venue_id: 1,
      consent_id: 'non-existent',
      quality_metrics: { face_detected: true, brightness: 0.5, blur_score: 0.7, framing_score: 0.7 },
    }),
  });
  assert.equal(noConsent.status, 403);

  const declined = await req('/consents', {
    method: 'POST',
    body: JSON.stringify({ venue_id: 1, consent_choice: 'declined' }),
  });
  assert.equal(declined.status, 201);

  const declinedInf = await req('/inference-events', {
    method: 'POST',
    body: JSON.stringify({
      venue_id: 1,
      consent_id: declined.body.consent_id,
      quality_metrics: { face_detected: true, brightness: 0.5, blur_score: 0.7, framing_score: 0.7 },
    }),
  });
  assert.equal(declinedInf.status, 403);

  const accepted = await req('/consents', {
    method: 'POST',
    body: JSON.stringify({ venue_id: 1, consent_choice: 'accepted' }),
  });
  assert.equal(accepted.status, 201);

  // Poor lighting triggers abstention
  const poorLight = await req('/inference-events', {
    method: 'POST',
    body: JSON.stringify({
      venue_id: 1,
      consent_id: accepted.body.consent_id,
      quality_metrics: { face_detected: true, brightness: 0.08, blur_score: 0.7, framing_score: 0.7 },
    }),
  });
  assert.equal(poorLight.status, 200);
  assert.equal(poorLight.body.status, 'abstention');
  assert.equal(poorLight.body.expression_cue, 'uncertain');

  // Replaying same single-use consent token fails with 409
  const replay = await req('/inference-events', {
    method: 'POST',
    body: JSON.stringify({
      venue_id: 1,
      consent_id: accepted.body.consent_id,
      quality_metrics: { face_detected: true, brightness: 0.5, blur_score: 0.7, framing_score: 0.7 },
    }),
  });
  assert.equal(replay.status, 409);

  console.log('5. Testing end-to-end guest survey submission -> manager dashboard summary...');
  const beforeSummary = await req('/dashboard/summary?venue_id=1', {
    headers: { Authorization: `Bearer ${mgrToken}` },
  });
  const countBefore = beforeSummary.body.summary.total_feedback;

  const survey = await req('/survey-responses', {
    method: 'POST',
    body: JSON.stringify({
      venue_id: 1,
      submission_channel: 'qr',
      used_camera_cue: false,
      food_rating: 5,
      service_rating: 5,
      cleanliness_rating: 5,
      waiting_time_rating: 4,
      comment: 'Automated integration test feedback',
    }),
  });
  assert.equal(survey.status, 201);

  const afterSummary = await req('/dashboard/summary?venue_id=1', {
    headers: { Authorization: `Bearer ${mgrToken}` },
  });
  assert.equal(afterSummary.body.summary.total_feedback, countBefore + 1);

  // Verify k-anonymity suppression on small cue group (uncertain has < 5 in seed)
  const cues = afterSummary.body.expression_cue_analytics.cues as Array<any>;
  const smallCue = cues.find((c) => c.expression_cue === 'uncertain');
  if (smallCue) {
    assert.equal(smallCue.suppressed, true);
    assert.equal(smallCue.count, null);
  }

  console.log('6. Testing Super Admin login & CSV export...');
  const adminLogin = await req('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'superadmin@dinesense.demo', password: 'DemoPass!2026' }),
  });
  assert.equal(adminLogin.status, 200);
  const adminToken = adminLogin.body.access_token;

  const sysHealth = await req('/admin/system-health', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(sysHealth.status, 200);
  assert.equal(sysHealth.body.system_status, 'operational');

  const csvExport = await req('/reports/export?granularity=weekly&format=csv', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(csvExport.status, 200);
  assert.ok(String(csvExport.body).includes('Period,Submissions,Avg Overall'));

  console.log('All integration & security verification tests passed!');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { authenticateUser, getSessionUser } from './auth';
import { findAndRankTechnicians, haversineDistanceKm } from './dispatch';
import { calculatePriceSnapshot, calculateQuoteTotals } from './pricing';
import { db, VALID_STATE_TRANSITIONS } from './store';

test('calculatePriceSnapshot applies multi-unit discount, coupon, and 18% GST accurately', () => {
  const state = db.read();
  const foamJet = state.services.find((s) => s.id === 'svc-foam-jet')!;
  const coupon = state.coupons.find((c) => c.code === 'JAIPUR100')!;

  const snapshot = calculatePriceSnapshot({
    service: foamJet,
    quantity: 2,
    coupon,
  });

  // 599 + (599 - round(599*0.12)=72 -> 527) = 1126
  assert.equal(snapshot.subtotalInr, 1126);
  assert.equal(snapshot.multiUnitSavingsInr, 72);
  assert.equal(snapshot.discountInr, 100);
  assert.equal(snapshot.taxableAmountInr, 1026);
  assert.equal(snapshot.gstAmountInr, Math.round(1026 * 0.18));
  assert.equal(snapshot.totalPayableInr, 1026 + Math.round(1026 * 0.18));
});

test('calculateQuoteTotals computes parts + labour + 18% GST', () => {
  const totals = calculateQuoteTotals([
    { quantity: 1, unitPriceInr: 500, labourInr: 250 },
    { quantity: 2, unitPriceInr: 150, labourInr: 0 },
  ]);
  assert.equal(totals.subtotalInr, 1050);
  assert.equal(totals.gstAmountInr, 189);
  assert.equal(totals.totalInr, 1239);
});

test('dispatch engine excludes unverified and slot-busy technicians', () => {
  const state = db.read();
  const ranked = findAndRankTechnicians({
    technicians: state.technicians,
    bookings: state.bookings,
    serviceCategory: 'SERVICING',
    acType: 'SPLIT',
    serviceAreaId: 'area-jpr-vaishali',
    destination: { lat: 26.9124, lng: 75.7439 },
    scheduledDate: new Date().toISOString().slice(0, 10),
    slotId: 'slot-11', // tech-rajendra is busy in slot-11 on bk-live-4082
  });

  // Must not include unverified tech-arvind or busy tech-rajendra
  assert.ok(!ranked.some((r) => r.technician.id === 'tech-arvind'));
  assert.ok(!ranked.some((r) => r.technician.id === 'tech-rajendra'));
});

test('haversineDistanceKm returns realistic Jaipur distance', () => {
  const d = haversineDistanceKm(
    { lat: 26.9124, lng: 75.7439 }, // Vaishali Nagar
    { lat: 26.8549, lng: 75.8243 }, // Malviya Nagar
  );
  assert.ok(d > 8 && d < 14, `Expected ~10km, got ${d}`);
});

test('booking state machine blocks invalid transitions', () => {
  assert.ok(!VALID_STATE_TRANSITIONS.COMPLETED.includes('CANCELLED'));
  assert.ok(VALID_STATE_TRANSITIONS.INSPECTION_IN_PROGRESS.includes('QUOTE_PENDING'));
});

// Seeded demo identities and the development-only credentials documented in the
// README. Production supplies its own values through ADMIN_EMAIL, ADMIN_PASSCODE
// and TECH_PASSCODE, so mirror the server fallbacks here.
const DEMO_TECH_PHONE = '+91 00000 00001';
const TECH_PASSCODE = process.env.TECH_PASSCODE ?? 'tech-demo-only';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'ops@example.test';
const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE ?? 'admin-demo-only';

test('role-separated authentication validates customer, technician, and admin sessions', () => {
  const custRes = authenticateUser({
    role: 'CUSTOMER',
    identifier: '+91 00000 00005',
    name: 'Demo Customer One',
  });
  assert.ok('token' in custRes);
  assert.equal(custRes.user.role, 'CUSTOMER');
  assert.equal(getSessionUser(custRes.token)?.role, 'CUSTOMER');
  assert.equal(getSessionUser(`${custRes.token}tampered`), null);

  const badTech = authenticateUser({
    role: 'TECHNICIAN',
    identifier: DEMO_TECH_PHONE,
    passcode: 'WRONG',
  });
  assert.ok('error' in badTech);

  const okTech = authenticateUser({
    role: 'TECHNICIAN',
    identifier: DEMO_TECH_PHONE,
    passcode: TECH_PASSCODE,
  });
  assert.ok('token' in okTech);
  assert.equal(okTech.user.role, 'TECHNICIAN');
  assert.equal(okTech.user.technicianId, 'tech-rajendra');

  const okAdmin = authenticateUser({
    role: 'ADMIN',
    identifier: ADMIN_EMAIL,
    passcode: ADMIN_PASSCODE,
  });
  assert.ok('token' in okAdmin);
  assert.equal(okAdmin.user.role, 'ADMIN');
});

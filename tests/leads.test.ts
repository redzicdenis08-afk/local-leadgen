import assert from 'node:assert/strict';
import { test } from 'node:test';

import { routeLead, validateLead, type Lead } from '../src/leads.js';
import { makeConfig, makeRawLead } from './fixtures.js';

function validLead(overrides: Record<string, unknown> = {}): Lead {
  const result = validateLead({ ...makeRawLead(), ...overrides });
  assert.equal(result.ok, true, result.errors.join('; '));
  return result.lead!;
}

const fixedNow = () => '2026-07-01T15:00:00.000Z';

// --- validation ---

test('validateLead accepts a well-formed form lead and normalizes the phone', () => {
  const lead = validLead();
  assert.equal(lead.phoneNormalized, '5550104477');
  assert.equal(lead.capturedAt, '2026-07-01T14:30:00.000Z');
  assert.ok(lead.id.startsWith('lead_'));
});

test('validateLead accepts an 11-digit phone with a leading 1', () => {
  const lead = validLead({ phone: '+1 555 010 4477' });
  assert.equal(lead.phoneNormalized, '15550104477');
});

test('validateLead rejects a short phone number', () => {
  const result = validateLead({ ...makeRawLead(), phone: '12345' });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('phone:')));
});

test('validateLead rejects an unknown channel', () => {
  const result = validateLead({ ...makeRawLead(), channel: 'carrier-pigeon' });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('channel:')));
});

test('validateLead collects multiple errors at once', () => {
  const result = validateLead({ channel: 'form' });
  assert.equal(result.ok, false);
  assert.ok(result.errors.length >= 3, result.errors.join('; '));
});

test('validateLead rejects a malformed email but allows omitting it', () => {
  assert.equal(validateLead({ ...makeRawLead(), email: 'not-an-email' }).ok, false);
  const raw = makeRawLead();
  delete raw.email;
  assert.equal(validateLead(raw).ok, true);
});

test('validateLead rejects non-object payloads', () => {
  assert.equal(validateLead('nope').ok, false);
  assert.equal(validateLead(null).ok, false);
});

// --- routing ---

test('routeLead delivers to the renter covering the city and service', () => {
  const result = routeLead(validLead(), makeConfig(), fixedNow);
  assert.equal(result.delivered, true);
  assert.equal(result.usedFallback, false);
  assert.equal(result.rule?.id, 'springfield-pro');
  assert.equal(result.deliveredTo, 'leads@springfield-pro.example.com');
});

test('routeLead honors wildcard citySlugs', () => {
  const lead = validLead({ serviceSlug: 'gutter-cleaning', citySlug: 'fairview' });
  const result = routeLead(lead, makeConfig(), fixedNow);
  assert.equal(result.rule?.id, 'gutter-network');
});

test('routeLead skips inactive rules even at the best priority', () => {
  // inactive-renter has priority 1 and covers everything; it must never win.
  const result = routeLead(validLead(), makeConfig(), fixedNow);
  assert.notEqual(result.rule?.id, 'inactive-renter');
  assert.ok(result.audit.some((e) => e.event === 'rule_skipped_inactive'));
});

test('routeLead picks the lowest priority number among matches', () => {
  const cfg = makeConfig();
  cfg.routing!.push({
    id: 'premium-renter',
    businessName: 'Premium Renter Co.',
    contactEmail: 'vip@premium.example.com',
    serviceSlugs: ['window-cleaning'],
    citySlugs: ['springfield'],
    priority: 5,
  });
  const result = routeLead(validLead(), cfg, fixedNow);
  assert.equal(result.rule?.id, 'premium-renter');
});

test('routeLead breaks priority ties by config order', () => {
  const cfg = makeConfig();
  cfg.routing!.push({
    id: 'later-tie',
    businessName: 'Later Tie LLC',
    contactEmail: 'tie@late.example.com',
    serviceSlugs: ['window-cleaning'],
    citySlugs: ['springfield'],
    priority: 10, // same as springfield-pro, defined later
  });
  const result = routeLead(validLead(), cfg, fixedNow);
  assert.equal(result.rule?.id, 'springfield-pro');
});

test('routeLead falls back when no rule matches', () => {
  const lead = validLead({ serviceSlug: 'window-cleaning', citySlug: 'franklin' });
  const result = routeLead(lead, makeConfig(), fixedNow);
  assert.equal(result.delivered, true);
  assert.equal(result.usedFallback, true);
  assert.equal(result.deliveredTo, 'unrouted@example.com');
  assert.ok(result.audit.some((e) => e.event === 'fallback_used'));
});

test('routeLead marks the lead undeliverable without rules or fallback', () => {
  const lead = validLead();
  const result = routeLead(lead, {}, fixedNow);
  assert.equal(result.delivered, false);
  assert.equal(result.audit.at(-1)?.event, 'undeliverable');
});

test('audit trail starts with received and records every decision', () => {
  const result = routeLead(validLead(), makeConfig(), fixedNow);
  assert.equal(result.audit[0]?.event, 'received');
  assert.equal(result.audit.at(-1)?.event, 'routed');
  // 3 rules examined -> at least received + 3 rule events + routed
  assert.ok(result.audit.length >= 5, JSON.stringify(result.audit, null, 2));
  assert.ok(result.audit.every((e) => e.at === fixedNow()));
});

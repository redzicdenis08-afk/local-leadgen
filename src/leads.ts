/**
 * Lead capture, validation, and routing.
 *
 * A lead comes in from a form submission or a phone call, is validated
 * and normalized, then routed to the renter business covering that
 * city + service. Every decision the router makes is recorded in an
 * audit trail on the result — when a renter asks "why did I get this
 * lead?" (or "why didn't I?"), the answer is in the data, not in a log
 * archaeology session.
 *
 * Routing semantics:
 *   1. Only active rules are considered.
 *   2. A rule matches when its serviceSlugs and citySlugs cover the
 *      lead ("*" is a wildcard on either axis).
 *   3. Among matches, lowest priority number wins; ties break on rule
 *      order in the config (stable, predictable).
 *   4. No match → fallback delivery (config.fallbackEmail) so a lead is
 *      never silently dropped.
 */

import type { LeadGenConfig, RoutingRule } from './config.js';

export type LeadChannel = 'form' | 'call';

export interface LeadPayload {
  /** Stable id; generated when omitted. */
  id?: string;
  channel: LeadChannel;
  serviceSlug: string;
  citySlug: string;
  name: string;
  phone: string;
  email?: string;
  message?: string;
  /** ISO timestamp; defaults to now. */
  capturedAt?: string;
}

/** A validated lead: ids/timestamps filled, phone normalized to digits. */
export interface Lead extends LeadPayload {
  id: string;
  capturedAt: string;
  /** Digits-only phone, 10–11 digits, e.g. "15551234567". */
  phoneNormalized: string;
}

export interface LeadValidationResult {
  ok: boolean;
  errors: string[];
  lead?: Lead;
}

const CHANNELS: readonly LeadChannel[] = ['form', 'call'];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

let leadCounter = 0;

function generateLeadId(capturedAt: string): string {
  leadCounter += 1;
  const stamp = capturedAt.replace(/[^0-9]/g, '').slice(0, 14);
  return `lead_${stamp}_${String(leadCounter).padStart(4, '0')}`;
}

/**
 * Validate an untrusted capture payload. Returns every problem found.
 * On success the returned lead has a normalized phone, an id, and a
 * capturedAt timestamp.
 */
export function validateLead(raw: unknown): LeadValidationResult {
  const errors: string[] = [];
  if (!isRecord(raw)) {
    return { ok: false, errors: ['lead payload must be a JSON object'] };
  }

  const channel = raw.channel;
  if (typeof channel !== 'string' || !CHANNELS.includes(channel as LeadChannel)) {
    errors.push(`channel: must be one of ${CHANNELS.join(', ')}`);
  }

  for (const key of ['serviceSlug', 'citySlug', 'name'] as const) {
    if (typeof raw[key] !== 'string' || (raw[key] as string).trim().length === 0) {
      errors.push(`${key}: required non-empty string`);
    }
  }

  let phoneNormalized = '';
  if (typeof raw.phone !== 'string' || raw.phone.trim().length === 0) {
    errors.push('phone: required non-empty string');
  } else {
    const digits = raw.phone.replace(/\D/g, '');
    if (digits.length === 10) phoneNormalized = digits;
    else if (digits.length === 11 && digits.startsWith('1')) phoneNormalized = digits;
    else errors.push(`phone: expected 10 digits (or 11 starting with 1), got ${digits.length}`);
  }

  if (raw.email !== undefined) {
    if (typeof raw.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw.email)) {
      errors.push('email: must be a valid email when present');
    }
  }

  if (raw.capturedAt !== undefined) {
    if (typeof raw.capturedAt !== 'string' || Number.isNaN(Date.parse(raw.capturedAt))) {
      errors.push('capturedAt: must be an ISO timestamp when present');
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  const capturedAt =
    typeof raw.capturedAt === 'string' ? new Date(raw.capturedAt).toISOString() : new Date().toISOString();

  const lead: Lead = {
    id: typeof raw.id === 'string' && raw.id.trim().length > 0 ? raw.id.trim() : generateLeadId(capturedAt),
    channel: channel as LeadChannel,
    serviceSlug: (raw.serviceSlug as string).trim(),
    citySlug: (raw.citySlug as string).trim(),
    name: (raw.name as string).trim(),
    phone: (raw.phone as string).trim(),
    phoneNormalized,
    capturedAt,
    ...(typeof raw.email === 'string' ? { email: raw.email.trim() } : {}),
    ...(typeof raw.message === 'string' ? { message: raw.message.trim() } : {}),
  };

  return { ok: true, errors: [], lead };
}

export interface AuditEvent {
  at: string;
  event:
    | 'received'
    | 'rule_skipped_inactive'
    | 'rule_no_match'
    | 'rule_matched'
    | 'routed'
    | 'fallback_used'
    | 'undeliverable';
  detail: string;
}

export interface RoutingResult {
  leadId: string;
  delivered: boolean;
  usedFallback: boolean;
  /** The winning rule, when one matched. */
  rule?: RoutingRule;
  /** Where the lead was sent (rule contact or fallback address). */
  deliveredTo?: string;
  audit: AuditEvent[];
}

function ruleCovers(rule: RoutingRule, lead: Lead): boolean {
  const serviceOk = rule.serviceSlugs.includes('*') || rule.serviceSlugs.includes(lead.serviceSlug);
  const cityOk = rule.citySlugs.includes('*') || rule.citySlugs.includes(lead.citySlug);
  return serviceOk && cityOk;
}

/**
 * Route a validated lead through the config's routing rules.
 * Deterministic and side-effect free — delivery itself (email, webhook,
 * CRM push) is the caller's integration concern.
 */
export function routeLead(lead: Lead, cfg: Pick<LeadGenConfig, 'routing' | 'fallbackEmail'>, now?: () => string): RoutingResult {
  const stamp = now ?? (() => new Date().toISOString());
  const audit: AuditEvent[] = [
    {
      at: stamp(),
      event: 'received',
      detail: `lead ${lead.id} (${lead.channel}) for ${lead.serviceSlug} in ${lead.citySlug}`,
    },
  ];

  const candidates: RoutingRule[] = [];
  for (const rule of cfg.routing ?? []) {
    if (rule.active === false) {
      audit.push({ at: stamp(), event: 'rule_skipped_inactive', detail: `rule ${rule.id} is inactive` });
      continue;
    }
    if (!ruleCovers(rule, lead)) {
      audit.push({
        at: stamp(),
        event: 'rule_no_match',
        detail: `rule ${rule.id} does not cover ${lead.serviceSlug}/${lead.citySlug}`,
      });
      continue;
    }
    audit.push({
      at: stamp(),
      event: 'rule_matched',
      detail: `rule ${rule.id} (${rule.businessName}) covers ${lead.serviceSlug}/${lead.citySlug}, priority ${rule.priority ?? 100}`,
    });
    candidates.push(rule);
  }

  if (candidates.length > 0) {
    // Stable sort: lowest priority number wins, config order breaks ties.
    const winner = [...candidates].sort(
      (a, b) => (a.priority ?? 100) - (b.priority ?? 100),
    )[0] as RoutingRule;
    audit.push({
      at: stamp(),
      event: 'routed',
      detail: `delivered to ${winner.businessName} <${winner.contactEmail}> via rule ${winner.id}`,
    });
    return {
      leadId: lead.id,
      delivered: true,
      usedFallback: false,
      rule: winner,
      deliveredTo: winner.contactEmail,
      audit,
    };
  }

  if (cfg.fallbackEmail) {
    audit.push({
      at: stamp(),
      event: 'fallback_used',
      detail: `no rule matched; delivered to fallback <${cfg.fallbackEmail}>`,
    });
    return {
      leadId: lead.id,
      delivered: true,
      usedFallback: true,
      deliveredTo: cfg.fallbackEmail,
      audit,
    };
  }

  audit.push({
    at: stamp(),
    event: 'undeliverable',
    detail: 'no rule matched and no fallbackEmail configured',
  });
  return { leadId: lead.id, delivered: false, usedFallback: false, audit };
}

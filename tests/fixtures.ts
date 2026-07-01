/** Shared synthetic fixtures for the test suite. */

import { validateConfig, type LeadGenConfig } from '../src/config.js';

/** A small, fully synthetic config: 2 services × 3 cities. */
export function makeRawConfig(): Record<string, unknown> {
  return {
    site: {
      baseUrl: 'https://example.com',
      name: 'Testville Quotes',
      phone: '+1-555-0100',
    },
    services: [
      {
        name: 'Window Cleaning',
        description: 'Interior and exterior window washing.',
        priceLow: 150,
        priceHigh: 600,
        keywords: ['window cleaning', 'window washing'],
        facts: ['Hard-water spots etch glass over time.'],
      },
      {
        name: 'Gutter Cleaning',
        description: 'Gutter and downspout clearing with flush testing.',
        priceLow: 120,
        priceHigh: 450,
        keywords: ['gutter cleaning', 'downspout cleaning'],
        facts: ['Clogged gutters overflow at the foundation.'],
      },
    ],
    cities: [
      {
        name: 'Springfield',
        state: 'IL',
        stateName: 'Illinois',
        population: 114000,
        facts: ['Freeze-thaw winters are hard on gutters.'],
        neighborhoods: ['Westchester', 'Lincoln Park'],
        nearbyCities: ['Chatham', 'Sherman'],
        lat: 39.7817,
        lng: -89.6501,
      },
      {
        name: 'Fairview',
        state: 'OR',
        stateName: 'Oregon',
        population: 10500,
        facts: ['Long wet seasons make moss a year-round problem.'],
        nearbyCities: ['Troutdale'],
      },
      {
        name: 'Franklin',
        state: 'TN',
        stateName: 'Tennessee',
        population: 85000,
        facts: ['Pollen season films windows every spring.'],
        neighborhoods: ['Westhaven'],
      },
    ],
    routing: [
      {
        id: 'springfield-pro',
        businessName: 'Springfield Pro Exteriors',
        contactEmail: 'leads@springfield-pro.example.com',
        serviceSlugs: ['window-cleaning'],
        citySlugs: ['springfield'],
        priority: 10,
      },
      {
        id: 'gutter-network',
        businessName: 'Regional Gutter Network',
        contactEmail: 'dispatch@gutter-network.example.com',
        serviceSlugs: ['gutter-cleaning'],
        citySlugs: ['*'],
        priority: 50,
      },
      {
        id: 'inactive-renter',
        businessName: 'Paused Renter LLC',
        contactEmail: 'old@paused.example.com',
        serviceSlugs: ['*'],
        citySlugs: ['*'],
        priority: 1,
        active: false,
      },
    ],
    fallbackEmail: 'unrouted@example.com',
  };
}

export function makeConfig(): LeadGenConfig {
  return validateConfig(makeRawConfig());
}

export function makeRawLead(): Record<string, unknown> {
  return {
    channel: 'form',
    serviceSlug: 'window-cleaning',
    citySlug: 'springfield',
    name: 'Sam Example',
    phone: '(555) 010-4477',
    email: 'sam@example.com',
    message: 'Second-story windows have hard-water spots.',
    capturedAt: '2026-07-01T14:30:00Z',
  };
}

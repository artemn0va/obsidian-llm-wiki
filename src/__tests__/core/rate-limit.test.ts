import { describe, it, expect } from 'vitest';
import { detectRateLimitFailures, formatRateLimitNotice } from '../../core/rate-limit';
describe('detectRateLimitFailures', () => {
  it('returns null when no rate limit failures', () => {
    const result = detectRateLimitFailures(
      [{ name: 'page1', reason: 'timeout' }],
      3, 300
    );
    expect(result).toBeNull();
  });

  it('detects 429 status code', () => {
    const result = detectRateLimitFailures(
      [{ name: 'page1', reason: 'HTTP 429 error' }],
      3, 300
    );
    expect(result).not.toBeNull();
    expect(result?.count).toBe(1);
  });

  it('detects "too many requests" pattern', () => {
    const result = detectRateLimitFailures(
      [{ name: 'page1', reason: 'too many requests from provider' }],
      3, 300
    );
    expect(result).not.toBeNull();
  });

  it('detects "throttl" pattern', () => {
    const result = detectRateLimitFailures(
      [{ name: 'page1', reason: 'request was throttled' }],
      3, 300
    );
    expect(result).not.toBeNull();
  });

  it('suggests lower concurrency', () => {
    const result = detectRateLimitFailures(
      [{ name: 'p1', reason: '429' }, { name: 'p2', reason: '429' }],
      3, 300
    );
    expect(result?.suggestedConcurrency).toBe(2);
  });

  it('suggests min concurrency of 1', () => {
    const result = detectRateLimitFailures(
      [{ name: 'p1', reason: '429 too many requests' }],
      1, 300
    );
    expect(result?.suggestedConcurrency).toBe(1);
  });

  it('suggests increased delay', () => {
    const result = detectRateLimitFailures(
      [{ name: 'p1', reason: '429' }],
      3, 300
    );
    expect(result?.suggestedDelay).toBe(600);
  });

  it('suggests min delay of 500ms when current is very low', () => {
    const result = detectRateLimitFailures(
      [{ name: 'p1', reason: '429' }],
      3, 50
    );
    expect(result?.suggestedDelay).toBe(500);
  });
});

describe('formatRateLimitNotice', () => {
  it('uses template from EN texts', () => {
    const result = formatRateLimitNotice(
      { count: 3, rateLimitNames: ['a', 'b', 'c'], suggestedConcurrency: 2, suggestedDelay: 600 },
      'en',
    );
    expect(result).toContain('3');
    expect(result).toContain('2');
    expect(result).toContain('600');
  });

  it('falls back to EN for unknown language', () => {
    const result = formatRateLimitNotice(
      { count: 2, rateLimitNames: ['page1', 'page2'], suggestedConcurrency: 1, suggestedDelay: 500 },
      'xx',
    );
    expect(result).toContain('2');
    expect(result).toContain('1');
    expect(result).toContain('500');
  });
});


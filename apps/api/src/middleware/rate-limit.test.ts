import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { rateLimit } from './rate-limit.js';
import { RateLimitError } from '../lib/errors.js';

function fakeReq(ip = '1.2.3.4'): Request {
  return { ip, socket: { remoteAddress: ip } } as unknown as Request;
}
function fakeRes(): Response {
  return {} as Response;
}

describe('rateLimit middleware', () => {
  it('allows requests under the limit', () => {
    const mw = rateLimit({ windowMs: 60_000, max: 3, name: 't1' });
    const next = vi.fn();
    for (let i = 0; i < 3; i++) mw(fakeReq(), fakeRes(), next as NextFunction);
    expect(next).toHaveBeenCalledTimes(3);
    expect(next.mock.calls.every((c) => !(c[0] instanceof Error))).toBe(true);
  });

  it('rejects requests over the limit with 429', () => {
    const mw = rateLimit({ windowMs: 60_000, max: 2, name: 't2' });
    const next = vi.fn();
    mw(fakeReq(), fakeRes(), next as NextFunction);
    mw(fakeReq(), fakeRes(), next as NextFunction);
    mw(fakeReq('1.2.3.4'), fakeRes(), next as NextFunction);
    expect(next).toHaveBeenCalledTimes(3);
    expect(next.mock.calls[2]?.[0]).toBeInstanceOf(RateLimitError);
  });

  it('tracks IPs independently', () => {
    const mw = rateLimit({ windowMs: 60_000, max: 1, name: 't3' });
    const next = vi.fn();
    mw(fakeReq('5.5.5.5'), fakeRes(), next as NextFunction);
    mw(fakeReq('6.6.6.6'), fakeRes(), next as NextFunction);
    expect(next.mock.calls.every((c) => !(c[0] instanceof Error))).toBe(true);
  });
});

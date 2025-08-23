/**
 * Unit tests for cron utilities
 */

import { assertCronEnabled, CronDisabledError, isCronEnabled } from '../server/cron';

// Mock the env module
jest.mock('../config/env', () => ({
  env: {
    CRON_ENABLED: false // Default to disabled for tests
  }
}));

describe('CronDisabledError', () => {
  it('should have correct code property', () => {
    const error = new CronDisabledError();
    expect(error.code).toBe('CRON_DISABLED');
    expect(error.name).toBe('CronDisabledError');
  });

  it('should accept custom message', () => {
    const customMessage = 'Custom cron disabled message';
    const error = new CronDisabledError(customMessage);
    expect(error.message).toBe(customMessage);
  });

  it('should have default message', () => {
    const error = new CronDisabledError();
    expect(error.message).toBe('Cron jobs are currently disabled');
  });
});

describe('assertCronEnabled', () => {
  beforeEach(() => {
    // Reset the mock
    jest.resetModules();
  });

  it('should throw CronDisabledError when CRON_ENABLED=false', () => {
    // Mock env with cron disabled
    jest.doMock('../config/env', () => ({
      env: { CRON_ENABLED: false }
    }));

    // Re-import to get the mocked version
    const { assertCronEnabled } = require('../server/cron');

    expect(() => {
      assertCronEnabled();
    }).toThrow(CronDisabledError);
  });

  it('should not throw when CRON_ENABLED=true', () => {
    // Mock env with cron enabled
    jest.doMock('../config/env', () => ({
      env: { CRON_ENABLED: true }
    }));

    // Re-import to get the mocked version
    const { assertCronEnabled } = require('../server/cron');

    expect(() => {
      assertCronEnabled();
    }).not.toThrow();
  });
});

describe('isCronEnabled', () => {
  it('should return false when CRON_ENABLED=false', () => {
    jest.doMock('../config/env', () => ({
      env: { CRON_ENABLED: false }
    }));

    const { isCronEnabled } = require('../server/cron');
    expect(isCronEnabled()).toBe(false);
  });

  it('should return true when CRON_ENABLED=true', () => {
    jest.doMock('../config/env', () => ({
      env: { CRON_ENABLED: true }
    }));

    const { isCronEnabled } = require('../server/cron');
    expect(isCronEnabled()).toBe(true);
  });
});
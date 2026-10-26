import { describe, test, expect, beforeEach, vi } from 'vitest';

// Minimal window/localStorage stubs: the module under test touches both at
// import time and on every token operation, and node's test environment has
// no DOM. hostname must not be a static host so real (non-mock) code paths run.
const store = new Map<string, string>();
const localStorageStub = {
  getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
  setItem: (key: string, value: string) => void store.set(key, String(value)),
  removeItem: (key: string) => void store.delete(key),
  clear: () => void store.clear(),
};
const eventTarget = new EventTarget();
const windowStub = {
  location: { hostname: 'localhost', protocol: 'http:' },
  addEventListener: eventTarget.addEventListener.bind(eventTarget),
  removeEventListener: eventTarget.removeEventListener.bind(eventTarget),
  dispatchEvent: eventTarget.dispatchEvent.bind(eventTarget),
};

vi.stubGlobal('localStorage', localStorageStub);
vi.stubGlobal('window', windowStub);

import { authStorage, notifyConnectionChange, apiConnectionState } from './api';

describe('authStorage', () => {
  beforeEach(() => {
    store.clear();
  });

  test('round-trips a token and trims whitespace', () => {
    authStorage.setToken('  abc123  ');
    expect(authStorage.getToken()).toBe('abc123');
  });

  test('clears the token when set with an empty value', () => {
    authStorage.setToken('abc123');
    authStorage.setToken('');
    expect(authStorage.getToken()).toBe('');
  });

  test('returns empty (not demo credentials) when unauthenticated outside static hosts', () => {
    expect(authStorage.getToken()).toBe('');
  });
});

describe('notifyConnectionChange', () => {
  beforeEach(() => {
    store.clear();
    apiConnectionState.isOnline = true;
    apiConnectionState.errorMessage = null;
  });

  test('updates state and dispatches a detail-carrying event on change', () => {
    const listener = vi.fn();
    window.addEventListener('API_CONNECTION_STATE_CHANGED', listener);

    notifyConnectionChange(false, 'network down');

    expect(apiConnectionState.isOnline).toBe(false);
    expect(apiConnectionState.errorMessage).toBe('network down');
    expect(listener).toHaveBeenCalledTimes(1);
    const detail = (listener.mock.calls[0][0] as CustomEvent).detail;
    expect(detail.isOnline).toBe(false);
    expect(detail.errorMessage).toBe('network down');

    window.removeEventListener('API_CONNECTION_STATE_CHANGED', listener);
  });

  test('does not dispatch when nothing changed', () => {
    const listener = vi.fn();
    window.addEventListener('API_CONNECTION_STATE_CHANGED', listener);

    notifyConnectionChange(true, null);

    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener('API_CONNECTION_STATE_CHANGED', listener);
  });
});

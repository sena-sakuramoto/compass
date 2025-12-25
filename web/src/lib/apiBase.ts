const DEFAULT_API_BASE = '/api';

export function resolveApiBase(): string {
  const explicitBase =
    import.meta.env.VITE_API_BASE ||
    import.meta.env.VITE_API_BASE_URL ||
    '';

  if (typeof window !== 'undefined') {
    const origin = window.location.origin;
    const hosted =
      origin.includes('.web.app') || origin.includes('.firebaseapp.com');
    if (hosted) {
      return DEFAULT_API_BASE;
    }
  }

  return explicitBase || DEFAULT_API_BASE;
}

const LOCAL_PREVIEW_STORAGE_KEY = 'compass_local_preview_mode_v1';
const LOCAL_PREVIEW_QUERY_KEY = 'local-preview';
const LOCAL_SNAPSHOT_STORAGE_KEY = 'apdw_compass_snapshot_v1';
export const LOCAL_PREVIEW_SNAPSHOT_STORAGE_KEY = 'apdw_compass_preview_snapshot_v2';
const LOCAL_PREVIEW_HOSTS = new Set(['localhost', '127.0.0.1']);

export function canUseLocalPreview(): boolean {
  if (typeof window === 'undefined') return false;
  return LOCAL_PREVIEW_HOSTS.has(window.location.hostname);
}

export function isLocalPreviewMode(): boolean {
  if (!canUseLocalPreview()) return false;
  try {
    const params = new URLSearchParams(window.location.search);
    const queryValue = params.get(LOCAL_PREVIEW_QUERY_KEY);
    if (queryValue === '1') return true;
    if (queryValue === '0') return false;
    const storedValue = window.localStorage.getItem(LOCAL_PREVIEW_STORAGE_KEY);
    if (storedValue === '1') return true;
    if (storedValue === '0') return false;
    return true;
  } catch {
    return true;
  }
}

function navigateWithPreviewFlag(enabled: boolean) {
  const url = new URL(window.location.href);
  url.searchParams.set(LOCAL_PREVIEW_QUERY_KEY, enabled ? '1' : '0');
  window.location.assign(url.toString());
}

export function enableLocalPreview(options?: { resetSnapshot?: boolean }) {
  if (!canUseLocalPreview()) return;
  try {
    window.localStorage.setItem(LOCAL_PREVIEW_STORAGE_KEY, '1');
    if (options?.resetSnapshot) {
      window.localStorage.removeItem(LOCAL_SNAPSHOT_STORAGE_KEY);
      window.localStorage.removeItem(LOCAL_PREVIEW_SNAPSHOT_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors and still attempt navigation.
  }
  navigateWithPreviewFlag(true);
}

export function disableLocalPreview() {
  if (!canUseLocalPreview()) return;
  try {
    window.localStorage.setItem(LOCAL_PREVIEW_STORAGE_KEY, '0');
  } catch {
    // Ignore storage errors and still attempt navigation.
  }
  navigateWithPreviewFlag(false);
}

import { getApps, initializeApp } from 'firebase-admin/app';

export function ensureFirebaseAdmin() {
  if (!getApps().length) {
    initializeApp();
  }
}

ensureFirebaseAdmin();

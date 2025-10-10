declare module 'firebase/app' {
  export interface FirebaseOptions {
    [key: string]: unknown;
  }
  export interface FirebaseApp {}
  export function initializeApp(options: FirebaseOptions): FirebaseApp;
  export function getApps(): FirebaseApp[];
  export function getApp(): FirebaseApp;
}

declare module 'firebase/auth' {
  import type { FirebaseApp } from 'firebase/app';
  export interface User {
    uid: string;
    email?: string | null;
    displayName?: string | null;
    getIdToken(forceRefresh?: boolean): Promise<string>;
  }
  export interface Auth {
    currentUser: User | null;
    languageCode?: string | null;
  }
  export class GoogleAuthProvider {
    setCustomParameters(params: Record<string, string>): void;
  }
  export const browserLocalPersistence: unknown;
  export function getAuth(app: FirebaseApp): Auth;
  export function onIdTokenChanged(auth: Auth, observer: (user: User | null) => void): () => void;
  export function signInWithPopup(auth: Auth, provider: GoogleAuthProvider): Promise<void>;
  export function signOut(auth: Auth): Promise<void>;
  export function setPersistence(auth: Auth, persistence: unknown): Promise<void>;
}

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

declare module 'firebase/firestore' {
  import type { FirebaseApp } from 'firebase/app';

  export interface Firestore {}
  export interface DocumentReference<T = unknown> {}
  export interface DocumentSnapshot<T = unknown> {
    exists(): boolean;
    data(): T | undefined;
  }
  export interface Timestamp {}

  export function getFirestore(app?: FirebaseApp): Firestore;
  export function doc<T = unknown>(db: Firestore, path: string, ...pathSegments: string[]): DocumentReference<T>;
  export function getDoc<T = unknown>(ref: DocumentReference<T>): Promise<DocumentSnapshot<T>>;
  export function setDoc<T = unknown>(ref: DocumentReference<T>, data: T): Promise<void>;
  export function serverTimestamp(): Timestamp;
}

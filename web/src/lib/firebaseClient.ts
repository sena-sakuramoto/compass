import { useCallback, useEffect, useMemo, useState } from 'react';
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onIdTokenChanged,
  signInWithPopup,
  signOut,
  setPersistence,
  browserLocalPersistence,
  type User,
} from 'firebase/auth';
import { setIdToken } from './api';
import { clearTokenCache } from './authToken';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const REQUIRED_KEYS: (keyof typeof firebaseConfig)[] = ['apiKey', 'authDomain', 'projectId', 'appId'];

const isConfigValid = REQUIRED_KEYS.every((key) => typeof firebaseConfig[key] === 'string' && firebaseConfig[key]);

let firebaseApp: FirebaseApp | null = null;

/**
 * 初回ログイン時にFirestoreにユーザードキュメントを作成
 */
async function ensureUserDocument(user: User, token: string): Promise<void> {
  try {
    const { getFirestore, doc, getDoc, setDoc, serverTimestamp } = await import('firebase/firestore');
    const db = getFirestore();
    const userRef = doc(db, 'users', user.uid);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      // 招待経由でない直接ログインの場合のフォールバック
      // 通常は org-invitations API 経由でユーザーが作成されるため、ここには到達しない
      const defaultOrgId = 'archi-prisma';
      await setDoc(userRef, {
        email: user.email || '',
        displayName: user.displayName || user.email?.split('@')[0] || '名無し',
        orgId: defaultOrgId,
        role: 'project_manager', // デフォルトはプロジェクトマネージャー
        photoURL: (user as any).photoURL || '',
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      console.log('User document created for', user.email);
    }
  } catch (error) {
    console.error('Failed to ensure user document:', error);
    // エラーでも続行（認証は成功しているため）
  }
}

export function getFirebaseApp() {
  if (!isConfigValid) return null;
  if (firebaseApp) return firebaseApp;
  if (getApps().length) {
    firebaseApp = getApp();
  } else {
    firebaseApp = initializeApp(firebaseConfig);
  }
  return firebaseApp;
}

type AuthState = {
  user: User | null;
  ready: boolean;
  error: string | null;
};

export function useFirebaseAuth() {
  const supported = useMemo(() => isConfigValid, []);
  const [state, setState] = useState<AuthState>({ user: null, ready: !supported, error: null });

  useEffect(() => {
    if (!supported) {
      setState({ user: null, ready: true, error: null });
      setIdToken();
      return;
    }
    const app = getFirebaseApp();
    if (!app) {
      setState({ user: null, ready: true, error: 'Firebase アプリの初期化に失敗しました。' });
      return;
    }
    const auth = getAuth(app);
    auth.languageCode = 'ja';

    setPersistence(auth, browserLocalPersistence).catch((error) => {
      console.warn('Failed to set auth persistence', error);
    });

    const unsubscribe = onIdTokenChanged(auth, async (firebaseUser: User | null) => {
      try {
        if (firebaseUser) {
          const token = await firebaseUser.getIdToken();
          setIdToken(token);

          // 初回ログイン時にFirestoreにユーザードキュメントを作成
          await ensureUserDocument(firebaseUser, token);

          setState({ user: firebaseUser, ready: true, error: null });
        } else {
          setIdToken();
          clearTokenCache(); // ログアウト時にキャッシュをクリア
          setState({ user: null, ready: true, error: null });
        }
      } catch (error) {
        console.warn('Failed to refresh auth token', error);
        setState({ user: firebaseUser, ready: true, error: 'トークンの更新に失敗しました。もう一度サインインしてください。' });
      }
    });

    return () => unsubscribe();
  }, [supported]);

  const signIn = useCallback(async (method: 'google' | 'email' = 'google', emailPassword?: { email: string; password: string }) => {
    if (!supported) return;
    const app = getFirebaseApp();
    if (!app) return;
    const auth = getAuth(app);

    try {
      if (method === 'google') {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        await signInWithPopup(auth, provider);
      } else if (method === 'email' && emailPassword) {
        const firebaseAuth = await import('firebase/auth');
        // @ts-ignore - Firebase auth functions exist but TypeScript can't find them
        await firebaseAuth.signInWithEmailAndPassword(auth, emailPassword.email, emailPassword.password);
      }
      setState((prev) => ({ ...prev, error: null }));
    } catch (error) {
      console.error('Sign-in failed', error);
      const message = error instanceof Error ? error.message : 'サインインに失敗しました。もう一度お試しください。';
      setState((prev) => ({ ...prev, error: message }));
    }
  }, [supported]);

  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    if (!supported) return;
    const app = getFirebaseApp();
    if (!app) return;
    const auth = getAuth(app);

    try {
      const firebaseAuth = await import('firebase/auth');
      // @ts-ignore - Firebase auth functions exist but TypeScript can't find them
      await firebaseAuth.createUserWithEmailAndPassword(auth, email, password);
      setState((prev) => ({ ...prev, error: null }));
    } catch (error) {
      console.error('Sign-up failed', error);
      const message = error instanceof Error ? error.message : 'アカウント作成に失敗しました。もう一度お試しください。';
      setState((prev) => ({ ...prev, error: message }));
    }
  }, [supported]);

  const signOutUser = useCallback(async () => {
    if (!supported) return;
    const app = getFirebaseApp();
    if (!app) return;
    try {
      await signOut(getAuth(app));
      setIdToken();
      clearTokenCache(); // ログアウト時にキャッシュをクリア
      setState((prev) => ({ ...prev, error: null, user: null }));
    } catch (error) {
      console.error('Sign-out failed', error);
      const message = error instanceof Error ? error.message : 'サインアウトに失敗しました。再度お試しください。';
      setState((prev) => ({ ...prev, error: message }));
    }
  }, [supported]);

  return {
    user: state.user,
    authReady: state.ready,
    authSupported: supported,
    authError: state.error,
    signIn,
    signUpWithEmail,
    signOut: signOutUser,
  };
}

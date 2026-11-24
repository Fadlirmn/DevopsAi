// Firebase client SDK — browser-only. This config (apiKey, authDomain,
// projectId) is NOT secret; Firebase's own docs say so explicitly. Real
// access control comes from server-side ID token verification
// (src/lib/server/firebase-auth.ts), not from hiding these values.
//
// getAuth() asserts a browser environment and throws under SSR, so
// initialization is lazy — call getFirebaseAuth() from onMount or an event
// handler, never at module scope in a .svelte file (which also runs on the
// server during SSR).
import { initializeApp, getApps, type FirebaseOptions } from 'firebase/app';
import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth';
import {
	PUBLIC_FIREBASE_API_KEY,
	PUBLIC_FIREBASE_AUTH_DOMAIN,
	PUBLIC_FIREBASE_PROJECT_ID
} from '$app/env/public';

const config: FirebaseOptions = {
	apiKey: PUBLIC_FIREBASE_API_KEY,
	authDomain: PUBLIC_FIREBASE_AUTH_DOMAIN,
	projectId: PUBLIC_FIREBASE_PROJECT_ID
};

let cachedAuth: Auth | null = null;

export function getFirebaseAuth(): Auth {
	if (typeof window === 'undefined') {
		throw new Error('getFirebaseAuth() is browser-only — call it from onMount or an event handler.');
	}
	if (!cachedAuth) {
		const app = getApps().length ? getApps()[0] : initializeApp(config);
		cachedAuth = getAuth(app);
	}
	return cachedAuth;
}

export const googleProvider = new GoogleAuthProvider();

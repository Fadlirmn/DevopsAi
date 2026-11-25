// Browser-only admin sign-out: Firebase client session + server cookie.
import { goto } from '$app/navigation';
import { signOut } from 'firebase/auth';
import { getFirebaseAuth } from '#lib/firebase-client';

export async function logout(to = '/') {
	await signOut(getFirebaseAuth()).catch(() => {});
	await fetch('/api/v1/auth/logout', { method: 'POST' });
	// refreshAll so the root layout re-reads isAdmin.
	await goto(to, { refreshAll: true });
}

export function initials(email: string | null): string {
	return (email ?? 'AD').slice(0, 2).toUpperCase();
}

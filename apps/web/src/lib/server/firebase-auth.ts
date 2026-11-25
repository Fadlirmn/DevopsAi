/**
 * Firebase ID token verification — server-side, PRD.md §9 K-02.
 *
 * Deliberately NOT the firebase-admin SDK: verifying an ID token only needs
 * Google's public signing keys + the project ID (not a secret), so this
 * follows Firebase's documented "manual verification" method instead
 * (https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library).
 * That drops the service-account-file requirement entirely for this one
 * operation — fewer secrets to provision for a feature that doesn't need them.
 *
 * Fails closed: any error (bad signature, wrong project, expired, UID not
 * allowlisted, network failure fetching keys) returns null, never throws a
 * token through as valid.
 */
import { createRemoteJWKSet, jwtVerify } from 'jose';

const JWKS_URL =
	'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks() {
	if (!jwks) jwks = createRemoteJWKSet(new URL(JWKS_URL));
	return jwks;
}

export type AdminIdentity = {
	uid: string;
	email: string | null;
	name: string | null;
	/** token expiry, epoch seconds */
	exp: number | null;
};

export async function verifyAdminIdToken(idToken: string): Promise<AdminIdentity | null> {
	const projectId = process.env.FIREBASE_PROJECT_ID;
	const adminUids = (process.env.ADMIN_UIDS ?? '')
		.split(',')
		.map((u) => u.trim())
		.filter(Boolean);

	if (!projectId || adminUids.length === 0) {
		// Deliberately unconfigured dev environment — deny by default, not "allow everyone".
		return null;
	}

	try {
		const { payload } = await jwtVerify(idToken, getJwks(), {
			issuer: `https://securetoken.google.com/${projectId}`,
			audience: projectId
		});

		const uid = payload.sub;
		if (!uid || !adminUids.includes(uid)) return null;

		return {
			uid,
			email: (payload.email as string | undefined) ?? null,
			name: (payload.name as string | undefined) ?? null,
			exp: payload.exp ?? null
		};
	} catch {
		return null;
	}
}

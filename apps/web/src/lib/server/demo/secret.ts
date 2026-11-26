// Encrypts API keys saved from the admin page before they go to Redis, so a
// leaked Upstash token or dashboard doesn't leak the provider keys too.
// AES-256-GCM, key = SHA-256(SETTINGS_SECRET). SETTINGS_SECRET lives only in
// the Vercel env; changing it makes saved keys unreadable (re-enter them).
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const SECRET = process.env.SETTINGS_SECRET ?? '';
/** Long enough to not be guessable; `openssl rand -base64 32` gives 44 chars. */
export const SECRET_CONFIGURED = SECRET.length >= 16;

const key = () => createHash('sha256').update(SECRET).digest();

export function encrypt(plain: string): string {
	if (!SECRET_CONFIGURED) throw new Error('SETTINGS_SECRET not set');
	const iv = randomBytes(12);
	const c = createCipheriv('aes-256-gcm', key(), iv);
	const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
	return ['v1', iv, c.getAuthTag(), ct]
		.map((x) => (typeof x === 'string' ? x : x.toString('base64')))
		.join(':');
}

/** null when SETTINGS_SECRET is missing/changed or the value was tampered with. */
export function decrypt(sealed: string): string | null {
	if (!SECRET_CONFIGURED) return null;
	const [v, iv, tag, ct] = sealed.split(':');
	if (v !== 'v1' || !iv || !tag || !ct) return null;
	try {
		const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
		d.setAuthTag(Buffer.from(tag, 'base64'));
		return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8');
	} catch {
		return null;
	}
}

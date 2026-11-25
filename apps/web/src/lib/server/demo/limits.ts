// Rate limit, daily spend cap and answer cache for the serverless demo.
//
// Stored in Upstash Redis over its REST API (free tier, one click from the
// Vercel Marketplace): serverless instances share no memory, so a per-process
// counter could be bypassed by hitting different instances.
//
// shortcut: without Upstash (or while it is unreachable) only the per-IP rate
// limit still works, counted per instance in memory; the answer cache and the
// daily spend cap are skipped. Fine for local runs, weak in production (README).
import { createHash } from 'node:crypto';

// Names set by the Vercel Marketplace "Upstash for Redis" integration.
const REST_URL = process.env.KV_REST_API_URL ?? '';
const REST_TOKEN = process.env.KV_REST_API_TOKEN ?? '';
const DURABLE = Boolean(REST_URL && REST_TOKEN);
if (!DURABLE)
	console.warn(
		'[demo] KV_REST_API_URL/TOKEN not set: per-instance rate limit, no cache or spend cap'
	);

/** Runs Redis commands on Upstash; null when Upstash is unset or failing. */
async function redis(cmds: (string | number)[][]): Promise<unknown[] | null> {
	if (!DURABLE) return null;
	try {
		const res = await fetch(`${REST_URL}/pipeline`, {
			method: 'POST',
			headers: { authorization: `Bearer ${REST_TOKEN}`, 'content-type': 'application/json' },
			body: JSON.stringify(cmds),
			signal: AbortSignal.timeout(3000)
		});
		const out = (await res.json()) as { result?: unknown; error?: string }[];
		if (res.ok && Array.isArray(out) && out.every((r) => !r.error)) return out.map((r) => r.result);
		console.error('upstash error', res.status, JSON.stringify(out).slice(0, 200));
	} catch (e) {
		console.error('upstash unreachable', e);
	}
	return null; // an outage degrades to per-instance limits, never a dead demo
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const today = () => new Date().toISOString().slice(0, 10);

// In-memory fallback counters: key -> [count, expiresAt].
const local = new Map<string, [number, number]>();
function localIncr(key: string, ttlMs: number): number {
	const now = Date.now();
	if (local.size > 10_000) for (const [k, [, exp]] of local) if (exp <= now) local.delete(k);
	const hit = local.get(key);
	const next: [number, number] = hit && hit[1] > now ? [hit[0] + 1, hit[1]] : [1, now + ttlMs];
	local.set(key, next);
	return next[0];
}

/** Count one request; null if allowed, else seconds until retry. */
export async function hitRateLimit(ip: string, salt: string, perMinute: number, perDay: number) {
	const actor = sha(`${salt}|${ip}`).slice(0, 32);
	const now = Date.now();
	const minuteKey = `rl:m:${actor}:${Math.floor(now / 60_000)}`;
	const dayKey = `rl:d:${actor}:${today()}`;
	const r = await redis([
		['INCR', minuteKey],
		['EXPIRE', minuteKey, 120],
		['INCR', dayKey],
		['EXPIRE', dayKey, 90_000]
	]);
	const m = r ? Number(r[0]) : localIncr(minuteKey, 120_000);
	const d = r ? Number(r[2]) : localIncr(dayKey, 90_000_000);
	if (perDay > 0 && d > perDay) {
		const midnight = new Date();
		midnight.setUTCHours(24, 0, 0, 0);
		return Math.max(1, Math.ceil((midnight.getTime() - now) / 1000));
	}
	if (perMinute > 0 && m > perMinute) return Math.max(1, 60 - new Date().getUTCSeconds());
	return null;
}

export async function spentToday(): Promise<number> {
	const r = await redis([['GET', `spend:${today()}`]]);
	return Number(r?.[0] ?? 0);
}

export async function addSpend(usd: number): Promise<void> {
	if (usd <= 0) return;
	const key = `spend:${today()}`;
	await redis([
		['INCRBYFLOAT', key, usd.toFixed(6)],
		['EXPIRE', key, 172_800]
	]);
}

const normalize = (q: string) => q.trim().toLowerCase().replace(/\s+/g, ' ');
const cacheKey = (pipeline: string, q: string) => `ans:${sha(`${pipeline}|${normalize(q)}`)}`;

export async function getCachedAnswer(pipeline: string, q: string): Promise<object | null> {
	const r = await redis([['GET', cacheKey(pipeline, q)]]);
	return typeof r?.[0] === 'string' ? (JSON.parse(r[0]) as object) : null;
}

export async function setCachedAnswer(
	pipeline: string,
	q: string,
	payload: unknown
): Promise<void> {
	await redis([['SET', cacheKey(pipeline, q), JSON.stringify(payload), 'EX', 604_800]]);
}

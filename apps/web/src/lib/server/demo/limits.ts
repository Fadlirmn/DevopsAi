// Rate limit, daily spend cap and answer cache for the serverless demo.
//
// Stored in Upstash Redis over its REST API (free tier, one click from the
// Vercel Marketplace): serverless instances share no memory, so a per-process
// counter could be bypassed by hitting different instances. Without Upstash
// env vars it falls back to per-instance memory and logs a warning — fine for
// local testing, weak in production (README).
import { createHash } from 'node:crypto';

const REST_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '';
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';
export const DURABLE = Boolean(REST_URL && REST_TOKEN);

type Cmd = (string | number)[];
const memory = new Map<string, { value: string; expires: number }>();
let warned = false;

function memExec(cmd: Cmd): unknown {
	const [op, key, ...args] = cmd.map(String);
	const now = Date.now();
	const hit = memory.get(key);
	const live = hit && hit.expires > now ? hit : undefined;
	switch (op) {
		case 'GET':
			return live?.value ?? null;
		case 'SET': {
			const ex = args.indexOf('EX');
			memory.set(key, {
				value: args[0],
				expires: ex >= 0 ? now + Number(args[ex + 1]) * 1000 : Infinity
			});
			return 'OK';
		}
		case 'INCR':
		case 'INCRBYFLOAT': {
			const next = Number(live?.value ?? 0) + (op === 'INCR' ? 1 : Number(args[0]));
			memory.set(key, { value: String(next), expires: live?.expires ?? Infinity });
			return next;
		}
		case 'EXPIRE':
			if (live) live.expires = now + Number(args[0]) * 1000;
			return 1;
		default:
			throw new Error(`unsupported ${op}`);
	}
}

async function exec(cmds: Cmd[]): Promise<unknown[]> {
	if (DURABLE) {
		try {
			const res = await fetch(`${REST_URL}/pipeline`, {
				method: 'POST',
				headers: { authorization: `Bearer ${REST_TOKEN}`, 'content-type': 'application/json' },
				body: JSON.stringify(cmds),
				signal: AbortSignal.timeout(3000)
			});
			const out = (await res.json()) as { result?: unknown; error?: string }[];
			if (res.ok && Array.isArray(out) && out.every((r) => !r.error))
				return out.map((r) => r.result);
			console.error('upstash error', res.status, JSON.stringify(out).slice(0, 200));
		} catch (e) {
			console.error('upstash unreachable', e);
		}
		// fall through: a Redis outage degrades to per-instance limits, never a dead demo
	} else if (!warned) {
		warned = true;
		console.warn(
			'[demo] UPSTASH_REDIS_REST_URL/TOKEN not set: rate limit and spend cap are per instance only'
		);
	}
	return cmds.map(memExec);
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const today = () => new Date().toISOString().slice(0, 10);

/** Count one request; null if allowed, else seconds until retry. */
export async function hitRateLimit(ip: string, salt: string, perMinute: number, perDay: number) {
	const actor = sha(`${salt}|${ip}`).slice(0, 32);
	const now = Date.now();
	const minuteKey = `rl:m:${actor}:${Math.floor(now / 60_000)}`;
	const dayKey = `rl:d:${actor}:${today()}`;
	const [m, , d] = (await exec([
		['INCR', minuteKey],
		['EXPIRE', minuteKey, 120],
		['INCR', dayKey],
		['EXPIRE', dayKey, 90_000]
	])) as number[];
	if (perDay > 0 && d > perDay) {
		const midnight = new Date();
		midnight.setUTCHours(24, 0, 0, 0);
		return Math.max(1, Math.ceil((midnight.getTime() - now) / 1000));
	}
	if (perMinute > 0 && m > perMinute) return Math.max(1, 60 - new Date().getUTCSeconds());
	return null;
}

export async function spentToday(): Promise<number> {
	const [v] = await exec([['GET', `spend:${today()}`]]);
	return Number(v ?? 0);
}

export async function addSpend(usd: number): Promise<void> {
	if (usd <= 0) return;
	const key = `spend:${today()}`;
	await exec([
		['INCRBYFLOAT', key, usd.toFixed(6)],
		['EXPIRE', key, 172_800]
	]);
}

const normalize = (q: string) => q.trim().toLowerCase().replace(/\s+/g, ' ');
const cacheKey = (pipeline: string, q: string) => `ans:${sha(`${pipeline}|${normalize(q)}`)}`;

export async function getCachedAnswer(pipeline: string, q: string): Promise<object | null> {
	const [v] = await exec([['GET', cacheKey(pipeline, q)]]);
	return typeof v === 'string' ? (JSON.parse(v) as object) : null;
}

export async function setCachedAnswer(
	pipeline: string,
	q: string,
	payload: unknown
): Promise<void> {
	await exec([['SET', cacheKey(pipeline, q), JSON.stringify(payload), 'EX', 604_800]]);
}

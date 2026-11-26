// Config for the serverless demo (Vercel without a VPS). Same variable names as
// the VPS RAG service, so one set of settings works for both.
//
// The model (provider, base URL, model, fallbacks, API key, prices) can also
// be set from the admin page ("API & Kunci"). That override lives in Upstash
// Redis (key encrypted, see secret.ts) and wins over env; each instance
// re-reads it every OVERRIDE_TTL_MS. Without it, or when it can't be used,
// env applies as before. Limits, effort and timeouts always come from env.
import { kvGet } from './limits';
import { decrypt } from './secret';

const env = (name: string): string | undefined => {
	const v = process.env[name];
	return v === undefined || v === '' ? undefined : v;
};
const num = (name: string, fallback: number | null): number | null => {
	const v = env(name);
	return v === undefined ? fallback : Number(v);
};

export type Provider = 'anthropic' | 'openai' | 'gemini' | 'openai-compatible';
export const PROVIDERS = new Set<Provider>(['anthropic', 'openai', 'gemini', 'openai-compatible']);

// USD per 1M tokens (input, output) for the daily spend cap.
const KNOWN_PRICES: Record<string, [number, number]> = {
	'claude-fable-5-2': [8, 40],
	'claude-opus-5-5': [4, 20],
	'claude-sonnet-5-5': [2, 10],
	'claude-haiku-5-5': [0.1, 0.5]
};

/** The part of the config the admin page can change. */
export type LlmSettings = {
	provider: Provider;
	model: string;
	/** Tried in order when the primary model is overloaded or not found (LLM_FALLBACK_MODEL, comma-separated). */
	fallbackModels: string[];
	apiKey: string | undefined;
	baseUrl: string | undefined;
	priceIn: number | null;
	priceOut: number | null;
};

export type DemoConfig = LlmSettings & {
	/** Where the LLM settings came from. */
	source: 'env' | 'web';
	effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
	timeoutMs: number;
	dailySpendCapUsd: number | null;
	perMinute: number;
	perDay: number;
	salt: string;
	minScore: number;
};

export const DEFAULT_MODEL: Record<string, string> = {
	anthropic: 'claude-haiku-5-5',
	gemini: 'gemini-flash-lite-latest'
};
// Maintained by Google, always pointing at the newest Lite / Flash release.
const GEMINI_ALIASES = ['gemini-flash-lite-latest', 'gemini-flash-latest'];

/** Model IDs never end in punctuation: forgive "gemini-3.6-flash." or stray spaces from copy-paste. */
export function cleanModel(v: string | undefined): string | undefined {
	const m = v?.trim().replace(/[.,;:\s]+$/, '');
	return m || undefined;
}

/** Adds the Gemini aliases, drops duplicates, blanks and the primary model. */
function withFallbacks(provider: Provider, model: string, list: (string | undefined)[]): string[] {
	return [
		...new Set([
			...list.map((m) => cleanModel(m)),
			...(provider === 'gemini' ? GEMINI_ALIASES : [])
		])
	].filter((m): m is string => Boolean(m) && m !== model);
}

const knownPrice = (provider: Provider, model: string) =>
	provider === 'anthropic' ? KNOWN_PRICES[model] : undefined;

let common: Omit<DemoConfig, keyof LlmSettings | 'source'> | undefined;
function commonConfig() {
	return (common ??= {
		effort: (env('LLM_EFFORT') ?? 'low') as DemoConfig['effort'],
		timeoutMs: (num('LLM_TIMEOUT_S', 25) ?? 25) * 1000,
		dailySpendCapUsd: num('DAILY_SPEND_CAP_USD', null),
		perMinute: num('RATE_LIMIT_PER_MINUTE', 10) ?? 10,
		perDay: num('RATE_LIMIT_PER_DAY', 100) ?? 100,
		salt: env('RATE_LIMIT_SALT') ?? env('RAG_API_KEY') ?? 'knowledgeops',
		// BM25 floor: below this the question is treated as off-topic, no answer call.
		minScore: num('DEMO_MIN_SCORE', 2) ?? 2
	});
}

let cached: DemoConfig | null | undefined;

/** From env only. null when LLM_PROVIDER is unset/mock. Throws on a half-set provider. */
export function envConfig(): DemoConfig | null {
	if (cached !== undefined) return cached;
	const provider = (env('LLM_PROVIDER') ?? 'mock').toLowerCase();
	if (!PROVIDERS.has(provider as Provider)) return (cached = null);
	const p = provider as Provider;

	// Cheapest tier by default: document Q&A doesn't need a big model.
	const model = cleanModel(env('LLM_MODEL')) ?? DEFAULT_MODEL[provider];
	if (!model) throw new Error(`LLM_MODEL wajib diisi untuk LLM_PROVIDER=${provider}`);
	const apiKey = env('LLM_API_KEY');
	if (p !== 'openai-compatible' && !apiKey)
		throw new Error(`LLM_API_KEY wajib diisi untuk LLM_PROVIDER=${provider}`);
	const baseUrl = env('LLM_BASE_URL');
	if (p === 'openai-compatible' && !baseUrl)
		throw new Error('LLM_BASE_URL wajib diisi untuk openai-compatible');

	const known = knownPrice(p, model);
	cached = {
		...commonConfig(),
		source: 'env',
		provider: p,
		model,
		// LLM_FALLBACK_MODEL first, then (Gemini) Google's own "latest" aliases,
		// cheapest first, so an overloaded or missing model never ends the demo.
		fallbackModels: withFallbacks(p, model, (env('LLM_FALLBACK_MODEL') ?? '').split(',')),
		apiKey,
		baseUrl,
		priceIn: num('LLM_PRICE_INPUT_PER_MTOK', known?.[0] ?? null),
		priceOut: num('LLM_PRICE_OUTPUT_PER_MTOK', known?.[1] ?? null)
	};
	return cached;
}

/** A full config from admin-page settings (limits etc. still from env). */
export function buildConfig(s: LlmSettings, source: DemoConfig['source'] = 'web'): DemoConfig {
	const known = knownPrice(s.provider, s.model);
	return {
		...commonConfig(),
		...s,
		source,
		fallbackModels: withFallbacks(s.provider, s.model, s.fallbackModels),
		priceIn: s.priceIn ?? known?.[0] ?? null,
		priceOut: s.priceOut ?? known?.[1] ?? null
	};
}

// --- Override saved from the admin page -------------------------------------

export const OVERRIDE_KEY = 'settings:llm';
const OVERRIDE_TTL_MS = 30_000;

/** What Redis holds. The API key is sealed (secret.ts); the browser sees last4 only. */
export type StoredOverride = {
	preset: string;
	provider: Provider;
	baseUrl: string | null;
	model: string;
	fallbackModels: string[];
	/** web: sealed in apiKeySealed. env: reuse LLM_API_KEY. none: keyless server. */
	apiKeySource: 'web' | 'env' | 'none';
	apiKeySealed: string | null;
	apiKeyLast4: string | null;
	priceIn: number | null;
	priceOut: number | null;
	updatedAt: string;
	updatedBy: string | null;
};

let override: { at: number; value: StoredOverride | null } | null = null;

/** Saved override, cached per instance. Redis down: last known value, else none. */
export async function loadOverride(fresh = false): Promise<StoredOverride | null> {
	if (!fresh && override && Date.now() - override.at < OVERRIDE_TTL_MS) return override.value;
	const raw = await kvGet(OVERRIDE_KEY);
	if (raw === undefined) return override?.value ?? null;
	let value: StoredOverride | null = null;
	try {
		value = raw ? (JSON.parse(raw) as StoredOverride) : null;
	} catch {
		console.error('[settings] unreadable override in Redis, using env');
	}
	override = { at: Date.now(), value };
	return value;
}

/** After a save/reset on this instance, so it applies here immediately. */
export function setOverrideCache(value: StoredOverride | null) {
	override = { at: Date.now(), value };
}

/** Turns a stored override into a config; `error` when its key can't be opened. */
export function overrideConfig(o: StoredOverride): {
	config: DemoConfig | null;
	error: string | null;
} {
	let apiKey: string | undefined;
	if (o.apiKeySource === 'env') apiKey = env('LLM_API_KEY');
	else if (o.apiKeySealed) {
		const k = decrypt(o.apiKeySealed);
		if (k === null)
			return {
				config: null,
				error: 'API key dari web tidak bisa dibuka (SETTINGS_SECRET kosong/berubah) — simpan ulang'
			};
		apiKey = k;
	}
	return {
		config: buildConfig({
			provider: o.provider,
			model: o.model,
			fallbackModels: o.fallbackModels,
			apiKey,
			baseUrl: o.baseUrl ?? undefined,
			priceIn: o.priceIn,
			priceOut: o.priceOut
		}),
		error: null
	};
}

/** The config /chat uses: the admin-page override when usable, else env. */
export async function demoConfig(): Promise<DemoConfig | null> {
	const o = await loadOverride();
	if (o) {
		const { config, error } = overrideConfig(o);
		if (config) return config;
		console.error(`[settings] ${error}; using env`);
	}
	return envConfig();
}

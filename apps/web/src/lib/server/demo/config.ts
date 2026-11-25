// Env for the serverless demo (Vercel without a VPS). Same variable names as
// the VPS RAG service, so one set of settings works for both.

const env = (name: string): string | undefined => {
	const v = process.env[name];
	return v === undefined || v === '' ? undefined : v;
};
const num = (name: string, fallback: number | null): number | null => {
	const v = env(name);
	return v === undefined ? fallback : Number(v);
};

export type Provider = 'anthropic' | 'openai' | 'gemini' | 'openai-compatible';
const PROVIDERS = new Set<Provider>(['anthropic', 'openai', 'gemini', 'openai-compatible']);

// USD per 1M tokens (input, output) for the daily spend cap.
const KNOWN_PRICES: Record<string, [number, number]> = {
	'claude-fable-5-2': [8, 40],
	'claude-opus-5-5': [4, 20],
	'claude-sonnet-5-5': [2, 10],
	'claude-haiku-5-5': [0.1, 0.5]
};

export type DemoConfig = {
	provider: Provider;
	model: string;
	/** Tried in order when the primary model is overloaded or not found (LLM_FALLBACK_MODEL, comma-separated). */
	fallbackModels: string[];
	apiKey: string | undefined;
	baseUrl: string | undefined;
	effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
	timeoutMs: number;
	priceIn: number | null;
	priceOut: number | null;
	dailySpendCapUsd: number | null;
	perMinute: number;
	perDay: number;
	salt: string;
	minScore: number;
};

const DEFAULT_MODEL: Record<string, string> = {
	anthropic: 'claude-haiku-5-5',
	gemini: 'gemini-flash-lite-latest'
};
// Maintained by Google, always pointing at the newest Lite / Flash release.
const GEMINI_ALIASES = ['gemini-flash-lite-latest', 'gemini-flash-latest'];

/** Model IDs never end in punctuation: forgive "gemini-3.6-flash." or stray spaces from copy-paste. */
function cleanModel(v: string | undefined): string | undefined {
	const m = v?.trim().replace(/[.,;:\s]+$/, '');
	return m || undefined;
}

let cached: DemoConfig | null | undefined;

/** null when LLM_PROVIDER is unset/mock — the serverless demo is then off. */
export function demoConfig(): DemoConfig | null {
	if (cached !== undefined) return cached;
	const provider = (env('LLM_PROVIDER') ?? 'mock').toLowerCase();
	if (!PROVIDERS.has(provider as Provider)) return (cached = null);

	// Cheapest tier by default: document Q&A doesn't need a big model.
	const model = cleanModel(env('LLM_MODEL')) ?? DEFAULT_MODEL[provider];
	if (!model) throw new Error(`LLM_MODEL wajib diisi untuk LLM_PROVIDER=${provider}`);
	const apiKey = env('LLM_API_KEY');
	if (provider !== 'openai-compatible' && !apiKey)
		throw new Error(`LLM_API_KEY wajib diisi untuk LLM_PROVIDER=${provider}`);
	const baseUrl = env('LLM_BASE_URL');
	if (provider === 'openai-compatible' && !baseUrl)
		throw new Error('LLM_BASE_URL wajib diisi untuk openai-compatible');

	const known = provider === 'anthropic' ? KNOWN_PRICES[model] : undefined;
	cached = {
		provider: provider as Provider,
		model,
		// LLM_FALLBACK_MODEL first, then (Gemini) Google's own "latest" aliases,
		// cheapest first, so an overloaded or missing model never ends the demo.
		fallbackModels: [
			...new Set([
				...(env('LLM_FALLBACK_MODEL') ?? '').split(',').map((m) => cleanModel(m)),
				...(provider === 'gemini' ? GEMINI_ALIASES : [])
			])
		].filter((m): m is string => Boolean(m) && m !== model),
		apiKey,
		baseUrl,
		effort: (env('LLM_EFFORT') ?? 'low') as DemoConfig['effort'],
		timeoutMs: (num('LLM_TIMEOUT_S', 25) ?? 25) * 1000,
		priceIn: num('LLM_PRICE_INPUT_PER_MTOK', known?.[0] ?? null),
		priceOut: num('LLM_PRICE_OUTPUT_PER_MTOK', known?.[1] ?? null),
		dailySpendCapUsd: num('DAILY_SPEND_CAP_USD', null),
		perMinute: num('RATE_LIMIT_PER_MINUTE', 10) ?? 10,
		perDay: num('RATE_LIMIT_PER_DAY', 100) ?? 100,
		salt: env('RATE_LIMIT_SALT') ?? env('RAG_API_KEY') ?? 'knowledgeops',
		// BM25 floor: below this the question is treated as off-topic, no answer call.
		minScore: num('DEMO_MIN_SCORE', 2) ?? 2
	};
	return cached;
}

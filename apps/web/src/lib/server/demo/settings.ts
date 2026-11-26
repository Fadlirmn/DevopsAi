// Admin /settings for the serverless demo (no VPS): the same shape as the RAG
// service's /admin/settings, built from the active config plus live checks,
// so the admin pages show the AI and Redis that actually serve /chat.
// Also saves / resets the model chosen on the "API & Kunci" page.
import {
	OVERRIDE_KEY,
	PROVIDERS,
	buildConfig,
	cleanModel,
	demoConfig,
	envConfig,
	loadOverride,
	overrideConfig,
	setOverrideCache,
	type DemoConfig,
	type Provider,
	type StoredOverride
} from './config';
import { TOP_K } from './chat';
import { checkModels, type ModelCheck } from './providers';
import { REDIS_CONFIGURED, kvDel, kvSet, redisHost, redisStatus, spentToday } from './limits';
import { SECRET_CONFIGURED, encrypt } from './secret';
import { presetById, presetFor } from '../../llm-presets';

const last4 = (k: string | undefined) => (k ? k.slice(-4) : null);

function safeEnvConfig(): { config: DemoConfig | null; error: string | null } {
	try {
		return { config: envConfig(), error: null };
	} catch (e) {
		return { config: null, error: e instanceof Error ? e.message : String(e) };
	}
}

/** true when env or the admin page names a real provider, even if misconfigured. */
export async function serverlessConfigured(): Promise<boolean> {
	const env = safeEnvConfig();
	return Boolean(env.config || env.error || (await loadOverride()));
}

/** Why the model can't be changed from the web, or null when it can. */
function editBlocker(): string | null {
	if (!REDIS_CONFIGURED) return 'Upstash Redis belum diatur (KV_REST_API_URL / KV_REST_API_TOKEN)';
	if (!SECRET_CONFIGURED)
		return 'Tambah env SETTINGS_SECRET di Vercel (acak, min. 16 karakter, mis. `openssl rand -base64 32`) lalu redeploy';
	return null;
}

/** `test`: also ask the provider whether the key sees each model (free, no tokens). */
export async function serverlessSettings(test: boolean) {
	const env = safeEnvConfig();
	const o = await loadOverride(true);
	const fromWeb = o ? overrideConfig(o) : null;
	let c: DemoConfig | null;
	let configError: string | null = null;
	try {
		c = await demoConfig();
	} catch (e) {
		c = null;
		configError = e instanceof Error ? e.message : String(e);
	}
	const [redis, spent, checks] = await Promise.all([
		redisStatus(),
		spentToday(),
		c && test ? checkModels(c) : Promise.resolve<ModelCheck[] | null>(null)
	]);

	let llm: string;
	if (configError) llm = `error: ${configError}`;
	else if (!c) llm = 'not configured';
	else if (!checks) llm = `configured: ${c.provider} / ${c.model}`;
	else if (checks.some((x) => x.ok))
		llm = `configured: ${c.provider} / ${checks.find((x) => x.ok)!.model}`;
	else llm = `error: ${checks.map((x) => `${x.model}: ${x.reason}`).join(', ')}`;

	const preset = o?.preset ?? (c ? presetFor(c.provider, c.baseUrl).id : null);
	return {
		mode: 'serverless' as const,
		pipelineVersion: 'demo-v1',
		modelId: c ? `${c.provider}:${c.model}` : null,
		llmProvider: c?.provider ?? process.env.LLM_PROVIDER ?? null,
		llmModel: c?.model ?? null,
		llmSource: c?.source ?? null,
		llmPreset: preset,
		llmBaseUrl: c?.baseUrl ?? null,
		apiKeyLast4: last4(c?.apiKey),
		fallbackModels: c?.fallbackModels ?? [],
		priceIn: c?.priceIn ?? null,
		priceOut: c?.priceOut ?? null,
		embeddingProvider: 'bm25',
		embeddingModel: 'NIST SP 800-61r2 bawaan',
		retrievalTopK: TOP_K,
		similarityThreshold: null,
		rateLimit: c ? { perMinute: c.perMinute, perDay: c.perDay } : null,
		dailySpendCapUsd: c?.dailySpendCapUsd ?? null,
		spentTodayUsd: Math.round(spent * 10_000) / 10_000,
		priceKnown: c ? c.priceIn !== null && c.priceOut !== null : false,
		staleEmbeddingVersions: 0,
		redis: { status: redis, host: redisHost() },
		modelChecks: checks,
		/** Saved from the web (key never included, only its last 4). */
		override: o
			? {
					preset: o.preset,
					model: o.model,
					fallbackModels: o.fallbackModels,
					baseUrl: o.baseUrl,
					apiKeySource: o.apiKeySource,
					apiKeyLast4: o.apiKeyLast4,
					priceIn: o.priceIn,
					priceOut: o.priceOut,
					updatedAt: o.updatedAt,
					updatedBy: o.updatedBy,
					error: fromWeb?.error ?? null
				}
			: null,
		envLlm: env.config
			? {
					provider: env.config.provider,
					model: env.config.model,
					baseUrl: env.config.baseUrl ?? null
				}
			: null,
		envError: env.error,
		editBlocker: editBlocker(),
		healthChecks: [
			{ name: 'LLM provider', status: llm },
			{ name: 'Upstash Redis', status: redis }
		]
	};
}

// --- Save / reset from the admin page ----------------------------------------

export type SaveResult =
	{ ok: true; checks: ModelCheck[] } | { ok: false; error: string; checks?: ModelCheck[] };

const MODEL_RE = /^[\w.:/@+-]{1,200}$/;

function price(v: unknown): number | null | 'bad' {
	if (v === null || v === undefined || v === '') return null;
	const n = Number(v);
	return Number.isFinite(n) && n >= 0 && n < 10_000 ? n : 'bad';
}

/** Validates, checks the model with the provider, then stores it. Nothing is saved on failure. */
export async function saveLlmSettings(
	input: unknown,
	adminEmail: string | null
): Promise<SaveResult> {
	const blocker = editBlocker();
	if (blocker) return { ok: false, error: blocker };
	const b = (input ?? {}) as Record<string, unknown>;
	const str = (k: string) => {
		const v = b[k];
		return typeof v === 'string' ? v.trim() : '';
	};

	const preset = presetById(str('preset'));
	if (!preset || !PROVIDERS.has(preset.provider))
		return { ok: false, error: 'Provider tidak dikenal' };
	const provider: Provider = preset.provider;

	// Fixed presets ignore whatever base URL the browser sent.
	let baseUrl: string | null = preset.baseUrl;
	if (preset.id === 'custom') {
		const raw = str('baseUrl').replace(/\/+$/, '');
		let u: URL | null = null;
		try {
			u = new URL(raw);
		} catch {
			// handled below
		}
		if (!u || u.protocol !== 'https:' || u.username || u.password)
			return {
				ok: false,
				error: 'Base URL harus https://… (server ini jalan di Vercel, bukan localhost)'
			};
		baseUrl = raw;
	}

	const model = cleanModel(str('model')) ?? preset.defaultModel ?? '';
	if (!MODEL_RE.test(model)) return { ok: false, error: 'Nama model wajib diisi (tanpa spasi)' };
	const fallbackModels = str('fallbackModels')
		.split(',')
		.map((m) => cleanModel(m))
		.filter((m): m is string => Boolean(m) && m !== model);
	if (fallbackModels.length > 5) return { ok: false, error: 'Maksimal 5 model cadangan' };
	if (fallbackModels.some((m) => !MODEL_RE.test(m)))
		return { ok: false, error: 'Nama model cadangan tidak valid' };

	const priceIn = price(b.priceIn);
	const priceOut = price(b.priceOut);
	if (priceIn === 'bad' || priceOut === 'bad')
		return { ok: false, error: 'Harga harus angka ≥ 0 (USD per 1M token)' };

	// The key: newly typed, else the one already saved for this same provider,
	// else LLM_API_KEY from env when env points at the same provider.
	const typed = str('apiKey');
	if (typed.length > 500 || /\s/.test(typed)) return { ok: false, error: 'API key tidak valid' };
	const current = await loadOverride(true);
	const env = safeEnvConfig().config;
	const sameAs = (p: Provider, u: string | null | undefined) =>
		p === provider && (u || null) === baseUrl;
	let apiKey: string | undefined;
	let apiKeySource: StoredOverride['apiKeySource'];
	let apiKeySealed: string | null = null;
	if (typed) {
		apiKey = typed;
		apiKeySource = 'web';
		apiKeySealed = encrypt(typed);
	} else if (
		current &&
		sameAs(current.provider, current.baseUrl) &&
		current.apiKeySource !== 'none'
	) {
		const prev = overrideConfig(current);
		if (!prev.config)
			return { ok: false, error: 'API key lama tidak bisa dibuka — isi ulang key-nya' };
		apiKey = prev.config.apiKey;
		apiKeySource = current.apiKeySource;
		apiKeySealed = current.apiKeySealed;
	} else if (env?.apiKey && sameAs(env.provider, env.baseUrl)) {
		apiKey = env.apiKey;
		apiKeySource = 'env';
	} else if (preset.keyRequired) {
		return { ok: false, error: `API key ${preset.label} wajib diisi` };
	} else {
		apiKeySource = 'none';
	}

	// Must work before it replaces what /chat uses now.
	const candidate = buildConfig({
		provider,
		model,
		fallbackModels,
		apiKey,
		baseUrl: baseUrl ?? undefined,
		priceIn,
		priceOut
	});
	const checks = await checkModels(candidate);
	const primary = checks.find((x) => x.model === model);
	if (!primary?.ok)
		return {
			ok: false,
			error: `Model ${model}: ${primary?.reason ?? 'gagal dicek'} — tidak disimpan`,
			checks
		};

	const stored: StoredOverride = {
		preset: preset.id,
		provider,
		baseUrl,
		model,
		fallbackModels,
		apiKeySource,
		apiKeySealed,
		apiKeyLast4: last4(apiKey),
		priceIn,
		priceOut,
		updatedAt: new Date().toISOString(),
		updatedBy: adminEmail
	};
	if (!(await kvSet(OVERRIDE_KEY, JSON.stringify(stored))))
		return { ok: false, error: 'Gagal menyimpan ke Redis — coba lagi', checks };
	setOverrideCache(stored);
	console.info(`[settings] model set from web by ${adminEmail ?? '?'}: ${provider} / ${model}`);
	return { ok: true, checks };
}

/** Back to env. */
export async function resetLlmSettings(adminEmail: string | null): Promise<boolean> {
	if (!(await kvDel(OVERRIDE_KEY))) return false;
	setOverrideCache(null);
	console.info(`[settings] model reset to env by ${adminEmail ?? '?'}`);
	return true;
}

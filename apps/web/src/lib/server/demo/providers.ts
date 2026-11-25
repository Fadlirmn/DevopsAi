// LLM calls for the serverless demo, through each provider's official SDK.
// One entry point: complete(system, user, json?) -> text + token usage.
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { ApiError, GoogleGenAI } from '@google/genai';
import { ANSWER_SCHEMA } from './grounding';
import type { DemoConfig } from './config';

export class ProviderError extends Error {
	constructor(
		public reason: string,
		message = reason
	) {
		super(message);
	}
}

export type Completion = {
	text: string;
	inputTokens: number;
	outputTokens: number;
	refused: boolean;
};

// Models that accept the server-side refusal fallback (`fallbacks: "default"`).
const FALLBACK_MODELS = new Set([
	'claude-fable-5-2',
	'claude-fable-5-1',
	'claude-opus-5-5',
	'claude-opus-5',
	'claude-sonnet-5-5'
]);

let anthropic: Anthropic | null = null;
let openai: OpenAI | null = null;
let gemini: GoogleGenAI | null = null;

async function viaAnthropic(
	c: DemoConfig,
	system: string,
	user: string,
	json: boolean
): Promise<Completion> {
	anthropic ??= new Anthropic({ apiKey: c.apiKey, timeout: c.timeoutMs, maxRetries: 2 });
	try {
		// Beta endpoint so the refusal fallback can be attached on models that take it.
		const response = await anthropic.beta.messages.create({
			model: c.model,
			max_tokens: 16000,
			system,
			messages: [{ role: 'user', content: user }],
			output_config: {
				effort: c.effort,
				...(json ? { format: { type: 'json_schema', schema: ANSWER_SCHEMA } } : {})
			},
			...(FALLBACK_MODELS.has(c.model)
				? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
				: {})
		});
		const text = response.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
		if (response.stop_reason === 'max_tokens') throw new ProviderError('truncated');
		return {
			text,
			inputTokens: response.usage.input_tokens ?? 0,
			outputTokens: response.usage.output_tokens ?? 0,
			refused: response.stop_reason === 'refusal'
		};
	} catch (e) {
		if (e instanceof ProviderError) throw e;
		if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError)
			throw new ProviderError('auth', e.message);
		if (e instanceof Anthropic.RateLimitError) throw new ProviderError('overloaded', e.message);
		if (e instanceof Anthropic.BadRequestError) throw new ProviderError('bad_request', e.message);
		if (e instanceof Anthropic.APIConnectionError) throw new ProviderError('network', e.message);
		if (e instanceof Anthropic.APIError)
			throw new ProviderError(Number(e.status) >= 500 ? 'overloaded' : 'upstream', e.message);
		throw e;
	}
}

async function viaOpenAI(
	c: DemoConfig,
	system: string,
	user: string,
	json: boolean
): Promise<Completion> {
	const compatible = c.provider === 'openai-compatible';
	// Local servers like Ollama ignore the key but the SDK requires a value.
	openai ??= new OpenAI({
		apiKey: c.apiKey ?? 'not-needed',
		baseURL: c.baseUrl,
		timeout: c.timeoutMs,
		maxRetries: 2
	});
	try {
		const resp = await openai.chat.completions.create({
			model: c.model,
			messages: [
				{ role: 'system', content: system },
				{ role: 'user', content: user }
			],
			...(json
				? compatible
					? { response_format: { type: 'json_object' as const } }
					: {
							response_format: {
								type: 'json_schema' as const,
								json_schema: { name: 'grounded_answer', schema: ANSWER_SCHEMA, strict: true }
							}
						}
				: {}),
			...(compatible ? { max_tokens: 2048 } : { max_completion_tokens: 4096 })
		});
		const choice = resp.choices[0];
		if (!choice || choice.finish_reason === 'length') throw new ProviderError('truncated');
		return {
			text: choice.message.content ?? '',
			inputTokens: resp.usage?.prompt_tokens ?? 0,
			outputTokens: resp.usage?.completion_tokens ?? 0,
			refused: Boolean(choice.message.refusal)
		};
	} catch (e) {
		if (e instanceof ProviderError) throw e;
		if (e instanceof OpenAI.AuthenticationError) throw new ProviderError('auth', e.message);
		if (e instanceof OpenAI.RateLimitError) throw new ProviderError('overloaded', e.message);
		if (e instanceof OpenAI.BadRequestError) throw new ProviderError('bad_request', e.message);
		if (e instanceof OpenAI.APIConnectionError) throw new ProviderError('network', e.message);
		if (e instanceof OpenAI.APIError)
			throw new ProviderError(Number(e.status) >= 500 ? 'overloaded' : 'upstream', e.message);
		throw e;
	}
}

async function viaGemini(
	c: DemoConfig,
	system: string,
	user: string,
	json: boolean
): Promise<Completion> {
	// The SDK only retries when retryOptions is set. 503 "high demand" spikes
	// are common and short, so retry with backoff (~1 s, 2 s) before giving up.
	gemini ??= new GoogleGenAI({
		apiKey: c.apiKey,
		httpOptions: {
			timeout: c.timeoutMs,
			retryOptions: { attempts: 3, initialDelay: 1, maxDelay: 4 },
			...(c.baseUrl ? { baseUrl: c.baseUrl } : {}) // optional proxy
		}
	});
	try {
		const resp = await gemini.models.generateContent({
			model: c.model,
			contents: user,
			config: {
				systemInstruction: system,
				// Thinking tokens count against this limit on Gemini 3.x; a tight
				// cap can end the turn before any answer text is written.
				maxOutputTokens: 16384,
				...(json ? { responseMimeType: 'application/json', responseJsonSchema: ANSWER_SCHEMA } : {})
			}
		});
		const finish = String(resp.candidates?.[0]?.finishReason ?? '');
		if (finish === 'MAX_TOKENS') throw new ProviderError('truncated');
		const meta = resp.usageMetadata;
		return {
			text: resp.text ?? '',
			inputTokens: meta?.promptTokenCount ?? 0,
			// Billed output includes thinking tokens.
			outputTokens: (meta?.candidatesTokenCount ?? 0) + (meta?.thoughtsTokenCount ?? 0),
			refused: finish === 'SAFETY' || finish === 'PROHIBITED_CONTENT' || !resp.candidates?.length
		};
	} catch (e) {
		if (e instanceof ProviderError) throw e;
		const status = e instanceof ApiError ? e.status : 0;
		const msg = e instanceof Error ? e.message : String(e);
		throw new ProviderError(
			status === 429 || status >= 500 ? 'overloaded' : status === 404 ? 'not_found' : 'upstream',
			msg
		);
	}
}

function once(c: DemoConfig, system: string, user: string, json: boolean): Promise<Completion> {
	if (c.provider === 'anthropic') return viaAnthropic(c, system, user, json);
	if (c.provider === 'gemini') return viaGemini(c, system, user, json);
	return viaOpenAI(c, system, user, json);
}

let discovered: Promise<string[]> | null = null;

/**
 * Gemini only: the "Flash" (mid-tier) text models this API key can call,
 * newest first. Excludes Pro/Lite and preview/image/audio/TTS/live variants.
 * Looked up once per instance, only when every configured model failed.
 */
function discoverGeminiFlash(c: DemoConfig): Promise<string[]> {
	discovered ??= (async () => {
		gemini ??= new GoogleGenAI({ apiKey: c.apiKey, httpOptions: { timeout: c.timeoutMs } });
		const names: string[] = [];
		for await (const m of await gemini.models.list({ config: { pageSize: 100 } })) {
			const id = (m.name ?? '').replace(/^models\//, '');
			if (
				m.supportedActions?.includes('generateContent') &&
				/^gemini-[\d.]+-flash$/.test(id) // exactly "gemini-<version>-flash"
			)
				names.push(id);
		}
		const version = (id: string) =>
			id
				.match(/[\d.]+/)?.[0]
				.split('.')
				.map(Number) ?? [0];
		return names.sort((a, b) => {
			const [va, vb] = [version(a), version(b)];
			for (let i = 0; i < Math.max(va.length, vb.length); i++)
				if ((vb[i] ?? 0) !== (va[i] ?? 0)) return (vb[i] ?? 0) - (va[i] ?? 0);
			return 0;
		});
	})().catch((e: unknown) => {
		discovered = null; // retry the lookup next time
		console.warn('[demo] model discovery failed:', e instanceof Error ? e.message : e);
		return [];
	});
	return discovered;
}

/**
 * The SDKs retry transient errors themselves. If the model is still
 * overloaded (or doesn't exist), walk the fallbacks: LLM_FALLBACK_MODEL in
 * order, then — Gemini only — up to two discovered Flash models.
 */
// Circuit breaker (per instance): a model that just failed as overloaded or
// missing is skipped for a minute, and the last model that worked is tried
// first, so step 2 of a question — and the next visitors — don't pay the
// retry delays again.
const COOL_DOWN_MS = 60_000;
const sickUntil = new Map<string, number>();
let lastGood: string | null = null;

export async function complete(
	c: DemoConfig,
	system: string,
	user: string,
	json: boolean
): Promise<Completion> {
	const tried: string[] = [];
	let lastError: unknown;
	const attempt = async (model: string, force = false): Promise<Completion | null> => {
		if (tried.includes(model)) return null;
		if (!force && (sickUntil.get(model) ?? 0) > Date.now()) return null;
		tried.push(model);
		try {
			const r = await once({ ...c, model }, system, user, json);
			sickUntil.delete(model);
			lastGood = model;
			return r;
		} catch (e) {
			if (!(e instanceof ProviderError) || (e.reason !== 'overloaded' && e.reason !== 'not_found'))
				throw e;
			console.warn(`[demo] ${model} ${e.reason}, trying next model`);
			sickUntil.set(
				model,
				Date.now() + (e.reason === 'not_found' ? 10 * COOL_DOWN_MS : COOL_DOWN_MS)
			);
			lastError = e;
			return null;
		}
	};

	const configured = [c.model, ...c.fallbackModels];
	const order = lastGood && lastGood !== c.model ? [lastGood, ...configured] : configured;
	for (const model of order) {
		const r = await attempt(model);
		if (r) return r;
	}
	if (c.provider === 'gemini') {
		let extra = 0;
		for (const model of await discoverGeminiFlash(c)) {
			if (tried.includes(model) || (sickUntil.get(model) ?? 0) > Date.now()) continue;
			if (extra++ >= 2) break;
			const r = await attempt(model);
			if (r) return r;
		}
	}
	// Everything is cooling down: give the primary one real try rather than none.
	if (!tried.length) {
		const r = await attempt(c.model, true);
		if (r) return r;
	}
	throw lastError;
}

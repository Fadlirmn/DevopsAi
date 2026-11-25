// LLM calls for the serverless demo, through each provider's official SDK.
// One entry point: complete(system, user, json, deadline) -> text + usage.
//
// Everything is bounded by `deadline` (epoch ms): Vercel kills the function
// at maxDuration, so per-call timeouts and SDK retries are sized from the
// time actually left, and fallbacks stop before the platform cuts us off.
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { ApiError, GoogleGenAI, ThinkingLevel } from '@google/genai';
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

/** Per-call limits derived from the time left. */
type Budget = { timeoutMs: number; retries: number };

const MIN_CALL_MS = 4_000; // below this a call can't realistically finish

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
	json: boolean,
	b: Budget
): Promise<Completion> {
	anthropic ??= new Anthropic({ apiKey: c.apiKey });
	try {
		// Beta endpoint so the refusal fallback can be attached on models that take it.
		const response = await anthropic.beta.messages.create(
			{
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
			},
			{ timeout: b.timeoutMs, maxRetries: b.retries }
		);
		const text = response.content.map((x) => (x.type === 'text' ? x.text : '')).join('');
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
		if (e instanceof Anthropic.NotFoundError) throw new ProviderError('not_found', e.message);
		if (e instanceof Anthropic.BadRequestError) throw new ProviderError('bad_request', e.message);
		if (e instanceof Anthropic.APIConnectionTimeoutError)
			throw new ProviderError('timeout', e.message);
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
	json: boolean,
	b: Budget
): Promise<Completion> {
	const compatible = c.provider === 'openai-compatible';
	// Local servers like Ollama ignore the key but the SDK requires a value.
	openai ??= new OpenAI({ apiKey: c.apiKey ?? 'not-needed', baseURL: c.baseUrl });
	try {
		const resp = await openai.chat.completions.create(
			{
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
			},
			{ timeout: b.timeoutMs, maxRetries: b.retries }
		);
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
		if (e instanceof OpenAI.NotFoundError) throw new ProviderError('not_found', e.message);
		if (e instanceof OpenAI.BadRequestError) throw new ProviderError('bad_request', e.message);
		if (e instanceof OpenAI.APIConnectionTimeoutError)
			throw new ProviderError('timeout', e.message);
		if (e instanceof OpenAI.APIConnectionError) throw new ProviderError('network', e.message);
		if (e instanceof OpenAI.APIError)
			throw new ProviderError(Number(e.status) >= 500 ? 'overloaded' : 'upstream', e.message);
		throw e;
	}
}

/** v1beta: some models (e.g. gemini-2.5-flash) reject systemInstruction on the
 * SDK's default v1 ("Developer instruction is not enabled for api version v1"). */
function geminiClient(c: DemoConfig): GoogleGenAI {
	return new GoogleGenAI({
		apiKey: c.apiKey,
		apiVersion: 'v1beta',
		...(c.baseUrl ? { httpOptions: { baseUrl: c.baseUrl } } : {}) // optional proxy
	});
}

/** Gemini 3.x takes thinkingLevel, 2.x a thinkingBudget; unknown ids get neither. */
function geminiThinking(model: string) {
	const major = Number(model.match(/^gemini-(\d+)/)?.[1] ?? NaN);
	if (major >= 3) return { thinkingLevel: ThinkingLevel.LOW };
	if (major === 2) return { thinkingBudget: 0 };
	return undefined;
}

async function viaGemini(
	c: DemoConfig,
	system: string,
	user: string,
	json: boolean,
	b: Budget,
	thinking = true
): Promise<Completion> {
	gemini ??= geminiClient(c);
	const thinkingConfig = thinking ? geminiThinking(c.model) : undefined;
	try {
		const resp = await gemini.models.generateContent({
			model: c.model,
			contents: user,
			config: {
				systemInstruction: system,
				// Thinking tokens count against this limit on Gemini 3.x; a tight
				// cap can end the turn before any answer text is written.
				maxOutputTokens: 16384,
				// Document Q&A doesn't need long reasoning: low thinking is much faster.
				...(thinkingConfig ? { thinkingConfig } : {}),
				...(json
					? { responseMimeType: 'application/json', responseJsonSchema: ANSWER_SCHEMA }
					: {}),
				// The SDK only retries when retryOptions is set; 503 "high demand"
				// spikes are short. `timeout` applies per attempt.
				httpOptions: {
					timeout: b.timeoutMs,
					retryOptions: { attempts: b.retries + 1, initialDelay: 1, maxDelay: 2 }
				}
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
		// A model that rejects the thinking setting: retry once without it.
		if (status === 400 && thinkingConfig && /think/i.test(msg))
			return viaGemini(c, system, user, json, b, false);
		// 429 is either a quota/billing limit on this key or a temporary rate spike.
		if (status === 429)
			throw new ProviderError(/quota|billing/i.test(msg) ? 'quota' : 'overloaded', msg);
		if (status >= 500) throw new ProviderError('overloaded', msg);
		if (status === 404) throw new ProviderError('not_found', msg);
		if (status === 401 || status === 403) throw new ProviderError('auth', msg);
		if (status === 400) throw new ProviderError('bad_request', msg);
		// No HTTP status: aborted by our timeout, or a network failure.
		throw new ProviderError(/abort|timeout|timed out/i.test(msg) ? 'timeout' : 'network', msg);
	}
}

function once(
	c: DemoConfig,
	system: string,
	user: string,
	json: boolean,
	b: Budget
): Promise<Completion> {
	if (c.provider === 'anthropic') return viaAnthropic(c, system, user, json, b);
	if (c.provider === 'gemini') return viaGemini(c, system, user, json, b);
	return viaOpenAI(c, system, user, json, b);
}

// Circuit breaker (per instance): a model that just failed as overloaded,
// slow or missing is skipped for a while, and the last model that worked is
// tried first, so step 2 of a question — and the next visitors — don't pay
// the same delays again.
const COOL_DOWN_MS = 60_000;
const sickUntil = new Map<string, number>();
let lastGood: string | null = null;
const FALLBACK_REASONS = new Set(['overloaded', 'quota', 'not_found', 'timeout']);
// How long a failing model is skipped: quota and missing models don't recover in a minute.
const coolDown = (reason: string) =>
	reason === 'not_found' || reason === 'quota' ? 10 * COOL_DOWN_MS : COOL_DOWN_MS;

/** Try the configured model, then the fallbacks in order, all within `deadline`. */
export async function complete(
	c: DemoConfig,
	system: string,
	user: string,
	json: boolean,
	deadline: number
): Promise<Completion> {
	const tried: string[] = [];
	let lastError: unknown = new ProviderError('timeout', 'no time left for an AI call');
	const left = () => deadline - Date.now();

	const attempt = async (model: string, force = false): Promise<Completion | null> => {
		if (tried.includes(model) || left() < MIN_CALL_MS) return null;
		if (!force && (sickUntil.get(model) ?? 0) > Date.now()) return null;
		tried.push(model);
		const remaining = left() - 500;
		// A model may use at most half of what's left (all of it only on the
		// forced last try), so a slow model can't starve the fallbacks. Within
		// that share: one quick retry (for 503 spikes) only if two attempts fit.
		const share = force ? remaining : Math.max(MIN_CALL_MS, Math.floor(remaining / 2));
		const retries = share >= 2 * Math.min(c.timeoutMs, 12_000) ? 1 : 0;
		const budget = {
			timeoutMs: Math.min(c.timeoutMs, Math.floor(share / (retries + 1))),
			retries
		};
		try {
			const r = await once({ ...c, model }, system, user, json, budget);
			sickUntil.delete(model);
			lastGood = model;
			return r;
		} catch (e) {
			if (!(e instanceof ProviderError) || !FALLBACK_REASONS.has(e.reason)) throw e;
			console.warn(
				`[demo] ${model} ${e.reason}, trying next model (${Math.round(left() / 1000)}s left)`
			);
			sickUntil.set(model, Date.now() + coolDown(e.reason));
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
	// Everything is cooling down: give the primary one real try rather than none.
	if (!tried.length) {
		const r = await attempt(c.model, true);
		if (r) return r;
	}
	throw lastError;
}

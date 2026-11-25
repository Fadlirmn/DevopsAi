// LLM calls for the serverless demo, through each provider's official SDK.
// One entry point: complete(system, user, json?) -> text + token usage.
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
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
		if (e instanceof Anthropic.RateLimitError) throw new ProviderError('rate_limited', e.message);
		if (e instanceof Anthropic.BadRequestError) throw new ProviderError('bad_request', e.message);
		if (e instanceof Anthropic.APIConnectionError) throw new ProviderError('network', e.message);
		if (e instanceof Anthropic.APIError) throw new ProviderError('upstream', e.message);
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
		if (e instanceof OpenAI.RateLimitError) throw new ProviderError('rate_limited', e.message);
		if (e instanceof OpenAI.BadRequestError) throw new ProviderError('bad_request', e.message);
		if (e instanceof OpenAI.APIConnectionError) throw new ProviderError('network', e.message);
		if (e instanceof OpenAI.APIError) throw new ProviderError('upstream', e.message);
		throw e;
	}
}

async function viaGemini(
	c: DemoConfig,
	system: string,
	user: string,
	json: boolean
): Promise<Completion> {
	gemini ??= new GoogleGenAI({ apiKey: c.apiKey, httpOptions: { timeout: c.timeoutMs } });
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
		throw new ProviderError('upstream', e instanceof Error ? e.message : String(e));
	}
}

export function complete(
	c: DemoConfig,
	system: string,
	user: string,
	json: boolean
): Promise<Completion> {
	if (c.provider === 'anthropic') return viaAnthropic(c, system, user, json);
	if (c.provider === 'gemini') return viaGemini(c, system, user, json);
	return viaOpenAI(c, system, user, json);
}

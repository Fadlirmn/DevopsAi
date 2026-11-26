// Provider presets for the admin "API & Kunci" form. Shared by the page and
// the server: the server takes the base URL from here (not from the browser)
// for every preset except "custom".

export type PresetId =
	'gemini' | 'anthropic' | 'openai' | 'deepseek' | 'openrouter' | 'groq' | 'custom';

export type Preset = {
	id: PresetId;
	label: string;
	provider: 'anthropic' | 'openai' | 'gemini' | 'openai-compatible';
	/** Fixed base URL; null = the SDK default (or, for custom, typed by the admin). */
	baseUrl: string | null;
	/** Used when the model field is left empty. */
	defaultModel: string | null;
	/** Placeholder for the model field. */
	modelHint: string;
	keyRequired: boolean;
};

export const PRESETS: Preset[] = [
	{
		id: 'gemini',
		label: 'Google Gemini',
		provider: 'gemini',
		baseUrl: null,
		defaultModel: 'gemini-flash-lite-latest',
		modelHint: 'gemini-flash-lite-latest',
		keyRequired: true
	},
	{
		id: 'anthropic',
		label: 'Anthropic Claude',
		provider: 'anthropic',
		baseUrl: null,
		defaultModel: 'claude-haiku-5-5',
		modelHint: 'claude-haiku-5-5',
		keyRequired: true
	},
	{
		id: 'openai',
		label: 'OpenAI',
		provider: 'openai',
		baseUrl: null,
		defaultModel: null,
		modelHint: 'id model dari platform.openai.com',
		keyRequired: true
	},
	{
		id: 'deepseek',
		label: 'DeepSeek',
		provider: 'openai-compatible',
		baseUrl: 'https://api.deepseek.com',
		defaultModel: null,
		modelHint: 'mis. deepseek-chat',
		keyRequired: true
	},
	{
		id: 'openrouter',
		label: 'OpenRouter (ada model gratis)',
		provider: 'openai-compatible',
		baseUrl: 'https://openrouter.ai/api/v1',
		defaultModel: null,
		modelHint: 'id model, yang gratis berakhiran :free',
		keyRequired: true
	},
	{
		id: 'groq',
		label: 'Groq (ada tier gratis)',
		provider: 'openai-compatible',
		baseUrl: 'https://api.groq.com/openai/v1',
		defaultModel: null,
		modelHint: 'id model dari console.groq.com',
		keyRequired: true
	},
	{
		id: 'custom',
		label: 'Lainnya (OpenAI-compatible)',
		provider: 'openai-compatible',
		baseUrl: null,
		defaultModel: null,
		modelHint: 'id model',
		keyRequired: false
	}
];

export const presetById = (id: string): Preset | undefined => PRESETS.find((p) => p.id === id);

/** Best preset for settings that came from env (no preset recorded). */
export function presetFor(provider: string, baseUrl: string | null | undefined): Preset {
	const fixed = PRESETS.find(
		(p) => p.provider === provider && p.id !== 'custom' && (p.baseUrl ?? null) === (baseUrl || null)
	);
	return (
		fixed ?? PRESETS.find((p) => p.id === (provider === 'openai-compatible' ? 'custom' : provider))!
	);
}

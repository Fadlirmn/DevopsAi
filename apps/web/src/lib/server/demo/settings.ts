// Admin /settings for the serverless demo (no VPS): the same shape as the RAG
// service's /admin/settings, built from env plus live checks, so the admin
// pages show the AI and Redis that actually serve /chat.
import { demoConfig } from './config';
import { TOP_K } from './chat';
import { checkModels, type ModelCheck } from './providers';
import { redisHost, redisStatus, spentToday } from './limits';

/** true when LLM_PROVIDER names a real provider, even if the rest of its env is wrong. */
export function serverlessConfigured(): boolean {
	try {
		return demoConfig() !== null;
	} catch {
		return true; // misconfigured: still report it, with the error
	}
}

/** `test`: also ask the provider whether the key sees each model (free, no tokens). */
export async function serverlessSettings(test: boolean) {
	let c: ReturnType<typeof demoConfig>;
	let configError: string | null = null;
	try {
		c = demoConfig();
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
	else if (!checks) llm = `configured: ${c!.provider} / ${c!.model}`;
	else if (checks.some((x) => x.ok))
		llm = `configured: ${c!.provider} / ${checks.find((x) => x.ok)!.model}`;
	else llm = `error: ${checks.map((x) => `${x.model}: ${x.reason}`).join(', ')}`;

	return {
		mode: 'serverless' as const,
		pipelineVersion: 'demo-v1',
		modelId: c ? `${c.provider}:${c.model}` : null,
		llmProvider: c?.provider ?? process.env.LLM_PROVIDER ?? null,
		llmModel: c?.model ?? null,
		fallbackModels: c?.fallbackModels ?? [],
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
		healthChecks: [
			{ name: 'LLM provider', status: llm },
			{ name: 'Upstash Redis', status: redis }
		]
	};
}

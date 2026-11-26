// Admin: set the serverless demo's model from the "API & Kunci" page.
// Auth: hooks.server.ts (verified Firebase admin); the session cookie is
// SameSite=Lax and these take JSON, so another site can't trigger them.
//   PUT    { preset, baseUrl?, model, fallbackModels?, apiKey?, priceIn?, priceOut? }
//          checks the model with the provider first; nothing is saved on failure.
//   DELETE back to the env settings.
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resetLlmSettings, saveLlmSettings } from '#lib/server/demo/settings';

export const PUT: RequestHandler = async ({ request, locals }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'invalid JSON body');
	}
	const r = await saveLlmSettings(body, locals.adminEmail ?? locals.adminUid ?? null);
	return json(r, { status: r.ok ? 200 : 400 });
};

export const DELETE: RequestHandler = async ({ locals }) => {
	const ok = await resetLlmSettings(locals.adminEmail ?? locals.adminUid ?? null);
	return ok
		? json({ ok: true })
		: json({ ok: false, error: 'Redis tidak terjangkau' }, { status: 503 });
};

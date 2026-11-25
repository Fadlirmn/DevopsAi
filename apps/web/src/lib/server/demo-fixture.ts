// Vercel demo-mode fallback (PRD §6): when the VPS backend can't be reached,
// /chat answers with this stored example instead of an error. It is always
// flagged `demo: true` so the UI shows a "Mode demo" banner — a visitor never
// sees it presented as a live answer to their own question.
//
// The excerpt is quoted verbatim from NIST SP 800-61 Rev. 2 (public domain,
// U.S. Government work), the document the demo collection is seeded with.

export const DEMO_COLLECTION = {
	slug: 'it-ops',
	title: 'IT Ops & Incident Response',
	description: 'Demo mode: stored example from NIST SP 800-61 Rev. 2.'
};

const EXCERPT =
	'The incident response process has several phases. The initial phase involves establishing and ' +
	'training an incident response team, and acquiring the necessary tools and resources. […] This ' +
	'section describes the major phases of the incident response process—preparation, detection and ' +
	'analysis, containment, eradication and recovery, and post-incident activity—in detail.';

export function demoAnswer(requestId: string) {
	return {
		demo: true,
		answer:
			'Mode demo: server AI sedang tidak terjangkau, jadi ini contoh jawaban tersimpan — bukan ' +
			'jawaban untuk pertanyaanmu. Contoh: menurut NIST SP 800-61r2, penanganan insiden punya ' +
			'empat fase — persiapan; deteksi dan analisis; containment, eradication & recovery; dan ' +
			'aktivitas pasca-insiden [1].',
		citations: [
			{
				marker: 1,
				chunkId: 'demo-fixture-nist-3',
				documentId: '',
				title: 'NIST SP 800-61 Rev. 2 — Computer Security Incident Handling Guide',
				heading: '3. Handling an Incident',
				page: 31,
				excerpt: EXCERPT
			}
		],
		requestId,
		usage: { inputTokens: 0, outputTokens: 0 },
		grounded: true,
		cacheHit: false
	};
}

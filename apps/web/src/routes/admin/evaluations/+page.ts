export async function load({ fetch }) {
	const [evalRes, gapsRes] = await Promise.all([
		fetch('/api/v1/admin/evaluations'),
		fetch('/api/v1/admin/coverage-gaps')
	]);
	return {
		runs: evalRes.ok ? await evalRes.json() : [],
		coverageGaps: gapsRes.ok ? await gapsRes.json() : []
	};
}

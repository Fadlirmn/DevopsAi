// Lexical search over the bundled demo index. No database, no embedding API:
// questions in other languages are first rewritten to English keywords by the
// LLM (see chat.ts), so BM25 over the English corpus is enough for one document.

const STOPWORDS = new Set(
	(
		'a an and are as at be been by can could did do does for from had has have how i if in into is it its ' +
		'may might must not of on or our should so such than that the their them then there these they this ' +
		'those to was we were what when where which who why will with would you your'
	).split(' ')
);

export function tokenize(text: string): string[] {
	return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
		.filter((t) => t.length > 1 && !STOPWORDS.has(t))
		.map((t) => (t.length > 4 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t));
}

export class Bm25 {
	private docs: Map<string, number>[] = [];
	private lengths: number[] = [];
	private df = new Map<string, number>();
	private avgLen = 0;

	constructor(
		texts: string[],
		private k1 = 1.2,
		private b = 0.75
	) {
		for (const text of texts) {
			const tf = new Map<string, number>();
			const toks = tokenize(text);
			for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
			for (const t of tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
			this.docs.push(tf);
			this.lengths.push(toks.length);
		}
		this.avgLen = this.lengths.reduce((a, b) => a + b, 0) / Math.max(1, texts.length);
	}

	/** Top `limit` documents as [index, score], best first; only score > 0. */
	search(query: string, limit: number): [number, number][] {
		const terms = [...new Set(tokenize(query))];
		const n = this.docs.length;
		const scores: [number, number][] = [];
		this.docs.forEach((tf, i) => {
			let s = 0;
			for (const t of terms) {
				const f = tf.get(t);
				if (!f) continue;
				const df = this.df.get(t) ?? 0;
				const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
				s +=
					(idf * f * (this.k1 + 1)) /
					(f + this.k1 * (1 - this.b + (this.b * this.lengths[i]) / this.avgLen));
			}
			if (s > 0) scores.push([i, s]);
		});
		return scores.sort((a, b) => b[1] - a[1]).slice(0, limit);
	}
}

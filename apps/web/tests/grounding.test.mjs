// node --test tests/   (Node 24 runs the imported .ts directly — type stripping)
//
// The serverless demo's answer parser is the main guard against off-topic and
// prompt-injected answers, and it is a hand copy of the Python one in
// services/rag. These tests pin its behaviour and fail if the two copies of
// the prompt / fixed texts drift apart.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
	parseAnswer,
	ABSTAIN_TEXT,
	REFUSAL_TEXT,
	SYSTEM_PROMPT
} from '../src/lib/server/demo/grounding.ts';

const answer = (a, citations, grounded = true) =>
	JSON.stringify({ answer: a, citations, grounded });

test('renumbers markers to citation order and maps them to passages', () => {
	const r = parseAnswer(answer('Contain first [5]. Then eradicate [2][5].', [5, 2]), 6);
	assert.equal(r.text, 'Contain first [1]. Then eradicate [2][1].');
	assert.deepEqual(r.cited, [4, 1]); // 0-based passage indexes
	assert.equal(r.grounded, true);
});

test('splits "[1, 3]" and drops hallucinated markers', () => {
	const r = parseAnswer(answer('A [1, 3] and B [9].', [1, 3, 9]), 6);
	assert.equal(r.text, 'A [1][2] and B.');
	assert.deepEqual(r.cited, [0, 2]);
});

test('anything without a valid citation becomes the fixed abstain text', () => {
	for (const raw of [
		answer('Ibu kota Prancis adalah Paris.', [], false),
		answer('Here is a cake recipe: ...', [42], true),
		answer('No markers at all.', [], true)
	]) {
		const r = parseAnswer(raw, 6);
		assert.equal(r.text, ABSTAIN_TEXT);
		assert.deepEqual(r.cited, []);
		assert.equal(r.grounded, false);
	}
});

test('accepts JSON wrapped in prose (OpenAI-compatible servers)', () => {
	const r = parseAnswer(`Sure! ${answer('Yes [1].', [1])} Done.`, 6);
	assert.deepEqual(r.cited, [0]);
});

test('prompt and fixed texts match the Python service', () => {
	const py = (f) =>
		readFileSync(new URL(`../../../services/rag/src/rag/${f}`, import.meta.url), 'utf8');
	const pyPrompt = py('providers/grounding.py').match(/SYSTEM_PROMPT = """([\s\S]*?)"""/)[1];
	const pyAbstain = py('interfaces.py').match(/ABSTAIN_TEXT = \(\s*"([^"]+)"/)[1];
	const pyRefusal = py('interfaces.py').match(/REFUSAL_TEXT = "([^"]+)"/)[1];
	assert.equal(SYSTEM_PROMPT, pyPrompt);
	assert.equal(ABSTAIN_TEXT, pyAbstain);
	assert.equal(REFUSAL_TEXT, pyRefusal);
});

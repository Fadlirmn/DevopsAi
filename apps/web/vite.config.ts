import tailwindcss from '@tailwindcss/vite';
import adapterNode from '@sveltejs/adapter-node';
import adapterVercel from '@sveltejs/adapter-vercel';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// Vercel sets VERCEL=1 during its builds → serverless functions on Node 24.
			// Everywhere else (Docker/VPS, PRD.md §6 default) → Node server on port 3000.
			adapter: process.env.VERCEL ? adapterVercel({ runtime: 'nodejs24.x' }) : adapterNode()
		})
	]
});

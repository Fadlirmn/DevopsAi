// Old URL — the chat now lives at `/`. Keep links/bookmarks working.
import { redirect } from '@sveltejs/kit';

export function GET() {
	redirect(308, '/');
}

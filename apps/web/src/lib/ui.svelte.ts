// Small client-side UI helpers shared by the chat and admin shells.

/** Toast text shown by <Toast/> — set via say(). */
export const toast = $state({ text: '' });
let timer: ReturnType<typeof setTimeout> | undefined;

export function say(text: string, ms = 1800) {
	toast.text = text;
	clearTimeout(timer);
	timer = setTimeout(() => (toast.text = ''), ms);
}

export type Theme = 'dark' | 'light';

// Same convention as the mockups: dark = no attribute, light = data-theme="light".
// app.html applies the stored value before first paint (no flash).
export function currentTheme(): Theme {
	return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

export function setTheme(t: Theme) {
	if (t === 'light') document.documentElement.dataset.theme = 'light';
	else delete document.documentElement.dataset.theme;
	try {
		localStorage.setItem('ko-theme', t);
	} catch {
		// private window / blocked storage: theme just won't persist
	}
}

/** localStorage keys (per-browser conveniences only; nothing here is shared or server-side). */
export const HISTORY_KEY = 'ko-chats';
export const DEFAULT_COLLECTION_KEY = 'ko-default-collection';

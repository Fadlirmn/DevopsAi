"""Regenerate apps/web/src/routes/layout.css from docs/mockups/{chat,admin}.html.
Every mockup rule is scoped under .chat-app / .admin-app so the two designs
(which reuse names like .acts, .tw, table, svg with different values) never
collide. Usage: python3 scripts/gen_mockup_css.py"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def rules(css):
    """Split top-level CSS into (prelude, body) pairs; body may contain nested rules."""
    out, i, n = [], 0, len(css)
    while i < n:
        j = css.find('{', i)
        if j < 0: break
        prelude = css[i:j].strip()
        depth, k = 1, j + 1
        while depth:
            if css[k] == '{': depth += 1
            elif css[k] == '}': depth -= 1
            k += 1
        out.append((prelude, css[j+1:k-1]))
        i = k
    return out

def split_sel(s):
    parts, depth, cur = [], 0, ''
    for ch in s:
        if ch == '(': depth += 1
        if ch == ')': depth -= 1
        if ch == ',' and depth == 0: parts.append(cur); cur = ''
        else: cur += ch
    parts.append(cur)
    return [p.strip() for p in parts if p.strip()]

GLOBAL = {'*', 'html', 'html,body'}

def scope_sel(sel, root):
    if sel in ('html', 'body') and False: pass
    if sel.startswith(':root[data-theme="light"]'):
        rest = sel[len(':root[data-theme="light"]'):].strip()
        return f':root[data-theme="light"] {root}' + (f' {rest}' if rest else '')
    if sel == ':root' or sel == 'body':
        return root
    return f'{root} {sel}'

def convert(css, root):
    out = []
    for prelude, body in rules(css):
        if prelude.startswith('@keyframes'):
            out.append(f'{prelude}{{{body}}}')
        elif prelude.startswith('@media'):
            inner = convert(body, root)
            out.append(f'{prelude}{{\n{inner}\n}}')
        elif prelude in GLOBAL:
            continue  # emitted once in the global base
        else:
            sels = [scope_sel(s, root) for s in split_sel(prelude)]
            out.append(f'{",".join(sels)}{{{body}}}')
    return '\n'.join(out)

def style_of(path):
    return re.search(r'<style>(.*?)</style>', (ROOT / path).read_text(), re.S).group(1)

chat = convert(style_of('docs/mockups/chat.html'), '.chat-app')
admin = convert(style_of('docs/mockups/admin.html'), '.admin-app')

BASE = """/* GENERATED from docs/mockups/chat.html + admin.html by scripts/gen_mockup_css.py —
   every rule is the mockup's own, scoped under .chat-app (public
   chat, login, source viewer) or .admin-app (admin panel). Edit the mockups,
   not the scoped blocks, to change the design. */
*{box-sizing:border-box}
html,body{height:100%;margin:0}
html{scroll-padding-top:env(safe-area-inset-top,0px)}
body{background:#171717}
:root[data-theme="light"] body{background:#fff}
.chat-app,.admin-app{min-height:100%;height:100%}
"""
EXTRA = """
/* --- Additions for pages the mockups don't draw (login, source viewer),
   built only from the mockups' own tokens/components. --- */
.chat-app .s a{color:inherit;text-decoration:none}
.chat-app .s a:hover{text-decoration:underline}
.chat-app .center{max-width:420px;margin:12vh auto 0;padding:0 20px;display:flex;flex-direction:column;gap:14px}
.chat-app .center h1{margin:0;font-size:22px}
.chat-app .center p{margin:0;color:var(--mute);font-size:14px}
.chat-app .pill{display:inline-flex;align-items:center;justify-content:center;gap:10px;background:var(--surf);border:1px solid var(--line2);border-radius:99px;padding:10px 18px}
.chat-app .pill:hover{background:var(--hover)}
.chat-app .pill:disabled{opacity:.6;cursor:default}
.chat-app .back{color:var(--mute);text-decoration:none;font-size:14px}
.chat-app .back:hover{color:var(--text)}
.chat-app .doc h1{margin:0 0 4px;font-size:22px}
.chat-app .doc .sub{color:var(--mute);font-size:14px;margin:0 0 16px}
.admin-app .empty{color:var(--mute);text-align:center}
"""
(ROOT / 'apps/web/src/routes/layout.css').write_text(BASE + '\n/* ===== chat.html ===== */\n' + chat + '\n\n/* ===== admin.html ===== */\n' + admin + '\n' + EXTRA)
print('ok', len(chat), len(admin))

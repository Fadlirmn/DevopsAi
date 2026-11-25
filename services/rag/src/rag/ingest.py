"""Seed-corpus ingestion: download -> extract -> chunk -> embed -> store.

Used by scripts/seed_corpus.py to load the license-checked public documents
listed in docs/SEED_CORPUS_SOURCES.md. Idempotent: a document is re-ingested
only when its bytes (sha256) or the active embedder changed.

Not the admin upload pipeline (that is the worker's job, still a stub) — but
it writes the same tables the way that pipeline will.
"""

import hashlib
import logging
import re
import urllib.request
from dataclasses import dataclass, field
from html.parser import HTMLParser
from io import BytesIO
from pathlib import Path

from pypdf import PdfReader

from .interfaces import Embedder

log = logging.getLogger("ingest")

USER_AGENT = "Mozilla/5.0 (compatible; knowledgeops-seed/1.0; +https://github.com/)"
CHUNK_WORDS = 220
OVERLAP_WORDS = 40
EMBED_BATCH = 32

COLLECTION_SLUG = "it-ops"
COLLECTION_TITLE = "IT Ops & Incident Response"
COLLECTION_DESC = (
    "NIST and CISA incident-response guidance plus selected Kubernetes and PostgreSQL operations docs."
)


@dataclass(frozen=True)
class Source:
    slug: str
    title: str
    url: str
    kind: str  # "pdf" | "html"
    license: str
    sets: frozenset = field(default_factory=lambda: frozenset({"all"}))
    content_selector: tuple[str, str] | None = None  # ("class"|"id", value) for HTML main content


US_GOV = "Public domain (U.S. Government work)"
K8S = "CC BY 4.0 — © The Kubernetes Authors (kubernetes.io)"
PG = "PostgreSQL License — © The PostgreSQL Global Development Group"

SOURCES: list[Source] = [
    Source(
        "nist-sp-800-61r2",
        "NIST SP 800-61 Rev. 2 — Computer Security Incident Handling Guide",
        "https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-61r2.pdf",
        "pdf",
        US_GOV,
        frozenset({"demo", "all"}),
    ),
    Source(
        "cisa-ir-playbooks",
        "CISA Federal Government Cybersecurity Incident & Vulnerability Response Playbooks",
        "https://www.cisa.gov/sites/default/files/2023-02/"
        "Federal_Government_Cybersecurity_Incident_and_Vulnerability_Response_Playbooks_508C.pdf",
        "pdf",
        US_GOV,
    ),
    Source("k8s-deployments", "Kubernetes Docs — Deployments",
           "https://kubernetes.io/docs/concepts/workloads/controllers/deployment/", "html", K8S,
           content_selector=("class", "td-content")),
    Source("k8s-debug-pods", "Kubernetes Docs — Debug Pods",
           "https://kubernetes.io/docs/tasks/debug/debug-application/debug-pods/", "html", K8S,
           content_selector=("class", "td-content")),
    Source("k8s-debug-running-pod", "Kubernetes Docs — Debug Running Pods",
           "https://kubernetes.io/docs/tasks/debug/debug-application/debug-running-pod/", "html", K8S,
           content_selector=("class", "td-content")),
    Source("pg-backup-dump", "PostgreSQL Docs — SQL Dump",
           "https://www.postgresql.org/docs/current/backup-dump.html", "html", PG,
           content_selector=("id", "docContent")),
    Source("pg-continuous-archiving", "PostgreSQL Docs — Continuous Archiving and PITR",
           "https://www.postgresql.org/docs/current/continuous-archiving.html", "html", PG,
           content_selector=("id", "docContent")),
    Source("pg-routine-vacuuming", "PostgreSQL Docs — Routine Vacuuming",
           "https://www.postgresql.org/docs/current/routine-vacuuming.html", "html", PG,
           content_selector=("id", "docContent")),
]


@dataclass
class Section:
    heading: str | None
    page: int | None
    text: str


# ---------- download ----------

def download(src: Source, cache_dir: Path) -> bytes:
    """Fetch once into cache_dir; later runs (and restarts) reuse the file."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    path = cache_dir / f"{src.slug}.{src.kind}"
    if path.exists() and path.stat().st_size > 0:
        return path.read_bytes()
    req = urllib.request.Request(src.url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=120) as resp:  # noqa: S310 - fixed allowlisted URLs
        data = resp.read()
    path.write_bytes(data)
    return data


# ---------- extract ----------

def _clean(text: str) -> str:
    text = re.sub(r"[\uf000-\uf0ff]", "•", text)  # Symbol-font bullets land in the private-use area
    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)  # re-join words hyphenated across lines
    return re.sub(r"\s+", " ", text).strip()


def _pdf_outline(reader: PdfReader) -> list[tuple[int, str]]:
    """(page_index, title) for every outline entry, sorted by page."""
    out: list[tuple[int, str]] = []

    def walk(items):
        for item in items:
            if isinstance(item, list):
                walk(item)
                continue
            try:
                out.append((reader.get_destination_page_number(item), str(item.title).strip()))
            except Exception:  # broken/unresolvable bookmark
                continue

    try:
        walk(reader.outline)
    except Exception:
        return []
    return sorted(out)


# "3.2.4 Incident Analysis", "4. Coordination and Information Sharing"
_NUMBERED_HEADING = re.compile(r"^(\d{1,2}(?:\.\d{1,2}){0,3})\.?\s+([A-Z][^.:;]{2,80})$")


def _line_heading(line: str) -> str | None:
    m = _NUMBERED_HEADING.match(line)
    if not m or len(line.split()) > 12 or "...." in line:
        return None
    if re.match(r"(What|How|Why|When|Who|Which|Where|Is|Are|Do|Does|Did|Should|Can|Could|Would|Will|Has|Have)\b", m.group(2)):
        return None  # numbered questions in checklists, not section titles
    return f"{m.group(1)} {m.group(2).strip()}"


def extract_pdf(data: bytes) -> list[Section]:
    reader = PdfReader(BytesIO(data))
    outline = _pdf_outline(reader)
    pages = [[ln.strip() for ln in (p.extract_text() or "").splitlines()] for p in reader.pages]

    # Running headers/footers repeat on many pages ("TLP:WHITE", the guide's
    # title): drop any line that appears on 30%+ of pages, plus bare page numbers.
    freq: dict[str, int] = {}
    for lines in pages:
        for ln in set(lines):
            freq[ln] = freq.get(ln, 0) + 1
    repeated = {ln for ln, n in freq.items() if n >= max(3, len(pages) * 0.3)}

    sections: list[Section] = []
    heading: str | None = None
    for i, lines in enumerate(pages):
        kept = [ln for ln in lines if ln and ln not in repeated and not ln.isdigit()]
        raw = "\n".join(kept)
        if raw.count("....") > 5:  # table-of-contents page
            continue
        if outline:
            for page_idx, title in outline:
                if page_idx <= i:
                    heading = title
        page_heading = heading
        for ln in kept:
            found = _line_heading(ln)
            if found:
                heading = found
                if page_heading is None:
                    page_heading = found
        text = _clean(raw)
        if len(text) < 80:  # blank, cover-art or near-empty pages
            continue
        # A page is labelled with the section in force at its top, or the first
        # one that starts on it.
        sections.append(Section(heading=page_heading, page=i + 1, text=text))
    return sections


class _MainContent(HTMLParser):
    SKIP = {"script", "style", "nav", "aside", "footer", "header", "noscript", "svg", "button", "form"}
    HEADINGS = {"h1", "h2", "h3", "h4"}
    BLOCK = {"p", "li", "pre", "div", "td", "th", "dd", "dt", "br", "tr", "table", "ul", "ol", "section"}

    def __init__(self, selector: tuple[str, str] | None):
        super().__init__(convert_charrefs=True)
        self.selector = selector
        self.depth = 0 if selector else 1  # >0 while inside the main content element
        self.skip = 0
        self.in_heading = False
        self.heading_buf: list[str] = []
        self.current = Section(None, None, "")
        self.buf: list[str] = []
        self.sections: list[Section] = []

    def _matches(self, attrs) -> bool:
        kind, value = self.selector  # type: ignore[misc]
        a = dict(attrs)
        if kind == "id":
            return a.get("id") == value
        return value in (a.get("class") or "").split()

    def _flush(self):
        text = _clean(" ".join(self.buf))
        if text:
            self.sections.append(Section(self.current.heading, None, text))
        self.buf = []

    def handle_starttag(self, tag, attrs):
        if self.depth == 0:
            if self.selector and self._matches(attrs):
                self.depth = 1
            return
        if tag not in ("br",):  # void elements don't nest
            self.depth += 1
        if tag in self.SKIP:
            self.skip += 1
        elif tag in self.HEADINGS and not self.skip:
            self._flush()
            self.in_heading = True
            self.heading_buf = []
        elif tag in self.BLOCK:
            self.buf.append("\n")

    def handle_endtag(self, tag):
        if self.depth == 0:
            return
        if tag in self.SKIP and self.skip:
            self.skip -= 1
        if tag in self.HEADINGS and self.in_heading:
            self.in_heading = False
            title = re.sub(r"\s*#$", "", _clean(" ".join(self.heading_buf)))  # PostgreSQL anchor "#"
            if title.endswith(":") and len(title.split()) <= 2:
                # Callout label ("Note:", "Caution:"), not a section: keep it as text.
                self.buf.append(title)
            else:
                self.current = Section(title or None, None, "")
        self.depth -= 1

    def handle_data(self, data):
        if self.depth == 0 or self.skip:
            return
        (self.heading_buf if self.in_heading else self.buf).append(data)

    def close(self):
        super().close()
        self._flush()


def extract_html(data: bytes, selector: tuple[str, str] | None) -> list[Section]:
    parser = _MainContent(selector)
    parser.feed(data.decode("utf-8", errors="replace"))
    parser.close()
    return [s for s in parser.sections if len(s.text) >= 40]


# ---------- chunk ----------

def chunk_sections(sections: list[Section]) -> list[Section]:
    """~CHUNK_WORDS-word chunks with overlap, never crossing a section/page."""
    chunks: list[Section] = []
    pending: Section | None = None
    for s in sections:
        # Merge tiny consecutive sections under the same heading (HTML paragraphs).
        if pending and pending.heading == s.heading and pending.page == s.page and \
                len(pending.text.split()) + len(s.text.split()) <= CHUNK_WORDS:
            pending = Section(pending.heading, pending.page, f"{pending.text} {s.text}")
            continue
        if pending:
            chunks.extend(_split(pending))
        pending = s
    if pending:
        chunks.extend(_split(pending))
    return chunks


def _split(s: Section) -> list[Section]:
    words = s.text.split()
    if len(words) <= CHUNK_WORDS:
        return [s]
    out, step = [], CHUNK_WORDS - OVERLAP_WORDS
    for start in range(0, len(words), step):
        piece = words[start : start + CHUNK_WORDS]
        if len(piece) < 30 and out:  # tiny tail: already covered by the overlap
            break
        out.append(Section(s.heading, s.page, " ".join(piece)))
    return out


def extract(src: Source, data: bytes) -> list[Section]:
    sections = extract_pdf(data) if src.kind == "pdf" else extract_html(data, src.content_selector)
    return [c for c in chunk_sections(sections) if len(c.text.split()) >= 12]


# ---------- store ----------

def _vec(v: list[float]) -> str:
    return "[" + ",".join(f"{x:.8f}" for x in v) + "]"


async def ensure_collection(conn) -> str:
    return await conn.fetchval(
        """
        INSERT INTO collections (slug, title, description, visibility, status)
        VALUES ($1, $2, $3, 'public', 'published')
        ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description,
                                         status = 'published'
        RETURNING id
        """,
        COLLECTION_SLUG, COLLECTION_TITLE, COLLECTION_DESC,
    )


async def ingest(conn, collection_id: str, src: Source, data: bytes, embedder: Embedder, embedding_label: str) -> str:
    """Returns 'skipped' | 'ingested'."""
    sha = hashlib.sha256(data).hexdigest()
    doc = await conn.fetchrow(
        """
        SELECT d.id, v.sha256, v.embedding_model, coalesce(max_v.n, 0) AS max_version
        FROM documents d
        LEFT JOIN document_versions v ON v.id = d.active_version_id
        LEFT JOIN LATERAL (SELECT max(version_number) AS n FROM document_versions WHERE document_id = d.id) max_v ON true
        WHERE d.collection_id = $1 AND d.source_url = $2
        """,
        collection_id, src.url,
    )
    if doc and doc["sha256"] == sha and doc["embedding_model"] == embedding_label:
        return "skipped"

    chunks = extract(src, data)
    if not chunks:
        raise RuntimeError(f"{src.slug}: no text extracted")

    vectors: list[list[float]] = []
    for i in range(0, len(chunks), EMBED_BATCH):
        vectors += await embedder.embed_documents([c.text for c in chunks[i : i + EMBED_BATCH]])

    async with conn.transaction():
        if doc is None:
            doc_id = await conn.fetchval(
                """
                INSERT INTO documents (collection_id, title, source_type, status, source_url, license)
                VALUES ($1, $2, $3, 'published', $4, $5) RETURNING id
                """,
                collection_id, src.title, src.kind, src.url, src.license,
            )
            version_no = 1
        else:
            doc_id = doc["id"]
            version_no = doc["max_version"] + 1
            await conn.execute(
                "UPDATE documents SET title = $2, license = $3, status = 'published' WHERE id = $1",
                doc_id, src.title, src.license,
            )
        version_id = await conn.fetchval(
            """
            INSERT INTO document_versions (document_id, version_number, object_key, sha256, mime_type,
                                           bytes, status, embedding_model)
            VALUES ($1, $2, $3, $4, $5, $6, 'ready', $7) RETURNING id
            """,
            doc_id, version_no, f"corpus/{src.slug}.{src.kind}", sha,
            "application/pdf" if src.kind == "pdf" else "text/html", len(data), embedding_label,
        )
        await conn.executemany(
            """
            INSERT INTO chunks (version_id, ordinal, page_number, heading, content, token_count, embedding)
            VALUES ($1, $2, $3, $4, $5, $6, $7::vector)
            """,
            [
                (version_id, i + 1, c.page, c.heading, c.text, len(c.text.split()), _vec(v))
                for i, (c, v) in enumerate(zip(chunks, vectors))
            ],
        )
        await conn.execute("UPDATE documents SET active_version_id = $1 WHERE id = $2", version_id, doc_id)
        # Old versions' chunks are unreachable now; drop them to keep the table small.
        await conn.execute(
            "DELETE FROM chunks WHERE version_id IN "
            "(SELECT id FROM document_versions WHERE document_id = $1 AND id <> $2)",
            doc_id, version_id,
        )
    return "ingested"

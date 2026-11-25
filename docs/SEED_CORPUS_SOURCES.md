# Seed corpus sources

Real, license-checked documents for the public demo collections — see `PRD.md` §10 for the full table and rationale.

1. NIST SP 800-61 Rev. 2 — public domain — https://csrc.nist.gov/pubs/sp/800/61/r2/final (PDF: https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-61r2.pdf)
2. CISA Federal Government Cybersecurity Incident and Vulnerability Response Playbooks — public domain — https://www.cisa.gov/sites/default/files/2023-02/Federal_Government_Cybersecurity_Incident_and_Vulnerability_Response_Playbooks_508C.pdf
3. Kubernetes official docs — CC BY 4.0 (attribution required) — https://kubernetes.io/docs/
4. PostgreSQL official docs — PostgreSQL License — https://www.postgresql.org/docs/

Download originals into `eval/datasets/raw/` (gitignored — don't commit third-party PDFs) when building M1 fixtures; `network-runbooks-v1.jsonl` questions should cite chunks from these.

**Implemented:** these are downloaded and ingested by `services/rag/scripts/seed_corpus.py` (exact URLs and the Kubernetes/PostgreSQL pages chosen are in `SOURCES` in `services/rag/src/rag/ingest.py`). `--set demo` loads NIST SP 800-61r2 only (Vercel demo); `--set all` loads everything (Docker default). See the README "Dokumen awal" section.

"""Ingestion worker entrypoint — one-shot: claim+drain pending jobs, then exit.
Run via cron/systemd timer, not as a resident daemon (see PRD.md §6 Service boundaries).
Implemented in M1 (see IMPLEMENTATION.md)."""


def main() -> None:
    raise NotImplementedError("worker claim-drain-exit pass: see PRD.md §6 Ingestion flow")


if __name__ == "__main__":
    main()

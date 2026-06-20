## AIB

This project uses AIB for TS/JS code work and compact repo reads.

Before reading or changing TS/JS files, run:

aib help

On the first AIB pass in this repo, read bootstrap from the help entrypoint.

After context compaction, run:

aib help help-protocol quick-map; aib config aliases

Follow help-protocol instead of guessing when to reread bootstrap or focused help.
Use AIB guidance while working with TS/JS code.
Prefer the suitable AIB command when it is the more token-efficient way to get the answer; refresh focused help instead of guessing command shape.
This AIB install may not expose `aib rg`; use AIB `inspect`/`qr` for TS/JS-aware work and plain `rg` for simple text lookup.
Use aib qr for quick reads, with aliases and BATCH when useful; it is not a replacement for aib inspect.
Use aib git -- <args> instead of git <args>

## Ingest Granularity

- `auto` is the default extraction granularity.
- Auto uses one small LLM preflight call per ingest to choose `coarse`, `standard`, `fine`, or `custom`.
- Manual modes skip preflight and are still useful for predictable cost or debugging.

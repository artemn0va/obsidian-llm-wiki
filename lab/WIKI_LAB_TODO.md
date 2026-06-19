# Wiki Lab TODO

Developer-facing roadmap for the next Wiki Lab iterations. This file is not generated wiki content and should not be ingested as a source note unless explicitly needed later.

## 1. Runs as Ingest Cockpit

### Progress

- [x] 2026-06-19: `/api/runs` now returns readable run summary fields: source path, command type, mode, status, duration, diff counts, QA before/after snapshots when available.
- [x] 2026-06-19: New queued ingests save `qa-before.json`; finalized ingests save both `qa.json` and `qa-after.json`.
- [x] 2026-06-19: `Runs` UI now has cockpit summary cards, readable run table, selected run detail panel, diff file lists, and QA before/after display.
- [ ] Next: add explicit row actions: `Open run`, `Open source`, `Open diff`.
- [ ] Next: add stale/unfinished run detection and cleanup flow.

### Goal

Сделать `Runs` главным экраном для анализа ingest-запусков: пользователь должен быстро понимать, что было запущено, сколько заняло времени, чем закончилось, какие файлы изменились и как изменилась QA-картина.

### Current state

- `Runs` уже читает `.llm-wiki-lab/runs`.
- Есть `command`, `response`, progress и часть snapshot/diff данных.
- Экран пока выглядит как raw technical log, а не как удобная ingest history.

### TODO checklist

- [ ] Показывать `source path`, command type, ingest mode/granularity, status, start/end time и duration.
- [ ] Показывать счетчики `created`, `changed`, `deleted`.
- [ ] Показывать QA before/after: errors, warnings, info.
- [ ] Добавить compact row view и expandable detail view.
- [ ] Добавить быстрые actions: `Open run`, `Open source`, `Open diff`.
- [ ] Явно показывать stale/unfinished runs.

### Acceptance criteria

- Пользователь может открыть `Runs` и понять последний ingest без чтения JSON.
- У каждого ingest видно, какие файлы появились, изменились или исчезли.
- QA before/after видна на уровне run summary.

### Notes / constraints

- Не показывать secrets или plugin `data.json`.
- Если старый run не содержит `after.json` или `diff.json`, UI должен показывать partial state, а не падать.

## 2. Last Ingest Diff Viewer

### Progress

- [x] 2026-06-19: Selected run detail now shows `Created files`, `Changed files`, `Deleted files`, and `Preserved files`.
- [x] 2026-06-19: Added file actions in the run detail panel: `Open`, `Delete created`, `Keep`, and `Mark reviewed`.
- [x] 2026-06-19: Added run-local review state in `.llm-wiki-lab/runs/<id>/review.json` so `Keep` and `Mark reviewed` do not mutate wiki content.
- [ ] Next: split this into a dedicated full-screen `Last Ingest Diff` view with filtering and richer QA finding grouping.
- [ ] Next: add per-file diff content preview for changed files.

### Goal

Сделать нормальную панель для анализа последнего ingest: что создано, что изменено, что сохранено, какие QA issues появились, и какие действия доступны.

### Current state

- `Clean Last Ingest` уже может удалить только created files.
- `diff.json` может содержать `created`, `changed`, `deleted`, но нет удобного viewer.

### TODO checklist

- [ ] Сделать dedicated panel для last ingest diff.
- [ ] Показывать sections: `Created files`, `Changed files`, `Deleted files`, `Preserved files`, `QA findings`.
- [ ] Для файлов добавить actions: `Open`, `Delete created`, `Keep`, `Mark reviewed`.
- [ ] Добавить markdown preview выбранного файла.
- [ ] Добавить clear visual state для files that are already deleted or missing.
- [ ] Добавить summary header: source path, run id, duration, status.

### Acceptance criteria

- Последний ingest можно ревьюить из одного экрана.
- Created files можно удалить выборочно или пачкой.
- Changed files явно видны, но не удаляются случайно.

### Notes / constraints

- `Delete created` не должен трогать files that existed before ingest.
- `Mark reviewed` должен быть explicit action, не автоматический side effect.

## 3. Safer Clean Last Ingest v2

### Goal

Сделать rollback последнего ingest полноценным: не только удалить created files, но и восстановить старое содержимое changed files.

### Current state

- Перед ingest сохраняется `before.json` snapshot с path/size/hash/time.
- Старое содержимое changed files пока не сохраняется.
- Поэтому текущий rollback безопасно удаляет только newly created files.

### TODO checklist

- [ ] Перед ingest сохранять backup содержимого всех wiki markdown files, которые могут быть изменены.
- [ ] Хранить backups внутри `.llm-wiki-lab/runs/<id>/backups/`.
- [ ] Добавить manifest: original path, sha256 before, backup path, capturedAt.
- [ ] После ingest вычислять changed files и связывать их с backups.
- [ ] Добавить `Rollback last ingest` для restore changed + delete created.
- [ ] Добавить dry-run preview для rollback.

### Acceptance criteria

- Rollback восстанавливает содержимое files that existed before ingest.
- Created files удаляются.
- Protected files вроде schema не восстанавливаются без явного разрешения.

### Notes / constraints

- Backups не должны попадать в wiki output.
- Нельзя восстанавливать файл, если current hash не совпадает с expected after hash, без warning/confirmation.

## 4. Better Ingest Form

### Goal

Убрать ручной ввод path для ingest и заменить его picker-формой, которая помогает выбрать правильный source и режим.

### Current state

- Dialog `Ingest` сейчас принимает path text input.
- Default path: `wiki-start/Personal/2026-06-18.md`.
- Ошибки path легко сделать руками.

### TODO checklist

- [ ] Добавить file picker по `wiki-start/`.
- [ ] Добавить file/folder picker по `sources/`.
- [ ] Добавить recent notes list.
- [ ] Добавить command type selector: `ingest-file`, `ingest-folder`.
- [ ] Добавить granularity selector: `Coarse`, `Fine`.
- [ ] Добавить dry-run-ish preview: выбранный path, expected command, blocked path warnings.
- [ ] Показывать bridge requirements: Obsidian open, Lab Bridge enabled.

### Acceptance criteria

- Пользователь может ingest-ить заметку без ручного path typing.
- UI не позволяет выбрать `.obsidian`, `.llm-wiki-lab`, `wiki/` и другие blocked paths.
- Granularity явно видна перед queue.

### Notes / constraints

- Если plugin пока не принимает per-command granularity, UI должен показать current setting and limitation.
- Нельзя читать или показывать secrets/settings from `data.json`.

## 5. QA Fix Center

### Goal

Заменить одну общую кнопку `Fix QA` на понятный центр исправлений: какие issues fixable, что именно будет изменено, и какие fixes требуют ручного review.

### Current state

- Есть `Run QA`.
- Есть safe `Fix QA` для deterministic fixes вроде broken links и legacy `source_file`.
- Нет preview конкретных изменений.

### TODO checklist

- [ ] Группировать QA findings по типам: `broken links`, `prompt leaks`, `source_file`, `bad slug`, `source tag pollution`.
- [ ] Для каждого fixable issue показывать proposed change preview.
- [ ] Добавить per-issue actions: `Apply`, `Ignore`, `Open file`.
- [ ] Добавить bulk action: `Apply safe fixes`.
- [ ] Добавить non-fixable section with explanation.
- [ ] После fix автоматически перезапускать QA.

### Acceptance criteria

- Пользователь видит, что именно изменит fixer.
- Safe fixes можно применить пачкой.
- Semantic issues не исправляются автоматически без явного review.

### Notes / constraints

- Fixer не должен создавать новые wiki pages на основании broken links.
- Bad slug rename требует link updates and should be previewed before applying.

## 6. Schema Health Panel

### Goal

Показать, какая schema активна и реально доходит ли она до prompt/tasks. Это нужно, чтобы ловить ситуацию: schema exists, but model does not see the right rules.

### Current state

- Schema живет в `wiki/schema/config.md`.
- Plugin prompt routing уже менялся, но UI не показывает schema coverage.

### TODO checklist

- [ ] Показывать active schema path and modified time.
- [ ] Показывать detected schema sections.
- [ ] Показывать task coverage: `analyze`, `summary`, `entity`, `concept`, `related`, `merge`, `full`.
- [ ] Подсвечивать missing required sections.
- [ ] Показывать current wiki language and language policy.
- [ ] Добавить `Open schema` action.

### Acceptance criteria

- Пользователь видит, какие schema sections доступны для каждого task.
- UI показывает warning, если важные rules не используются.
- Schema panel не требует читать raw config manually.

### Notes / constraints

- Не раздувать schema и не копировать весь файл в UI.
- Показывать summary/coverage, а не полный markdown.

## 7. Ingest Quality Score

### Goal

Дать каждому ingest понятный deterministic score: content score, structure score, risks. Это не должно быть магией, а должно объяснять причины.

### Current state

- QA уже считает errors/warnings/info.
- Нет общего score и объяснения качества ingest.

### TODO checklist

- [ ] Рассчитать `content score` на основе thin pages, duplicate quotes, source attribution.
- [ ] Рассчитать `structure score` на основе broken links, slugs, frontmatter, schema compliance.
- [ ] Рассчитать `risk level` по severity and affected files.
- [ ] Показывать reason list for each score.
- [ ] Добавить optional future hook for LLM review, disabled by default.

### Acceptance criteria

- У каждого run есть score summary.
- Score объясняется конкретными findings, а не скрытой эвристикой.
- Low score ведет к actionable next steps.

### Notes / constraints

- v1 score должен быть deterministic.
- LLM review можно добавить позже как optional layer.

## 8. Build / Deploy Clarity

### Goal

Сделать plugin/dev workflow прозрачным: какой build установлен, совпадают ли hashes, когда deploy был сделан, нужен ли reload Obsidian.

### Current state

- Dashboard показывает hash match.
- Есть `Build + Deploy` и `Reload Obsidian`.
- Нет clear deploy history and reload-needed state.

### TODO checklist

- [ ] Показывать fork hash, installed hash, manifest version.
- [ ] Показывать last build time and last deploy time.
- [ ] Показывать `Obsidian needs reload` после deploy.
- [ ] Добавить deploy log preview.
- [ ] Добавить action order guidance: build, deploy, reload.

### Acceptance criteria

- Пользователь понимает, какой plugin сейчас использует Obsidian.
- После deploy видно, нужен ли reload.
- Hash mismatch объясняется readable message.

### Notes / constraints

- Не читать и не показывать plugin `data.json`.
- Copy/deploy должен оставаться limited to safe artifacts: `main.js`, `manifest.json`, `styles.css`.

## 9. Bridge Reliability

### Goal

Сделать bridge queue observable and controllable: pending/running/stale/failed commands должны быть видны и управляемы.

### Current state

- Bridge пишет runtime status.
- Commands лежат в `.llm-wiki-lab/commands`.
- UI показывает basic bridge status/progress.

### TODO checklist

- [ ] Показывать queue state: `pending`, `running`, `stale`, `failed`, `done`.
- [ ] Показывать active command age and last heartbeat.
- [ ] Добавить `Clear stale command`.
- [ ] Добавить `Cancel active work` with explicit status.
- [ ] Показывать disabled bridge reason.
- [ ] Добавить warning, если Obsidian closed or bridge disabled.

### Acceptance criteria

- Пользователь понимает, почему ingest не стартует.
- Stale commands можно очистить без ручного удаления файлов.
- Running command не очищается случайно.

### Notes / constraints

- Stale threshold должен быть явным и видимым.
- Clear action не должен удалять run history.

## 10. Plugin Settings Mirror

### Goal

Показать важные plugin settings в read-only виде, чтобы не открывать Obsidian settings ради проверки model/granularity/language/paths.

### Current state

- UI знает часть status через hashes and runtime.
- Plugin settings mirror отсутствует.

### TODO checklist

- [ ] Добавить read-only settings endpoint or bridge status section.
- [ ] Показывать model, granularity, wiki language, bridge enabled, important paths.
- [ ] Показывать settings source and updatedAt.
- [ ] Явно скрывать/exclude secrets.
- [ ] Добавить warning, если settings unavailable.

### Acceptance criteria

- Пользователь видит важные plugin settings without opening Obsidian settings.
- Secrets are never exposed.
- Missing settings show clear unavailable state.

### Notes / constraints

- Не читать или не возвращать raw `data.json` целиком.
- Лучше сделать plugin-side sanitized settings export через `.llm-wiki-lab/runtime-status.json` или отдельный sanitized file.

## Cross-cutting Notes

- Prefer deterministic behavior first; add LLM review only as optional future layer.
- Every destructive action should have confirmation and preview where practical.
- Keep Wiki Lab as local cockpit for experimentation: run, inspect, rollback, adjust, rerun.
- Preserve active vault boundary: `C:\Users\hello\Documents\GitHub\Roadmap`.
- Do not modify raw `sources/` unless explicitly requested.

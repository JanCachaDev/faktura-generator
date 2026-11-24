# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-11-24

### Added
- `faktura` CLI with `invoice` and `timesheet` commands, `--dir`, `--service`, `--help` and `--version`.
- Non-interactive timesheet mode: `--service "WZ=Vývoj webu"`.
- Timesheet parser now supports quoted fields, `;` delimiters (Czech Excel), CRLF line endings, `1d` / `1.5h` / `1,5h` values.
- Unit and end-to-end tests, CI on Linux, Windows and macOS.
- Published as `@jancachadev/faktura-generator` on GitHub Packages.

### Fixed
- Invoice numbers now increment within a month (previously every invoice got `…001`).
- Running the CLI on Windows.
- QR payment uses the configured currency instead of always `CZK`.
- Due dates no longer shift by a day depending on the machine timezone.
- Text from config files is HTML-escaped in the invoice.
- Quantities are shown in Czech format (`32,5`).

### Changed
- Configs are read from (and PDFs written to) the current folder or `--dir`.
- Code moved to `src/` and split into testable modules.

## [0.1.0] - 2026-06-17

### Added
- First version: PDF invoice from `supplier.json` + `invoice.json`, Jira timesheet import, QR payment code.

[1.0.0]: https://github.com/JanCachaDev/faktura-generator/compare/v0.1.0...v1.0.0
[0.1.0]: https://github.com/JanCachaDev/faktura-generator/releases/tag/v0.1.0

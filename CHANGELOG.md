# Changelog

## [0.3.2] - 2026-09-26

### Fixed

- Reject build output paths that resolve through symlinks into the project or its assets.

## [0.3.1] - 2026-09-25

### Fixed

- Include the `webvas` command and runtime build files in the installed gem.
- Use the current WebAssembly runtime on the published playground.
- Install a Gesso version that supports browser sketches.

## [0.3.0] - 2026-09-25

### Added

- Gesso sketches and RLSL WGSL shaders in the browser runtime.
- An editable playground with example modes, compressed share URLs, and standalone HTML downloads.
- `webvas new`, `serve`, and `build` commands, including custom WebAssembly runtime builds.
- Worker reset between runs, Ruby error reporting, and frame performance measurements.

## [0.1.0] - 2026-09-25

Initial release

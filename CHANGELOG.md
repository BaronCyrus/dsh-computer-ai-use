# Changelog

## 0.2.0 - 2026-10-30

- Installs from DSH's Plugins page with no restart, with an icon and a title and description in both languages.
- A settings page under Settings, Computer AI Use: the current version, a check for updates, and Update now.
- Automatic updates, on by default. The plugin installs a new version in the background once it is at least 24 hours old, has provenance from this repository's publish workflow, is not deprecated, and accepts the running DSH. It takes effect when DSH reopens. See `SECURITY.md`.
- The update takes the same profile lock as DSH's plugin manager, restores the profile's files when it fails, and never bypasses pnpm's release age policy.
- Releases are now published by GitHub Actions with provenance, and each one gets a GitHub Release.
- The approval prompt says the grant lasts until the session ends, because the DSH button reads "allow once".
- `computer_action` tells the model not to repeat a shortcut that showed no change. On a Mac where cmd+space switches the input method, a live test pressed it three times looking for Spotlight.

## 0.1.0 - 2026-10-30

- `computer_screenshot` and `computer_action` tools backed by the UI-TARS desktop operator.
- Session-wide approval through the DSH approval service, with a fail-closed `never` policy outside the full access preset.
- Actions refuse to run when the pointer or screen size changed since the last observation.
- Drag no longer uses the published operator's broken implementation, which presses at the current pointer and stops halfway (fixed upstream in UI-TARS #909 but never released).
- Clipboard writes retry when Windows briefly refuses them.

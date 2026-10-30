# Changelog

## 0.1.0 - 2026-10-30

- `computer_screenshot` and `computer_action` tools backed by the UI-TARS desktop operator.
- Session-wide approval through the DSH approval service, with a fail-closed `never` policy outside the full access preset.
- Actions refuse to run when the pointer or screen size changed since the last observation.
- Drag no longer uses the published operator's broken implementation, which presses at the current pointer and stops halfway (fixed upstream in UI-TARS #909 but never released).
- Clipboard writes retry when Windows briefly refuses them.

# Changelog

## Unreleased

- The approval prompt says the grant lasts until the session ends, because the DSH button reads "allow once".
- `computer_action` tells the model not to repeat a shortcut that showed no change. On a Mac where cmd+space switches the input method, a live test pressed it three times looking for Spotlight.

## 0.1.0 - 2026-10-30

- `computer_screenshot` and `computer_action` tools backed by the UI-TARS desktop operator.
- Session-wide approval through the DSH approval service, with a fail-closed `never` policy outside the full access preset.
- Actions refuse to run when the pointer or screen size changed since the last observation.
- Drag no longer uses the published operator's broken implementation, which presses at the current pointer and stops halfway (fixed upstream in UI-TARS #909 but never released).
- Clipboard writes retry when Windows briefly refuses them.

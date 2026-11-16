# Model:Samples firmware check (Beta)

> **Beta: still under testing.** The checks are verified against real files and the official firmware. The
> "Back to Samples OS" tab has only been tested against a simulated device, not yet on a real Model:Samples.

A static page with two tabs, for a Model:Samples running a custom (Model:Cycles-based) OS.

**Check a file.** Checks a `.syx` before you flash it: only the MAIN OS (section 3) may differ from Elektron's official
Model:Samples OS 1.13 container, and nothing the recovery path (bootstrap / STARTUP MENU) depends on may be touched.
Each report says where and when the file can be flashed and what the device can accept afterwards.

**Back to Samples OS.** Brings a Model:Samples that runs a Model:Cycles OS back to its own OS over USB, the two ways
18nelli18's [Modded-Cycles](https://github.com/18nelli18/Modded-Cycles) flasher offers:

| Cycles OS on the Model:Samples | Way back | Needs |
|---|---|---|
| Installed with Modded-Cycles or a Modded-Cycles derivative (key fix present) | *Model:Samples: back to its OS*, one step | `model-samples_OS1.13.syx` |
| Installed another way, e.g. an elektron-firmware-tool cross-flash (no key fix) | *Model:Cycles → Samples OS*, then the official Samples OS as a recommended clean-up | both official OS files |

Files are built in the browser and refused unless they match Modded-Cycles' reference SHA-256. They are sent with
its fast USB method (Web MIDI: Chrome, Edge or Opera, over https or `python3 -m http.server`, not `file://`), or
downloaded for Elektron Transfer.

Open `index.html` (or host the folder on GitHub Pages). Everything runs locally; nothing is uploaded.

## Check verdicts

| Verdict | Meaning |
|---|---|
| Safe | Only section 3 differs; transport, container, signature and OS update path all check out |
| Caveats | Flashable, but read the warnings (e.g. no 32-byte key fix → no USB way back to the Samples OS) |
| Do not flash | Device would refuse it, or the OS would not boot (recoverable via STARTUP MENU) |
| Brick risk | Bootstrap / updater / container header / section table changed, container too big for flash, or not a Samples container |

## Files

- `sanity.js`: checking logic, with no DOM (browser `window.SamplesSanity`, Node `require`).
- `revert.js`: the "Back to Samples OS" tab.
- `vendor/modded-cycles/`: `builder.js` and `flasher.js` from Modded-Cycles at commit `259441967e39`, unchanged (MIT, licences alongside).
- `index.html`: the UI.
- `test/cli.js`: command-line runner, `node test/cli.js firmware/*.syx` (`BRIEF=1` for one line per file).
- `test/*.test.js`: tests, `npm test` (Node 22+, no dependencies).
  - `crypto`: SHA-256 / HMAC-SHA256 against published vectors and Node's `crypto`.
  - `transport`: SysEx transport, container front checks and `rewrap()` on synthetic files.
  - `firmware`: verdicts on real files, the two ways back built with the vendored builder, and tampered copies of
    the official OS (bootstrap, updater, meta, section table, signature, checksum). Each test skips when its file
    is missing from `firmware/`.
  - `ui`: the result card of `index.html`, against a minimal DOM stand-in.
- `firmware/`: local test files, git-ignored. Never commit Elektron firmware.

The page holds no Elektron bytes and no key, only SHA-256 fingerprints of the official OS 1.13 parts. The Samples
HMAC key is derived from the candidate's own bootstrap after that bootstrap matches the official fingerprint.

Based on Modded-Cycles (`tools/mtlib`, `tools/crossflash.py`, `tools/mods_for_samples.py`, notes 02/41/57) and
Supermodel notes/41 §9 (in-place unpacking rule).

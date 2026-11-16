# Model:Samples firmware check (Beta)

> **Beta: still under testing.** The checks are verified against real files and the official firmware. The
> "Back to Samples OS" tab has only been tested against a simulated device, not yet on a real Model:Samples.

A static page with two tabs, for a Model:Samples running a custom (Model:Cycles-based) OS.

**Check a file.** Checks a `.syx` before you flash it: only the MAIN OS (section 3) may differ from Elektron's official
Model:Samples OS 1.13 container, and nothing the recovery path (bootstrap / STARTUP MENU) depends on may be touched.
Each report says where and when the file can be flashed and what the device can accept afterwards.
Two warnings come with a corrected file to download, checked again before it is offered:
- packet numbers past 16,383 in the old encoding: a re-wrapped `.syx` (same container, only the packet numbering);
- a Model:Cycles OS without the 32-byte key fix (e.g. an elektron-firmware-tool cross-flash): the same file with the
  key fix, as Modded-Cycles applies it (only those 32 bytes of the OS change, re-signed with the Samples key derived
  from the file's own official bootstrap). For the stock Cycles OS this installs the same OS as Modded-Cycles'
  reference build.

**Back to Samples OS.** Brings a Model:Samples that runs a Model:Cycles OS back to its own OS over USB, the two ways
18nelli18's [Modded-Cycles](https://github.com/18nelli18/Modded-Cycles) flasher offers:

| Cycles OS on the Model:Samples | Way back | Needs |
|---|---|---|
| Installed with Modded-Cycles or a Modded-Cycles derivative (key fix present) | *Model:Samples: back to its OS*, one step | `model-samples_OS1.13.syx` |
| Installed another way, e.g. an elektron-firmware-tool cross-flash (no key fix) | *Model:Cycles → Samples OS*, then, optionally, the official Samples OS as a clean-up | both official OS files |

- **The clean-up is optional.** After *Model:Cycles → Samples OS* the machine already runs the official Samples OS;
  only its flash still holds the Model:Cycles container (meta, updater, Cycles signature). Sending the official
  `model-samples_OS1.13.syx` restores the exact official state. Skip it if you are about to flash a custom smp-os build:
  every OS update writes a whole container, so that replaces it anyway.
- **Why only the second way asks "is this a Model:Samples?"** Over USB, a Model:Samples on a Cycles OS answers as a
  Model:Cycles, exactly like a real one, so only the front panel tells them apart. Both files use the Model:Cycles
  transport (0x11); the signature decides:

  | File | Signed with | Model:Samples on that Cycles OS | Real Model:Cycles |
  |---|---|---|---|
  | *Model:Samples: back to its OS* | Samples key (official Samples OS, unchanged) | accepted (the key fix makes it check with the Samples key) | refused ("Upgrade Failed"), nothing written |
  | *Model:Cycles → Samples OS* | Cycles key | accepted | **accepted: it switches to the Samples OS** |

  So *Send over USB* for *Model:Cycles → Samples OS* waits for a ticked "this is a Model:Samples" box; the first way
  needs no such check. Downloading the file is never blocked.

Files are built in the browser and refused unless they match Modded-Cycles' reference SHA-256. They are sent with
its fast USB method (Web MIDI: Chrome, Edge or Opera, over https or `python3 -m http.server`, not `file://`), or
downloaded for Elektron Transfer.

Open `docs/index.html`, or publish it with GitHub Pages (Settings › Pages › Deploy from a branch, folder `/docs`): only
the page and its scripts are served, not the tests or this README. Everything runs locally; nothing is uploaded.

## Check verdicts

| Verdict | Meaning |
|---|---|
| Safe | Only section 3 differs; transport, container, signature and OS update path all check out |
| Caveats | Flashable, but read the warnings (e.g. no 32-byte key fix → no USB way back to the Samples OS) |
| Do not flash | Device would refuse it, or the OS would not boot (recoverable via STARTUP MENU) |
| Brick risk | Bootstrap / updater / container header / section table changed, container too big for flash, or not a Samples container |

## Files

- `docs/`: the page, everything it loads and nothing else (the GitHub Pages folder; `.nojekyll` serves it as is).
  - `index.html`: the UI.
  - `sanity.js`: checking logic, with no DOM (browser `window.SamplesSanity`, Node `require`). `fixKey()` uses the vendored builder.
  - `revert.js`: the "Back to Samples OS" tab.
  - `vendor/modded-cycles/`: `builder.js` and `flasher.js` from Modded-Cycles at commit `259441967e39`, unchanged (MIT, licences alongside).
- `test/cli.js`: command-line runner, `node test/cli.js firmware/*.syx` (`BRIEF=1` for one line per file).
- `test/*.test.js`: tests, `npm test` (Node 22+, no dependencies).
  - `crypto`: SHA-256 / HMAC-SHA256 against published vectors and Node's `crypto`.
  - `transport`: SysEx transport, container front checks and `rewrap()` on synthetic files.
  - `firmware`: verdicts on real files, the two ways back built with the vendored builder, and tampered copies of
    the official OS (bootstrap, updater, meta, section table, signature, checksum). Each test skips when its file
    is missing from `firmware/`.
  - `ui`: the result card of `docs/index.html`, against a minimal DOM stand-in.
- `firmware/`: local test files, git-ignored. Never commit Elektron firmware.

The page holds no Elektron bytes and no key, only SHA-256 fingerprints of the official OS 1.13 parts. The Samples
HMAC key is derived from the candidate's own bootstrap after that bootstrap matches the official fingerprint.

Based on Modded-Cycles (`tools/mtlib`, `tools/crossflash.py`, `tools/mods_for_samples.py`, notes 02/41/57) and
Supermodel notes/41 §9 (in-place unpacking rule).

## Credits

The "Back to Samples OS" ways back are [18nelli18](https://github.com/18nelli18)'s finding, from
[Modded-Cycles](https://github.com/18nelli18/Modded-Cycles) (notes/41). They found that the Model:Samples bootstrap
starts the Samples OS from a Model:Cycles container, and that recomputing a 32-byte key constant lets a Cycles OS accept
the official Samples OS over USB. They also made the reference builds this page checks against. The key-fix download
applies the same finding.

## Licence

MIT, see [LICENSE](LICENSE). The files in `docs/vendor/modded-cycles/` keep their own MIT licences, alongside them.

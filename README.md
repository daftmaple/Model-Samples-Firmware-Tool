# Model:Samples Firmware Tool (Beta)

> **Beta: still under testing.** The checks are verified against real files and the official firmware. The
> "Back to Samples OS" tab has only been tested against a simulated device, not yet on a real Model:Samples. Files from
> the "Install a Cycles OS" tab are byte-identical to Modded-Cycles' own builds, but not yet sent from this page to a real machine.

A static page for a Model:Samples running a custom (Model:Cycles-based) OS.

## Quick start

1. Open the page in Chrome, Edge or Opera on a computer (Web MIDI), and back up your projects with Elektron Transfer.
2. Pick what you want to do on the **Start** view: *Install a Cycles OS*, *Back to Samples OS*, or *Check a file*.
3. Follow the numbered steps. To install mods: say which OS the machine runs, add your `.syx` files, then connect
   and send over USB, or download the file for a SysEx tool.

If something goes wrong, the **Help & recovery** view has the STARTUP MENU steps (FUNC + power on, TRIG 4, the official
`model-samples_OS1.13.syx` to MIDI IN). It also explains how to send a file with a SysEx tool (for example Elektron
C6), which OS a machine runs, and the terms used on the page. Help links inside a tab open in a new browser tab, so
the tab keeps its files.

## The tabs

**Check a file.** Checks a `.syx` before you flash it: only the MAIN OS (section 3) may differ from Elektron's official
Model:Samples OS 1.13 container, and nothing the recovery path (bootstrap / STARTUP MENU) depends on may be touched.
Each report says where and when the file can be flashed and what the device can accept afterwards.
Two warnings come with a corrected file, from one "Download the fixed .syx" button, checked again before it is offered
(when a file has both, the key fix also fixes the packet numbering):
- packet numbers past 16,383 in the old encoding: a re-wrapped `.syx` (same container, only the packet numbering);
- a Model:Cycles OS without the 32-byte key fix (e.g. an elektron-firmware-tool cross-flash): the same file with the
  key fix, as Modded-Cycles applies it (only those 32 bytes of the OS change, re-signed with the Samples key derived
  from the file's own official bootstrap). For the stock Cycles OS this installs the same OS as Modded-Cycles'
  reference build.

**Install a Cycles OS.** Installs a modded Model:Cycles OS built for a real Model:Cycles (Modded-Cycles or a
Modded-Cycles derivative) on a Model:Samples, from that `.syx` and the official `model-samples_OS1.13.syx`. A file
already packed for the Model:Samples (`smp-os` or `cyc-os`, for example one downloaded from this tab) needs only itself. Laid out like
"Back to Samples OS": (1) which OS the Model:Samples runs now, (2) your files, (3) connect and send over USB (the
machine's answer is compared with step 1), or (4) download the file for a SysEx tool. It builds
the same file as Modded-Cycles' `mods_for_samples.py` / `modsForSamples`: the OS (section 3) in the official Samples
container, with the 32-byte key fix (only those bytes change), signed with the Samples key. The official Model:Cycles
OS is not needed. The Model:Cycles key comes from the file's own bootstrap after it matches Elektron's fingerprint, and
the file's signature must check with it. The OS chosen in step 1 picks the transport; both are checked again and
offered only if "Safe", and USB sending refuses a machine that answers as the other product:

| Output | Transport | Flash it from |
|---|---|---|
| `…_for-samples_smp-os.syx` | 0x0F | a Model:Samples on its own OS (USB: any SysEx tool), or its STARTUP MENU over MIDI IN |
| `…_for-samples_cyc-os.syx` | 0x11 | a Model:Samples already on a Cycles OS with the key fix, over USB (changing mods later) |

The STARTUP MENU takes only the smp-os file, whatever OS is installed: to flash from it with a SysEx tool, pick "Its own
Model:Samples OS" in step 1. The tab says so under step 1 and in the download section.

Refused when anything but the OS differs from Elektron's Model:Cycles OS 1.13 (header, section table, bootstrap,
updater, meta), when the signature does not check, when the OS's update-check code or its key constant was changed,
or when the result is too big for the Model:Samples flash. An OS past 0x40200000 (Supermodel) is accepted under the
in-place unpacking rule, which Modded-Cycles' builder does not apply. A file already packed for the Model:Samples is
accepted too, with the key fix added if missing. What it cannot check is whether each
mod works on a Model:Samples. The hardware is the same and Modded-Cycles builds the same mods for both machines, and
the STARTUP MENU remains the way back if an OS does not start.

Files do not move between tabs: each tab takes its own files, and leaving a tab clears them (with its choices and
log; not while it is sending). To see the full report of a file this tab built, download it and drop it on the Check
tab.

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

The tab runs in the same order as "Install a Cycles OS": (1) how the Cycles OS was installed, (2) the official OS
files, (3) connect and send over USB, or (4) download the files for a SysEx tool. With a MIDI interface, the files can
be skipped: from the STARTUP MENU, the official `model-samples_OS1.13.syx` goes in as it is over MIDI IN (not over USB,
where a Cycles OS ignores it).

Files are built in the browser and refused unless they match Modded-Cycles' reference SHA-256. They are sent with
its fast USB method (Web MIDI: Chrome, Edge or Opera, over https or `python3 -m http.server`, not `file://`), or
downloaded for a SysEx tool.

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
  - `index.html`: the markup of every view (Start, the three tabs, Help & recovery). No inline CSS or script.
  - `style.css`: all styles, light and dark.
  - `app.js`: views and navigation (the hash picks the view: `#revert-unfixed` opens Back to Samples OS, `#help-recovery` opens
    Help at that section; keyboard tabs).
  - `ui.js`: DOM helpers shared by every tab (`el`, drop zones, file checklist, log, downloads).
  - `sanity.js`: checking logic, with no DOM (browser `window.SamplesSanity`, Node `require`). `fixKey()` uses the vendored builder.
  - `sanity.js` also has `forSamples()`, the packing behind "Install a Cycles OS".
  - `check.js`: the "Check a file" tab (the result card).
  - `install.js`: the "Install a Cycles OS" tab.
  - `revert.js`: the "Back to Samples OS" tab.
  - `usb.js`: USB sending shared by both tabs (Web MIDI, port menu, asking the machine who it is, fast USB method,
    the card for each file to send).
  - `vendor/modded-cycles/`: `builder.js` and `flasher.js` from Modded-Cycles at commit `259441967e39`, unchanged (MIT, licences alongside).
- `test/cli.js`: command-line runner, `node test/cli.js firmware/*.syx` (`BRIEF=1` for one line per file).
- `test/*.test.js`: tests, `npm test` (Node 22+, no dependencies).
  - `crypto`: SHA-256 / HMAC-SHA256 against published vectors and Node's `crypto`.
  - `transport`: SysEx transport, container front checks and `rewrap()` on synthetic files.
  - `firmware`: verdicts on real files, the two ways back built with the vendored builder, and tampered copies of
    the official OS (bootstrap, updater, meta, section table, signature, checksum). Each test skips when its file
    is missing from `firmware/`.
  - `convert`: `forSamples()` on Model:Cycles builds made from the `_for-samples` files, byte-identical to
    Modded-Cycles' `modsForSamples` in both transports, the stock Cycles OS (Modded-Cycles' reference file), Supermodel
    past 0x40200000, files already packed for the Model:Samples, and refusals (bootstrap, signature, update-check code,
    key constant, wrong files).
  - `ui`: the result card of `docs/check.js` (and its fixed-file buttons), the "Install a Cycles
    OS" tab (including the machine's answer checked against step 1, and the separate download section) and the "Back to Samples OS" tab, against a minimal DOM
    stand-in.
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

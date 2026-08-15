# Text Formatter

An Adobe Illustrator script that applies formatting — size, scale,
rotation, baseline shift, tracking, word spacing, font, fill color,
underline, and strikethrough — to specific characters or words inside
selected text, instead of the whole text frame at once.

Pick *which* characters to target (a single position, a range, every
Nth character, a custom list, everything, or a text/character match
like "every vowel"), pick *what* to change about them, and preview the
result live before committing.

## Features

- **Flexible targeting** — Single Position, Range, Every Nth (pattern),
  Custom List, All, or Match Text (match specific letters or whole
  words, e.g. every `the`).
- **Three scopes** — Letters within each word, Whole Words, or All
  Characters (ignoring word breaks entirely).
- **Works inside groups** — finds text frames nested inside selected
  groups, not just bare text frames.
- **Formatting options** — Size, Horizontal/Vertical Scale, Rotation,
  Baseline Shift, Tracking, Word Spacing, Font, Fill Color (hex, RGB,
  or CMYK), Underline, Strikethrough.
- **Random variation** — optional jitter on size and/or rotation for a
  hand-lettered, organic look. Rolls once per targeted word or letter
  depending on scope, so a targeted word doesn't fall apart into
  independently-randomized letters.
- **Non-destructive editing** — every calculation is based on a
  snapshot taken when the dialog opens, so Preview → tweak → Preview
  again never stacks changes on top of each other.
- **Presets** — save, load, and delete named presets, stored in a
  small text file in your Documents folder, for one-click repeat jobs.
- **Live counter** — see how many characters your current settings
  will affect before you apply anything.

## Requirements

- Adobe Illustrator with legacy ExtendScript support (Illustrator CC
  through the 2023 releases). Newer Illustrator versions are moving to
  the UXP scripting model, where classic `.jsx` scripts may not be
  supported — check File > Scripts in your version first.
- Windows or macOS.

## Installation

**Quick, no-install option (works in any version):**
1. Open Illustrator with a document containing text.
2. Go to `File > Scripts > Other Script...`
3. Browse to and select `TextFormatter.jsx`.

**Permanent install (adds it to the Scripts menu):**
1. Locate your Illustrator app's `Scripts` folder. The exact path
   varies by version and OS — it's typically under
   `.../Adobe Illustrator [version]/Presets/en_US/Scripts` (search for
   "Scripts" inside your Illustrator install folder if you can't find
   it).
2. Copy `TextFormatter.jsx` into that folder.
3. Restart Illustrator. It will now appear under
   `File > Scripts > TextFormatter`.

## Usage

1. Select one or more text frames (or a group containing them).
2. Run the script.
3. **1. Target** tab — choose a Scope and a Target Mode to decide which
   characters or words are affected.
4. **2. Format** tab — check the boxes for whichever properties you
   want to change, and set their values.
5. **3. Random** tab — optionally turn on random size/rotation
   variation.
6. **4. Presets** tab — save your current settings as a preset, or
   load/delete a saved one.
7. Click **Preview** to see the result on your actual text (you can
   keep tweaking and previewing again). Click **Cancel** to discard
   everything and restore your text exactly as it was, or **Done** to
   keep the result and close the dialog.


## License

Copyright (c) 2026 Luka

SPDX-License-Identifier: CC-BY-NC-ND-4.0

This project is licensed under the **Creative Commons Attribution-
NonCommercial-NoDerivatives 4.0 International License (CC BY-NC-ND
4.0)**.

**Human-readable summary** (not a substitute for the license itself):

You are free to:
- **Share** — copy and redistribute this script in any medium or
  format, for any non-commercial purpose, as long as you give
  appropriate credit to the original author.

Under the following terms:
- **Attribution** — You must give appropriate credit to the original
  author, link back to this repository, and indicate if changes were
  made.
- **NonCommercial** — You may not use this script, or any part of it,
  for commercial purposes.
- **NoDerivatives** — If you remix, transform, alter, or build upon
  this script, you may not distribute the modified version. You may
  only share unmodified copies of the original file.
- **No additional restrictions** — You may not apply legal terms or
  technological measures that legally restrict others from doing
  anything the license permits.

Full legal text: https://creativecommons.org/licenses/by-nc-nd/4.0/legalcode
Human-readable deed: https://creativecommons.org/licenses/by-nc-nd/4.0/

This project is distributed **without any warranty** of any kind,
express or implied. Use it at your own risk.

> Note: Creative Commons licenses were written with creative works in
> mind rather than software, so they don't address things like patent
> rights the way a dedicated software license would. It's still a
> common, well-understood choice for standalone utility scripts like
> this one within the design-tool scripting community, and it directly
> matches the terms above: share it freely, don't sell it, don't
> redistribute altered versions.

## Issues

Found a bug or have a feature request? Open an issue in this
repository describing it. Since the license doesn't permit
redistributing modified copies, please don't attach a patched version
of the script — the maintainer will make any fix directly.

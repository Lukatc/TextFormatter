#target illustrator

// =====================================================================
//  TEXT FORMATTER
//  Adobe Illustrator script — v4.4
// -----------------------------------------------------------------------
//  Applies size, horizontal/vertical scale, rotation, baseline shift,
//  tracking, word spacing, font, fill color, underline, and
//  strikethrough to specific characters or words inside selected text
//  frames — including text nested inside groups.
//
//  Targets can be a single position, a range, an every-Nth pattern, a
//  custom list of positions, all characters, or a text/character match
//  (e.g. every vowel, every "the") — with optional random variation on
//  size/rotation and save/load/delete presets.
//
//  Full version history: see CHANGELOG.md
//  License: CC BY-NC-ND 4.0 — see LICENSE
//  (personal/non-commercial use only; no redistributing modified copies)
// =====================================================================

// -------------------------------------------------------------------
//  SMALL UTILITIES
// -------------------------------------------------------------------

function trim(str) {
    if (str === null || str === undefined) return "";
    return String(str).replace(/^\s+|\s+$/g, "");
}

function randomBetween(min, max) {
    return min + Math.random() * (max - min);
}

function hexToRGB(hex) {
    hex = trim(hex).replace(/^#/, "");
    if (hex.length === 3) {
        hex = hex.charAt(0) + hex.charAt(0) + hex.charAt(1) + hex.charAt(1) + hex.charAt(2) + hex.charAt(2);
    }
    if (!/^[0-9A-Fa-f]{6}$/.test(hex)) return null;
    return {
        r: parseInt(hex.substring(0, 2), 16),
        g: parseInt(hex.substring(2, 4), 16),
        b: parseInt(hex.substring(4, 6), 16)
    };
}

function clampNum(n, lo, hi) {
    if (isNaN(n)) return null;
    return Math.max(lo, Math.min(hi, n));
}

// Illustrator's character `tracking` is relative (1/1000 of an em, i.e.
// 1/1000 of that character's own font size in points) rather than an
// absolute distance, so "add N px of gap" has to be converted per
// character using that character's own size — the same px value should
// look like the same physical gap whether it's next to 12pt or 60pt
// text. Treats 1px == 1pt, which matches Illustrator's own "Pixels"
// ruler unit.
function pxToTrackingUnits(px, fontSizePt) {
    if (!fontSizePt || fontSizePt <= 0) return 0;
    return (px / fontSizePt) * 1000;
}

function rgbToHex(r, g, b) {
    function h(v) {
        v = Math.max(0, Math.min(255, Math.round(v)));
        var s = v.toString(16);
        return s.length === 1 ? "0" + s : s;
    }
    return (h(r) + h(g) + h(b)).toUpperCase();
}

// Standard, non-color-managed CMYK <-> RGB conversion. Good enough for
// dialing in a fill color visually; not a substitute for real color
// management if exact print matching matters.
function cmykToRGB(c, m, y, k) {
    c /= 100; m /= 100; y /= 100; k /= 100;
    return {
        r: Math.round(255 * (1 - c) * (1 - k)),
        g: Math.round(255 * (1 - m) * (1 - k)),
        b: Math.round(255 * (1 - y) * (1 - k))
    };
}

function rgbToCMYK(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var k = 1 - Math.max(r, g, b);
    if (k >= 1) return { c: 0, m: 0, y: 0, k: 100 };
    return {
        c: Math.round(((1 - r - k) / (1 - k)) * 100),
        m: Math.round(((1 - g - k) / (1 - k)) * 100),
        y: Math.round(((1 - b - k) / (1 - k)) * 100),
        k: Math.round(k * 100)
    };
}

// Converts a 1-based (or negative, from-the-end) position into a
// 0-based index within a collection of the given length.
// e.g. resolveIndex(1, 5) -> 0   |   resolveIndex(-1, 5) -> 4 (last)
function resolveIndex(pos, length) {
    if (isNaN(pos)) return -1;
    pos = Math.floor(pos);
    if (pos === 0 || length <= 0) return -1;
    var idx = (pos < 0) ? (length + pos) : (pos - 1);
    if (idx < 0 || idx >= length) return -1;
    return idx;
}

// Resolves a position-based Target Mode against a pool of a given length.
// Returns a sorted array of unique 0-based indices into that pool.
function selectByMode(poolLength, mode, params) {
    var result = [];
    var seen = {};
    function add(idx) {
        if (idx >= 0 && idx < poolLength && !seen[idx]) {
            seen[idx] = true;
            result.push(idx);
        }
    }

    if (mode === "single") {
        add(resolveIndex(params.pos, poolLength));
    } else if (mode === "range") {
        var a = resolveIndex(params.from, poolLength);
        var b = resolveIndex(params.to, poolLength);
        if (a !== -1 && b !== -1) {
            var lo = Math.min(a, b), hi = Math.max(a, b);
            for (var i = lo; i <= hi; i++) add(i);
        }
    } else if (mode === "everyNth") {
        var start = resolveIndex(params.start, poolLength);
        var step = params.step;
        if (start !== -1 && step >= 1) {
            for (var i = start; i < poolLength; i += step) add(i);
        }
    } else if (mode === "customList") {
        for (var i = 0; i < params.list.length; i++) {
            add(resolveIndex(params.list[i], poolLength));
        }
    } else if (mode === "all") {
        for (var i = 0; i < poolLength; i++) add(i);
    }

    result.sort(function (x, y) { return x - y; });
    return result;
}

function matchesCharSet(ch, setStr, caseInsensitive) {
    if (!setStr) return false;
    var c = caseInsensitive ? ch.toLowerCase() : ch;
    var set = caseInsensitive ? setStr.toLowerCase() : setStr;
    return set.indexOf(c) !== -1;
}


// -------------------------------------------------------------------
//  SELECTION / TEXT-FRAME COLLECTION
// -------------------------------------------------------------------

// Recursively collects TextFrame items from the selection, descending
// into groups so text inside a grouped logo/lockup still works.
function collectTextFrames(items, out) {
    for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (it.typename === "TextFrame") {
            out.push(it);
        } else if (it.typename === "GroupItem") {
            collectTextFrames(it.pageItems, out);
        }
    }
}

// Splits a text frame's characters into "words" (runs of non-whitespace)
// using our own tokenizer rather than Illustrator's built-in .words
// collection, which can behave inconsistently around punctuation.
// Returns an array of words, each word being an array of absolute
// 0-based indices into frame.characters.
function tokenizeWords(frame) {
    var chars = frame.characters;
    var words = [];
    var current = [];
    for (var i = 0; i < chars.length; i++) {
        var ch = chars[i].contents;
        if (/^\s$/.test(ch)) {
            if (current.length > 0) { words.push(current); current = []; }
        } else {
            current.push(i);
        }
    }
    if (current.length > 0) words.push(current);
    return words;
}

function getWordText(frame, indices) {
    var s = "";
    for (var i = 0; i < indices.length; i++) s += frame.characters[indices[i]].contents;
    return s;
}


// -------------------------------------------------------------------
//  ORIGINAL-STATE CAPTURE / RESTORE
// -------------------------------------------------------------------

// Captures every character's attributes in every selected frame, once,
// before any edits are made. All formatting math is done relative to
// this snapshot so repeated Apply clicks never compound on each other.
function captureOriginals(textFrames) {
    var store = [];
    for (var t = 0; t < textFrames.length; t++) {
        var chars = textFrames[t].characters;
        var data = {};
        for (var i = 0; i < chars.length; i++) {
            var ca = chars[i].characterAttributes;
            data[i] = {
                size: ca.size,
                hScale: ca.horizontalScale,
                vScale: ca.verticalScale,
                rotation: ca.rotation,
                baseline: ca.baselineShift,
                tracking: ca.tracking,
                fontName: ca.textFont.name,
                fillColor: ca.fillColor,
                underline: ca.underline,
                strike: ca.strikeThrough
            };
        }
        store.push(data);
    }
    return store;
}

// Restores captured characters back to their original attributes.
//
// Only walks characters that were actually touched this session (tracked
// in `touched`, updated by applyFormattingToAll every time Preview/Apply
// runs) instead of every character in every selected frame. Most edits
// only target a handful of characters, so this turns Reset from "walk the
// whole text frame" into "walk the dozen characters that actually
// changed" — which is effectively instant instead of scaling with the
// size of the text frame.
//
// This also used to call app.textFonts.getByName(orig.fontName) once PER
// CHARACTER, which is by far the most expensive call in the whole
// script (it's effectively a linear search through every font
// installed). Fixed by caching each font lookup so it only happens once
// per unique font name, not once per character.
function resetToOriginal(textFrames, originals, touched, onProgress) {
    var fontCache = {};
    function getFont(name) {
        if (!fontCache.hasOwnProperty(name)) {
            try { fontCache[name] = app.textFonts.getByName(name); }
            catch (eFont) { fontCache[name] = null; }
        }
        return fontCache[name];
    }

    var totalTouched = 0;
    for (var t = 0; t < textFrames.length; t++) {
        for (var idxStr in touched[t]) { if (touched[t].hasOwnProperty(idxStr)) totalTouched++; }
    }
    if (totalTouched === 0) {
        if (onProgress) onProgress(0, 0);
        return;
    }

    // Only bother with periodic progress repaints for large batches (e.g.
    // "All" mode on a big block of text) — for the common case of a small
    // handful of touched characters this loop finishes before a repaint
    // would even matter, so skipping it avoids paying for UI updates we
    // don't need.
    var PROGRESS_STEP = 100;
    var reportProgress = onProgress && totalTouched > PROGRESS_STEP;
    var done = 0;

    for (var t = 0; t < textFrames.length; t++) {
        var frame = textFrames[t];
        for (var idxStr in touched[t]) {
            if (!touched[t].hasOwnProperty(idxStr)) continue;
            var idx = parseInt(idxStr, 10);
            var orig = originals[t][idx];
            if (orig) {
                var ca = frame.characters[idx].characterAttributes;
                ca.size = orig.size;
                ca.horizontalScale = orig.hScale;
                ca.verticalScale = orig.vScale;
                ca.rotation = orig.rotation;
                ca.baselineShift = orig.baseline;
                ca.tracking = orig.tracking;
                var f = getFont(orig.fontName);
                if (f) ca.textFont = f;
                ca.fillColor = orig.fillColor;
                ca.underline = orig.underline;
                ca.strikeThrough = orig.strike;
            }
            done++;
            if (reportProgress && (done % PROGRESS_STEP === 0)) onProgress(done, totalTouched);
        }
    }
    if (onProgress) onProgress(totalTouched, totalTouched);
}

// Counts how many characters (across all frames) are currently marked
// touched. Used to decide whether there's anything to revert/discard,
// and whether an existing Preview is on the art at all.
function countTouched(touched) {
    var n = 0;
    for (var t = 0; t < touched.length; t++) {
        for (var idxStr in touched[t]) { if (touched[t].hasOwnProperty(idxStr)) n++; }
    }
    return n;
}

// Builds one { idx: true } lookup map per frame from computeTargets()
// results, so "is this index still targeted?" is an O(1) check instead
// of a linear scan through an indices array.
function buildTargetMaps(frameTargetsList) {
    var maps = [];
    for (var t = 0; t < frameTargetsList.length; t++) {
        var map = {};
        var idxArr = frameTargetsList[t].indices;
        for (var i = 0; i < idxArr.length; i++) map[idxArr[i]] = true;
        // Word Spacing targets space characters directly, which never
        // appear in `indices` (tokenizeWords strips whitespace out of
        // every word), so they need to be folded in separately here or
        // revertUntargeted would think every space is stale and keep
        // reverting it right after applyFormattingToAll sets it.
        var spArr = frameTargetsList[t].spaceIndices;
        if (spArr) { for (var i = 0; i < spArr.length; i++) map[spArr[i]] = true; }
        maps.push(map);
    }
    return maps;
}

// Reverts ONLY the characters that were touched by a previous Preview/
// Done but are NOT part of the new target set — e.g. you changed the
// scope, switched target mode, or unchecked a format option, so a
// character that used to be affected shouldn't stay affected.
//
// Characters that remain targeted are deliberately left alone here:
// applyFormattingToAll always computes fresh from the untouched
// "originals" snapshot, so writing the new value already overwrites
// whatever the last Preview/Done drew — reverting them first would just
// be a wasted write followed immediately by another write. Since the
// common case is "I only changed a number, not WHAT's targeted," this
// difference set is usually empty, which is why tweaking a value and
// clicking Preview again is now near-instant instead of paying for a
// full revert of everything every time.
function revertUntargeted(textFrames, originals, touched, newTargetMaps, onProgress) {
    var fontCache = {};
    function getFont(name) {
        if (!fontCache.hasOwnProperty(name)) {
            try { fontCache[name] = app.textFonts.getByName(name); }
            catch (eFont) { fontCache[name] = null; }
        }
        return fontCache[name];
    }

    var toRevert = [];
    for (var t = 0; t < textFrames.length; t++) {
        for (var idxStr in touched[t]) {
            if (!touched[t].hasOwnProperty(idxStr)) continue;
            var idx = parseInt(idxStr, 10);
            if (!newTargetMaps[t][idx]) toRevert.push({ t: t, idx: idx });
        }
    }
    if (toRevert.length === 0) { if (onProgress) onProgress(0, 0); return; }

    var PROGRESS_STEP = 100;
    var reportProgress = onProgress && toRevert.length > PROGRESS_STEP;
    for (var i = 0; i < toRevert.length; i++) {
        var t = toRevert[i].t, idx = toRevert[i].idx;
        var orig = originals[t][idx];
        if (orig) {
            var ca = textFrames[t].characters[idx].characterAttributes;
            ca.size = orig.size;
            ca.horizontalScale = orig.hScale;
            ca.verticalScale = orig.vScale;
            ca.rotation = orig.rotation;
            ca.baselineShift = orig.baseline;
            ca.tracking = orig.tracking;
            var f = getFont(orig.fontName);
            if (f) ca.textFont = f;
            ca.fillColor = orig.fillColor;
            ca.underline = orig.underline;
            ca.strikeThrough = orig.strike;
        }
        delete touched[t][idx];
        if (reportProgress && ((i + 1) % PROGRESS_STEP === 0)) onProgress(i + 1, toRevert.length);
    }
    if (onProgress) onProgress(toRevert.length, toRevert.length);
}


// -------------------------------------------------------------------
//  TARGET RESOLUTION (shared by the live counter and by Apply)
// -------------------------------------------------------------------

// Given a frame and a settings object (from getSettingsFromUI), returns
// { indices: [absolute char indices to format], wordCount, charCount }.
// This is read-only — safe to call on every keystroke for the live counter.
function computeTargets(frame, settings) {
    var words = tokenizeWords(frame);
    var flatChars = [];
    for (var w = 0; w < words.length; w++) {
        for (var c = 0; c < words[w].length; c++) flatChars.push(words[w][c]);
    }

    // Word Spacing works on the actual whitespace characters SEPARATING
    // words, which tokenizeWords deliberately excludes from every word
    // (see above) — so they're collected here as their own list rather
    // than folded into targetIndices/groups, and applied later with
    // their own dedicated pass that only ever touches tracking, never
    // the rest of the format options (a space getting resized, rotated,
    // or recolored isn't useful and could show visibly if underline/
    // strikethrough is enabled). Only computed when actually enabled,
    // since it's an extra full pass over every character in the frame.
    var spaceIndices = [];
    if (settings.wordSpacing && settings.wordSpacing.enabled) {
        var chars = frame.characters;
        for (var i = 0; i < chars.length; i++) {
            if (/^\s$/.test(chars[i].contents)) spaceIndices.push(i);
        }
    }

    var targetIndices = [];
    // groups: array of arrays of char indices. Everything inside one
    // group shares a single random roll (see applyFormattingToAll) —
    // for Words scope that's a whole word, so every letter in it gets
    // the SAME random size/rotation offset instead of jittering
    // independently. For Letters-per-word and All Characters scope,
    // each targeted letter is its own group of one, since those scopes
    // are targeting individual letters and should vary independently.
    var groups = [];
    var seen = {};
    function addIdx(idx) {
        if (!seen[idx]) { seen[idx] = true; targetIndices.push(idx); }
    }

    if (settings.scope === "words") {
        if (settings.mode === "match") {
            var matchWords = trim(settings.matchText).split(",");
            for (var i = 0; i < matchWords.length; i++) matchWords[i] = trim(matchWords[i]);
            for (var w = 0; w < words.length; w++) {
                var wordText = getWordText(frame, words[w]);
                var cmp = settings.caseInsensitive ? wordText.toLowerCase() : wordText;
                for (var m = 0; m < matchWords.length; m++) {
                    if (!matchWords[m]) continue;
                    var target = settings.caseInsensitive ? matchWords[m].toLowerCase() : matchWords[m];
                    if (cmp === target) {
                        var g = [];
                        for (var c = 0; c < words[w].length; c++) { addIdx(words[w][c]); g.push(words[w][c]); }
                        groups.push(g);
                        break;
                    }
                }
            }
        } else {
            var selWords = selectByMode(words.length, settings.mode, settings.params);
            for (var i = 0; i < selWords.length; i++) {
                var w = selWords[i];
                var g = [];
                for (var c = 0; c < words[w].length; c++) { addIdx(words[w][c]); g.push(words[w][c]); }
                groups.push(g);
            }
        }
    } else if (settings.scope === "lettersPerWord") {
        for (var w = 0; w < words.length; w++) {
            if (settings.mode === "match") {
                for (var c = 0; c < words[w].length; c++) {
                    var ch = frame.characters[words[w][c]].contents;
                    if (matchesCharSet(ch, settings.matchText, settings.caseInsensitive)) { addIdx(words[w][c]); groups.push([words[w][c]]); }
                }
            } else {
                var selPositions = selectByMode(words[w].length, settings.mode, settings.params);
                for (var i = 0; i < selPositions.length; i++) { addIdx(words[w][selPositions[i]]); groups.push([words[w][selPositions[i]]]); }
            }
        }
    } else if (settings.scope === "allChars") {
        if (settings.mode === "match") {
            for (var i = 0; i < flatChars.length; i++) {
                var ch = frame.characters[flatChars[i]].contents;
                if (matchesCharSet(ch, settings.matchText, settings.caseInsensitive)) { addIdx(flatChars[i]); groups.push([flatChars[i]]); }
            }
        } else {
            var selPositions = selectByMode(flatChars.length, settings.mode, settings.params);
            for (var i = 0; i < selPositions.length; i++) { addIdx(flatChars[selPositions[i]]); groups.push([flatChars[selPositions[i]]]); }
        }
    }

    return { indices: targetIndices, groups: groups, spaceIndices: spaceIndices, wordCount: words.length, charCount: flatChars.length };
}


// -------------------------------------------------------------------
//  APPLYING FORMATTING
// -------------------------------------------------------------------

function applyToCharacter(frame, idx, orig, settings, resolvedFont, resolvedColor, sizeRoll, rotationRoll) {
    var ca = frame.characters[idx].characterAttributes;

    // Random variation used to only fire when Size/Rotation above were
    // ALSO checked, because these blocks were gated entirely behind
    // settings.size.enabled / settings.rotation.enabled. That meant
    // checking only "Add variation for a hand-lettered look" did
    // nothing. Now each block runs if either the explicit value is
    // enabled OR randomize wants to touch that property, using the
    // original attribute as the base when no explicit value was set.
    //
    // sizeRoll/rotationRoll are rolled ONCE by the caller per targeted
    // unit (see applyFormattingToAll) rather than once per character
    // here, so every letter in the same unit (e.g. a whole targeted
    // word) shares the same random offset instead of jittering
    // independently letter-by-letter.
    var wantsSizeRandom = settings.randomize && settings.sizeVariation;
    if (settings.size.enabled || wantsSizeRandom) {
        var pct = settings.size.enabled ? settings.size.value : 100;
        if (wantsSizeRandom) pct = pct + sizeRoll;
        ca.size = orig.size * (pct / 100);
    }
    if (settings.hScale.enabled) ca.horizontalScale = settings.hScale.value;
    if (settings.vScale.enabled) ca.verticalScale = settings.vScale.value;
    var wantsRotationRandom = settings.randomize && settings.rotationVariation;
    if (settings.rotation.enabled || wantsRotationRandom) {
        var rot = settings.rotation.enabled ? settings.rotation.value : orig.rotation;
        if (wantsRotationRandom) rot = rot + rotationRoll;
        ca.rotation = rot;
    }
    if (settings.baseline.enabled) ca.baselineShift = settings.baseline.value;
    if (settings.tracking.enabled) ca.tracking = settings.tracking.value;
    if (settings.font.enabled && resolvedFont) ca.textFont = resolvedFont;
    if (settings.color.enabled && resolvedColor) ca.fillColor = resolvedColor;
    if (settings.underline.enabled) ca.underline = settings.underline.value;
    if (settings.strike.enabled) ca.strikeThrough = settings.strike.value;
}

// touched: array (one entry per text frame) of { idx: true } maps. Every
// character actually written to gets recorded here so Cancel only has to
// revert what changed, instead of walking the whole text frame.
//
// onProgress(done, total), if given, is called periodically during large
// jobs so the dialog can show real progress and repaint. Writing
// character attributes one at a time is inherently slow in Illustrator
// (each write can trigger a text reflow), so a big target (e.g. "All
// Characters" on a long block of text) can take long enough that,
// without any UI repaint in between, the OS decides Illustrator has
// stopped responding and shows the white "not responding" overlay —
// even though the script is still working. Periodic repaints avoid that.
function applyFormattingToAll(textFrames, originals, settings, touched, onProgress) {
    // Resolve the font and build the fill color ONCE per call, not once
    // per character. app.textFonts.getByName() is a linear search through
    // every installed font — the target font is the same for every
    // character in this call, so looking it up per-character (as this
    // used to do) turned an O(1) lookup into an O(n) one and was the main
    // reason Apply/Preview felt slow with Font formatting enabled.
    var resolvedFont = null;
    if (settings.font.enabled) {
        try { resolvedFont = app.textFonts.getByName(settings.font.name); } catch (eFont) { resolvedFont = null; }
    }
    var resolvedColor = null;
    if (settings.color.enabled && settings.color.rgb) {
        resolvedColor = new RGBColor();
        resolvedColor.red = settings.color.rgb.r;
        resolvedColor.green = settings.color.rgb.g;
        resolvedColor.blue = settings.color.rgb.b;
    }

    // First pass: figure out what needs to change in every frame before
    // touching anything, so we know the true total up front for progress
    // reporting (and so a mistake in a later frame can't leave earlier
    // frames half-applied).
    var wordSpacingOn = !!(settings.wordSpacing && settings.wordSpacing.enabled);

    var frameTargets = [];
    var grandTotal = 0;
    for (var t = 0; t < textFrames.length; t++) {
        var targets = computeTargets(textFrames[t], settings);
        frameTargets.push(targets);
        grandTotal += targets.indices.length + (wordSpacingOn ? targets.spaceIndices.length : 0);
    }

    var PROGRESS_STEP = 100;
    var reportProgress = onProgress && grandTotal > PROGRESS_STEP;
    var done = 0;

    var totalChars = 0, framesTouched = 0;
    for (var t = 0; t < textFrames.length; t++) {
        var frame = textFrames[t];
        var targets = frameTargets[t];
        var hasSpaceWork = wordSpacingOn && targets.spaceIndices.length > 0;
        if (targets.indices.length === 0 && !hasSpaceWork) continue;
        framesTouched++;
        for (var g = 0; g < targets.groups.length; g++) {
            var group = targets.groups[g];
            // One random roll per group — every character in this group
            // (a whole word for Words scope, a single letter otherwise)
            // shares this exact offset, so a targeted word's letters all
            // scale/rotate together as one unit instead of each letter
            // jittering to its own independent random value.
            var sizeRoll = (settings.randomize && settings.sizeVariation)
                ? randomBetween(-settings.sizeVariation, settings.sizeVariation) : 0;
            var rotationRoll = (settings.randomize && settings.rotationVariation)
                ? randomBetween(-settings.rotationVariation, settings.rotationVariation) : 0;
            for (var i = 0; i < group.length; i++) {
                var idx = group[i];
                applyToCharacter(frame, idx, originals[t][idx], settings, resolvedFont, resolvedColor, sizeRoll, rotationRoll);
                if (touched) touched[t][idx] = true;
                done++;
                if (reportProgress && (done % PROGRESS_STEP === 0)) onProgress(done, grandTotal);
            }
        }
        totalChars += targets.indices.length;

        // Word Spacing pass: touches ONLY tracking, on the space
        // characters themselves, and is intentionally separate from the
        // groups loop above so it never picks up Size/Rotation/Font/
        // Color/Underline/Strike even if those happen to be enabled too.
        if (hasSpaceWork) {
            for (var si = 0; si < targets.spaceIndices.length; si++) {
                var spIdx = targets.spaceIndices[si];
                var orig = originals[t][spIdx];
                var ca = frame.characters[spIdx].characterAttributes;
                ca.tracking = orig.tracking + pxToTrackingUnits(settings.wordSpacing.value, orig.size);
                if (touched) touched[t][spIdx] = true;
                done++;
                if (reportProgress && (done % PROGRESS_STEP === 0)) onProgress(done, grandTotal);
            }
            totalChars += targets.spaceIndices.length;
        }
    }
    if (onProgress) onProgress(grandTotal, grandTotal);
    return { totalChars: totalChars, framesTouched: framesTouched };
}


// -------------------------------------------------------------------
//  PRESETS (saved to a small text file in the user's Documents folder)
// -------------------------------------------------------------------

var PRESETS_FOLDER_PATH = Folder.myDocuments + "/Adobe Scripts";
var PRESETS_FILE_PATH = PRESETS_FOLDER_PATH + "/TextFormatterPresets.txt";

function loadPresetsFromDisk() {
    var presets = {};
    var f = new File(PRESETS_FILE_PATH);
    if (!f.exists) return presets;
    f.encoding = "UTF-8";
    f.open("r");
    var content = f.read();
    f.close();
    var lines = content.split("\n");
    for (var i = 0; i < lines.length; i++) {
        var line = trim(lines[i]);
        if (!line) continue;
        var parts = line.split("\t");
        var name = parts[0];
        if (!name) continue;
        var obj = {};
        for (var j = 1; j < parts.length; j++) {
            var eq = parts[j].indexOf("=");
            if (eq === -1) continue;
            obj[parts[j].substring(0, eq)] = parts[j].substring(eq + 1);
        }
        presets[name] = obj;
    }
    return presets;
}

function savePresetsToDisk(presets) {
    var folder = new Folder(PRESETS_FOLDER_PATH);
    if (!folder.exists) folder.create();
    var f = new File(PRESETS_FILE_PATH);
    f.encoding = "UTF-8";
    f.open("w");
    for (var name in presets) {
        if (!presets.hasOwnProperty(name)) continue;
        var obj = presets[name];
        var line = name;
        for (var k in obj) {
            if (!obj.hasOwnProperty(k)) continue;
            line += "\t" + k + "=" + obj[k];
        }
        f.writeln(line);
    }
    f.close();
}


// -------------------------------------------------------------------
//  MAIN — builds the UI and wires up all the logic
// -------------------------------------------------------------------

function buildAndShowUI(textFrames, fontNames, originals) {

    var totalCharCount = 0;
    for (var i = 0; i < textFrames.length; i++) totalCharCount += textFrames[i].characters.length;

    // One { idx: true } map per text frame, recording exactly which
    // characters Preview/Apply has actually written to this session.
    // Reset uses this so it only has to revert what changed, not walk
    // every character in every selected frame.
    var touched = [];
    for (var i = 0; i < textFrames.length; i++) touched.push({});

    // A fingerprint of the settings that produced whatever is currently
    // drawn on the art (set after every successful Preview/Done write,
    // cleared to null by Cancel). Lets Done recognize "the last Preview
    // already shows exactly this" and skip re-doing the work — see
    // btnDone.onClick below.
    var lastAppliedSignature = null;

    var presets = loadPresetsFromDisk();

    // ============================= WINDOW =============================
    var win = new Window("dialog", "Text Formatter");
    win.orientation = "column";
    win.alignChildren = ["fill", "top"];
    win.margins = 12;
    win.spacing = 8;

    var lblInfo = win.add("statictext", undefined,
        textFrames.length + " text frame(s) selected, " + totalCharCount + " character(s) total.");

    var lblUsage = win.add("statictext", undefined,
        "Work through the tabs in order, then click Preview \u2014 nothing changes on your art until you do.",
        { multiline: true });
    lblUsage.preferredSize.width = 360;

    // ============================= TABS =============================
    // A tabbed panel keeps the dialog to one compact column instead of
    // stacking every panel at once — the window only ever sizes itself
    // to the active tab's content, not all four panels combined.
    var tabs = win.add("tabbedpanel");
    tabs.alignChildren = ["fill", "top"];
    // Widened from the original 330 to comfortably fit the Format tab's
    // new fixed-width label column (see FORMAT_LABEL_WIDTH below) plus its
    // widest row (the font picker) without clipping.
    tabs.preferredSize.width = 380;

    // ========================= 1. TARGET TAB =========================
    var pnlTarget = tabs.add("tab", undefined, "1. Target");
    pnlTarget.orientation = "column";
    pnlTarget.alignChildren = "fill";
    pnlTarget.margins = 10;
    pnlTarget.spacing = 6;

    var grpScope = pnlTarget.add("group");
    grpScope.add("statictext", undefined, "Scope:");
    var ddScope = grpScope.add("dropdownlist", undefined,
        ["Letters (within each word)", "Whole Words", "All Characters (ignore word breaks)"]);
    ddScope.selection = 0;
    ddScope.helpTip = "Letters: positions are counted inside each word.\nWhole Words: positions are counted across the words in the frame.\nAll Characters: positions are counted across the entire frame as one sequence.";

    var grpMode = pnlTarget.add("group");
    grpMode.add("statictext", undefined, "Target Mode:");
    var ddMode = grpMode.add("dropdownlist", undefined,
        ["Single Position", "Range (From \u2013 To)", "Every Nth (Pattern)", "Custom List", "All", "Match Text"]);
    ddMode.selection = 0;
    ddMode.helpTip = "Positions are 1-based. Use negative numbers to count from the end (-1 = last).";

    // --- dynamic parameter area (stacked "tabs") ---
    var pnlModeParams = pnlTarget.add("group");
    pnlModeParams.orientation = "stack";
    pnlModeParams.alignChildren = ["fill", "top"];

    var grpSingle = pnlModeParams.add("group");
    grpSingle.orientation = "column"; grpSingle.alignChildren = "left";
    grpSingle.add("statictext", undefined, "Position (e.g. 3, or -1 for last):");
    var txtSinglePos = grpSingle.add("edittext", undefined, "1"); txtSinglePos.characters = 8;
    txtSinglePos.helpTip = "1-based position to target. Negative numbers count from the end, so -1 is always the last item in scope.";

    var grpRange = pnlModeParams.add("group");
    grpRange.orientation = "column"; grpRange.alignChildren = "left";
    var grpRangeRow = grpRange.add("group");
    grpRangeRow.add("statictext", undefined, "From:");
    var txtFrom = grpRangeRow.add("edittext", undefined, "1"); txtFrom.characters = 6;
    txtFrom.helpTip = "First position in the range (1-based, negatives count from the end).";
    grpRangeRow.add("statictext", undefined, "To:");
    var txtTo = grpRangeRow.add("edittext", undefined, "3"); txtTo.characters = 6;
    txtTo.helpTip = "Last position in the range (1-based, negatives count from the end). Order doesn't matter \u2014 the smaller/larger is figured out automatically.";

    var grpEveryNth = pnlModeParams.add("group");
    grpEveryNth.orientation = "column"; grpEveryNth.alignChildren = "left";
    var grpEveryNthRow = grpEveryNth.add("group");
    grpEveryNthRow.add("statictext", undefined, "Start:");
    var txtStart = grpEveryNthRow.add("edittext", undefined, "1"); txtStart.characters = 6;
    txtStart.helpTip = "Position to start the pattern at (1-based, negatives count from the end).";
    grpEveryNthRow.add("statictext", undefined, "Every:");
    var txtStep = grpEveryNthRow.add("edittext", undefined, "2"); txtStep.characters = 6;
    txtStep.helpTip = "How many positions to step forward each time. 2 = every other one, 3 = every third, and so on.";
    grpEveryNth.add("statictext", undefined, "(Start 1, Every 2 = old \"alternating\" pattern)");

    var grpCustomList = pnlModeParams.add("group");
    grpCustomList.orientation = "column"; grpCustomList.alignChildren = "left";
    grpCustomList.add("statictext", undefined, "Comma-separated positions:");
    var txtCustomList = grpCustomList.add("edittext", undefined, "1,3,5,8"); txtCustomList.characters = 20;
    txtCustomList.helpTip = "Any list of 1-based positions, e.g. 1,3,5,8. Negative numbers count from the end.";

    var grpAllNote = pnlModeParams.add("group");
    grpAllNote.add("statictext", undefined, "No extra settings needed \u2014 everything in scope is targeted.");

    var grpMatch = pnlModeParams.add("group");
    grpMatch.orientation = "column"; grpMatch.alignChildren = "left";
    var lblMatchHint = grpMatch.add("statictext", undefined, "Character(s) to match (e.g. aeiou):");
    var txtMatchText = grpMatch.add("edittext", undefined, ""); txtMatchText.characters = 20;
    txtMatchText.helpTip = "In Letters/All Characters scope: a set of characters, e.g. aeiou. In Whole Words scope: a comma-separated list of exact words to match, e.g. the, and.";
    var cbCaseInsensitive = grpMatch.add("checkbox", undefined, "Case-insensitive");
    cbCaseInsensitive.value = true;
    cbCaseInsensitive.helpTip = "When on, matching ignores upper/lower case (A matches a).";

    // ========================= 2. FORMAT TAB =========================
    var pnlFormat = tabs.add("tab", undefined, "2. Format");
    pnlFormat.orientation = "column";
    pnlFormat.alignChildren = "fill";
    pnlFormat.margins = 10;
    pnlFormat.spacing = 5;

    // Every checkbox label in this tab gets the same fixed width, so every
    // value field lines up into one clean column no matter how long its
    // label is ("Size (%):" vs "Horizontal Scale (%):") \u2014 much easier to
    // scan down the tab than the old ragged, each-row-a-different-width
    // layout.
    var FORMAT_LABEL_WIDTH = 150;

    // The Format tab used to be one long unbroken list of rows, which made
    // it hard to tell at a glance which controls were related. It's now
    // split into three titled panels (Character Transform / Font and
    // Color / Text Decoration) so the tab reads as three clear groups
    // instead of one undifferentiated stack.
    var pnlTransform = pnlFormat.add("panel", undefined, "Character Transform");
    pnlTransform.orientation = "column";
    pnlTransform.alignChildren = "fill";
    pnlTransform.margins = [10, 16, 10, 8];
    pnlTransform.spacing = 4;

    function addFormatRow(parent, labelText, defaultValue, tip) {
        var grp = parent.add("group");
        var cb = grp.add("checkbox", undefined, labelText);
        cb.preferredSize.width = FORMAT_LABEL_WIDTH;
        var txt = grp.add("edittext", undefined, defaultValue);
        txt.characters = 7;
        txt.enabled = false;
        if (tip) { cb.helpTip = tip; txt.helpTip = tip; }
        cb.onClick = function () { txt.enabled = cb.value; updateStats(); };
        txt.onChange = function () { updateStats(); };
        return { cb: cb, txt: txt };
    }

    var rowSize = addFormatRow(pnlTransform, "Size (%):", "150",
        "Scales font size relative to each character's ORIGINAL size. 100 = unchanged, 150 = 50% bigger, 50 = half size.");
    var cbSize = rowSize.cb, txtSize = rowSize.txt;

    var rowHScale = addFormatRow(pnlTransform, "Horizontal Scale (%):", "150",
        "Sets horizontal scale directly. 100 = normal width, above 100 stretches wider, below squeezes narrower.");
    var cbHScale = rowHScale.cb, txtHScale = rowHScale.txt;

    var rowVScale = addFormatRow(pnlTransform, "Vertical Scale (%):", "100",
        "Sets vertical scale directly. 100 = normal height, above 100 stretches taller, below squeezes shorter.");
    var cbVScale = rowVScale.cb, txtVScale = rowVScale.txt;

    var rowRotation = addFormatRow(pnlTransform, "Rotation (\u00B0):", "-15",
        "Sets character rotation in degrees. Positive rotates counter-clockwise, negative clockwise.");
    var cbRotation = rowRotation.cb, txtRotation = rowRotation.txt;

    var rowBaseline = addFormatRow(pnlTransform, "Baseline Shift (pt):", "5",
        "Moves characters up (positive) or down (negative) from the baseline, in points.");
    var cbBaseline = rowBaseline.cb, txtBaseline = rowBaseline.txt;

    var rowTracking = addFormatRow(pnlTransform, "Tracking:", "50",
        "Adjusts letter spacing in 1/1000 em units. 0 = normal, positive spreads letters apart, negative tightens them.");
    var cbTracking = rowTracking.cb, txtTracking = rowTracking.txt;

    var rowWordSpacing = addFormatRow(pnlTransform, "Word Spacing (px):", "10",
        "Adds extra space between words only \u2014 applied to the actual space character, not the letters. " +
        "Positive spreads words apart, negative pulls them closer. Treated as points (1px = 1pt).");
    var cbWordSpacing = rowWordSpacing.cb, txtWordSpacing = rowWordSpacing.txt;

    var pnlFontColor = pnlFormat.add("panel", undefined, "Font and Color");
    pnlFontColor.orientation = "column";
    pnlFontColor.alignChildren = "fill";
    pnlFontColor.margins = [10, 16, 10, 8];
    pnlFontColor.spacing = 6;

    var grpFont = pnlFontColor.add("group");
    var cbFont = grpFont.add("checkbox", undefined, "Font:");
    cbFont.preferredSize.width = FORMAT_LABEL_WIDTH;
    cbFont.helpTip = "Replaces the font of every targeted character.";
    var colFont = grpFont.add("group");
    colFont.orientation = "column"; colFont.alignChildren = "left";
    var txtFontFilter = colFont.add("edittext", undefined, "");
    txtFontFilter.characters = 22;
    txtFontFilter.enabled = false;
    txtFontFilter.helpTip = "Type to filter the font list below (shows up to 200 matches).";
    var ddFont = colFont.add("dropdownlist", undefined, fontNames.slice(0, 200));
    ddFont.selection = 0;
    ddFont.preferredSize.width = 200;
    ddFont.enabled = false;
    ddFont.helpTip = "Font to apply to targeted characters.";
    cbFont.onClick = function () { txtFontFilter.enabled = cbFont.value; ddFont.enabled = cbFont.value; updateStats(); };
    ddFont.onChange = function () { updateStats(); };

    var fontNamesLower = [];
    for (var fnI = 0; fnI < fontNames.length; fnI++) fontNamesLower.push(fontNames[fnI].toLowerCase());

    function filterFontList() {
        var filter = trim(txtFontFilter.text).toLowerCase();
        var matched = [];
        for (var i = 0; i < fontNamesLower.length && matched.length < 200; i++) {
            if (filter === "" || fontNamesLower[i].indexOf(filter) !== -1) matched.push(fontNames[i]);
        }
        if (matched.length === 0) matched = ["(no matching fonts)"];
        ddFont.removeAll();
        for (var i = 0; i < matched.length; i++) ddFont.add("item", matched[i]);
        ddFont.selection = 0;
    }
    // Rebuilding this dropdown is a native ScriptUI operation, not just JS
    // work, and gets genuinely slow with a large font library (anything
    // from a few hundred fonts up, which is common with Adobe Fonts
    // synced). Filtering on every keystroke (onChanging) was rebuilding
    // it after every single letter typed, which is exactly what causes
    // Illustrator's UI to lock up and show the white "not responding"
    // overlay while you're mid-word. onChange only fires once typing
    // pauses (tab away / Enter), so the rebuild happens once per search
    // instead of once per letter.
    txtFontFilter.onChange = filterFontList;

    // ---- Fill Color: Hex, RGB, or CMYK, plus a native color picker ----
    var grpColorHeader = pnlFontColor.add("group");
    var cbColor = grpColorHeader.add("checkbox", undefined, "Fill Color:");
    cbColor.preferredSize.width = FORMAT_LABEL_WIDTH;
    cbColor.helpTip = "Sets the fill color of every targeted character.";

    var ddColorMode = grpColorHeader.add("dropdownlist", undefined, ["Hex", "RGB", "CMYK"]);
    ddColorMode.selection = 0;
    ddColorMode.enabled = false;
    ddColorMode.helpTip = "Choose how to dial in the color: a hex code, RGB (0-255 per channel), or CMYK (0-100% per channel).";

    var swColor = grpColorHeader.add("panel", undefined, "");
    swColor.preferredSize = [26, 18];
    swColor.helpTip = "Live preview swatch of the color you've entered.";

    var btnPickColor = grpColorHeader.add("button", undefined, "Pick\u2026");
    btnPickColor.helpTip = "Open your system's native color picker.";
    btnPickColor.enabled = false;

    var pnlColorParams = pnlFontColor.add("group");
    pnlColorParams.orientation = "stack";
    pnlColorParams.alignChildren = ["fill", "top"];

    var grpColorHex = pnlColorParams.add("group");
    grpColorHex.orientation = "row"; grpColorHex.alignChildren = "left";
    grpColorHex.add("statictext", undefined, "Hex:");
    var txtHex = grpColorHex.add("edittext", undefined, "FF0000");
    txtHex.characters = 8;
    txtHex.helpTip = "6-digit hex color code, e.g. FF6600. The # is optional.";

    var grpColorRGB = pnlColorParams.add("group");
    grpColorRGB.orientation = "row"; grpColorRGB.alignChildren = "left";
    grpColorRGB.add("statictext", undefined, "R:");
    var txtColorR = grpColorRGB.add("edittext", undefined, "255"); txtColorR.characters = 4;
    txtColorR.helpTip = "Red, 0-255.";
    grpColorRGB.add("statictext", undefined, "G:");
    var txtColorG = grpColorRGB.add("edittext", undefined, "0"); txtColorG.characters = 4;
    txtColorG.helpTip = "Green, 0-255.";
    grpColorRGB.add("statictext", undefined, "B:");
    var txtColorB = grpColorRGB.add("edittext", undefined, "0"); txtColorB.characters = 4;
    txtColorB.helpTip = "Blue, 0-255.";

    var grpColorCMYK = pnlColorParams.add("group");
    grpColorCMYK.orientation = "row"; grpColorCMYK.alignChildren = "left";
    grpColorCMYK.add("statictext", undefined, "C:");
    var txtColorC = grpColorCMYK.add("edittext", undefined, "0"); txtColorC.characters = 4;
    txtColorC.helpTip = "Cyan, 0-100%.";
    grpColorCMYK.add("statictext", undefined, "M:");
    var txtColorM = grpColorCMYK.add("edittext", undefined, "100"); txtColorM.characters = 4;
    txtColorM.helpTip = "Magenta, 0-100%.";
    grpColorCMYK.add("statictext", undefined, "Y:");
    var txtColorY = grpColorCMYK.add("edittext", undefined, "100"); txtColorY.characters = 4;
    txtColorY.helpTip = "Yellow, 0-100%.";
    grpColorCMYK.add("statictext", undefined, "K:");
    var txtColorK = grpColorCMYK.add("edittext", undefined, "0"); txtColorK.characters = 4;
    txtColorK.helpTip = "Black (key), 0-100%.";

    // Reads whatever color mode is currently selected and returns {r,g,b} (0-255), or null if invalid.
    function getCurrentColorRGB() {
        var mode = ddColorMode.selection ? ddColorMode.selection.index : 0;
        if (mode === 0) {
            return hexToRGB(txtHex.text);
        } else if (mode === 1) {
            var r = clampNum(parseFloat(txtColorR.text), 0, 255);
            var g = clampNum(parseFloat(txtColorG.text), 0, 255);
            var b = clampNum(parseFloat(txtColorB.text), 0, 255);
            if (r === null || g === null || b === null) return null;
            return { r: r, g: g, b: b };
        } else {
            var c = clampNum(parseFloat(txtColorC.text), 0, 100);
            var m = clampNum(parseFloat(txtColorM.text), 0, 100);
            var y = clampNum(parseFloat(txtColorY.text), 0, 100);
            var k = clampNum(parseFloat(txtColorK.text), 0, 100);
            if (c === null || m === null || y === null || k === null) return null;
            return cmykToRGB(c, m, y, k);
        }
    }

    // Pushes an {r,g,b} value into all three fields so switching modes never loses your color.
    function syncColorFieldsFromRGB(rgb) {
        if (!rgb) return;
        txtHex.text = rgbToHex(rgb.r, rgb.g, rgb.b);
        txtColorR.text = String(Math.round(rgb.r));
        txtColorG.text = String(Math.round(rgb.g));
        txtColorB.text = String(Math.round(rgb.b));
        var cmyk = rgbToCMYK(rgb.r, rgb.g, rgb.b);
        txtColorC.text = String(cmyk.c);
        txtColorM.text = String(cmyk.m);
        txtColorY.text = String(cmyk.y);
        txtColorK.text = String(cmyk.k);
    }

    function updateColorSwatch() {
        try {
            var rgb = getCurrentColorRGB();
            if (!rgb) return;
            swColor.graphics.backgroundColor = swColor.graphics.newBrush(
                swColor.graphics.BrushType.SOLID_COLOR, [rgb.r / 255, rgb.g / 255, rgb.b / 255, 1]
            );
        } catch (eSwatch) {
            // ScriptUI can't always restyle graphics before the window has
            // been shown once — harmless, it'll catch up on the next change.
        }
    }

    function refreshColorModeUI() {
        var idx = ddColorMode.selection.index;
        grpColorHex.visible = (idx === 0);
        grpColorRGB.visible = (idx === 1);
        grpColorCMYK.visible = (idx === 2);
        win.layout.layout(true);
    }

    function setColorControlsEnabled(on) {
        ddColorMode.enabled = on; btnPickColor.enabled = on;
        txtHex.enabled = on;
        txtColorR.enabled = on; txtColorG.enabled = on; txtColorB.enabled = on;
        txtColorC.enabled = on; txtColorM.enabled = on; txtColorY.enabled = on; txtColorK.enabled = on;
    }
    setColorControlsEnabled(false);

    cbColor.onClick = function () { setColorControlsEnabled(cbColor.value); updateStats(); };

    ddColorMode.onChange = function () {
        var rgb = getCurrentColorRGB();
        refreshColorModeUI();
        if (rgb) syncColorFieldsFromRGB(rgb);
        updateColorSwatch();
    };

    txtHex.onChanging = updateColorSwatch;
    txtColorR.onChanging = updateColorSwatch;
    txtColorG.onChanging = updateColorSwatch;
    txtColorB.onChanging = updateColorSwatch;
    txtColorC.onChanging = updateColorSwatch;
    txtColorM.onChanging = updateColorSwatch;
    txtColorY.onChanging = updateColorSwatch;
    txtColorK.onChanging = updateColorSwatch;
    txtHex.onChange = function () { updateStats(); };
    txtColorR.onChange = function () { updateStats(); };
    txtColorG.onChange = function () { updateStats(); };
    txtColorB.onChange = function () { updateStats(); };
    txtColorC.onChange = function () { updateStats(); };
    txtColorM.onChange = function () { updateStats(); };
    txtColorY.onChange = function () { updateStats(); };
    txtColorK.onChange = function () { updateStats(); };

    btnPickColor.onClick = function () {
        if (typeof $.colorPicker !== "function") {
            alert("Your version of Illustrator doesn't expose a native color picker to scripts. Please enter values manually.");
            return;
        }
        var startRGB = getCurrentColorRGB() || { r: 255, g: 0, b: 0 };
        var startInt = (startRGB.r << 16) | (startRGB.g << 8) | startRGB.b;
        var picked = $.colorPicker(startInt);
        if (picked === -1 || picked === undefined || picked === null) return; // user cancelled
        var r = (picked >> 16) & 255, g = (picked >> 8) & 255, b = picked & 255;
        syncColorFieldsFromRGB({ r: r, g: g, b: b });
        updateColorSwatch();
        updateStats();
    };

    var pnlDecoration = pnlFormat.add("panel", undefined, "Text Decoration");
    pnlDecoration.orientation = "column";
    pnlDecoration.alignChildren = "fill";
    pnlDecoration.margins = [10, 16, 10, 8];
    pnlDecoration.spacing = 4;

    // Underline/Strikethrough are pure on/off toggles: check the box to
    // turn that decoration on for every targeted character, leave it
    // unchecked to leave targeted characters' underline/strikethrough
    // alone. No separate "On/Off" control — the checkbox already means
    // "apply this," so a second dropdown just for On/Off was redundant.
    function addToggleFormatRow(parent, labelText, tip) {
        var grp = parent.add("group");
        var cb = grp.add("checkbox", undefined, labelText);
        cb.preferredSize.width = FORMAT_LABEL_WIDTH;
        if (tip) cb.helpTip = tip;
        cb.onClick = function () { updateStats(); };
        return { cb: cb };
    }

    var rowUnderline = addToggleFormatRow(pnlDecoration, "Underline:", "Turns on underline for targeted characters.");
    var cbUnderline = rowUnderline.cb;

    var rowStrike = addToggleFormatRow(pnlDecoration, "Strikethrough:", "Turns on strikethrough for targeted characters.");
    var cbStrike = rowStrike.cb;

    // ========================= 3. RANDOM TAB =========================
    var pnlRandom = tabs.add("tab", undefined, "3. Random");
    pnlRandom.orientation = "column";
    pnlRandom.alignChildren = "fill";
    pnlRandom.margins = 10;
    pnlRandom.spacing = 6;

    var cbRandomize = pnlRandom.add("checkbox", undefined, "Add variation for a hand-lettered look");
    cbRandomize.helpTip = "Randomly jitters size and/or rotation per character. Works on its own \u2014 you do NOT need to also check Size or Rotation above. If you do check them, the jitter is added on top of that value instead of on top of the original.";
    var grpSizeVar = pnlRandom.add("group");
    grpSizeVar.add("statictext", undefined, "Size \u00B1%:");
    var txtSizeVariation = grpSizeVar.add("edittext", undefined, "10");
    txtSizeVariation.characters = 6;
    txtSizeVariation.enabled = false;
    txtSizeVariation.helpTip = "Each character's size will randomly vary by up to this many percentage points, up or down.";
    var grpRotVar = pnlRandom.add("group");
    grpRotVar.add("statictext", undefined, "Rotation \u00B1\u00B0:");
    var txtRotationVariation = grpRotVar.add("edittext", undefined, "10");
    txtRotationVariation.characters = 6;
    txtRotationVariation.enabled = false;
    txtRotationVariation.helpTip = "Each character's rotation will randomly vary by up to this many degrees, up or down.";
    cbRandomize.onClick = function () {
        txtSizeVariation.enabled = cbRandomize.value;
        txtRotationVariation.enabled = cbRandomize.value;
        updateStats();
    };
    txtSizeVariation.onChange = function () { updateStats(); };
    txtRotationVariation.onChange = function () { updateStats(); };
    pnlRandom.add("statictext", undefined, "Works standalone, or layers on top of Size / Rotation above if those are also checked.", { multiline: true }).preferredSize.width = 340;

    // ========================= 4. PRESETS TAB =========================
    var pnlPresets = tabs.add("tab", undefined, "4. Presets");
    pnlPresets.orientation = "column";
    pnlPresets.alignChildren = "fill";
    pnlPresets.margins = 10;
    pnlPresets.spacing = 8;

    var ddPresets = pnlPresets.add("dropdownlist", undefined, []);
    ddPresets.helpTip = "Presets you've saved, stored in a text file in your Documents/Adobe Scripts folder.";
    var grpPresetBtns = pnlPresets.add("group");
    var btnLoadPreset = grpPresetBtns.add("button", undefined, "Load");
    btnLoadPreset.helpTip = "Loads the selected preset's target and formatting settings into the panels above.";
    var btnSavePreset = grpPresetBtns.add("button", undefined, "Save As\u2026");
    btnSavePreset.helpTip = "Saves the current target and formatting settings under a new name for reuse later.";
    var btnDeletePreset = grpPresetBtns.add("button", undefined, "Delete");
    btnDeletePreset.helpTip = "Permanently removes the selected preset.";

    // ===================== STATUS (always visible) =====================
    var lblStats = win.add("statictext", undefined, "Will affect: \u2014", { multiline: true });
    lblStats.preferredSize.width = 360;
    lblStats.helpTip = "Shows how many characters your current target settings match. Click Preview to see the real result on your text.";

    // Color-codes the status line so its state reads at a glance, without
    // having to read the whole sentence every time:
    //   ready/success (green)  \u2014 settings are valid, or a preview/apply/
    //                             reset just completed normally
    //   warn (amber)           \u2014 valid, but nothing actually matches, or
    //                             there's nothing to reset yet
    //   error (red)            \u2014 the current target/format settings are
    //                             invalid and need fixing
    //   info (blue)            \u2014 a preview or apply is currently showing
    function setStatsMood(kind) {
        try {
            var rgb;
            if (kind === "error") rgb = [0.75, 0.16, 0.16];
            else if (kind === "warn") rgb = [0.62, 0.42, 0.02];
            else if (kind === "info") rgb = [0.13, 0.4, 0.72];
            else rgb = [0.2, 0.45, 0.2]; // "ready"
            lblStats.graphics.foregroundColor = lblStats.graphics.newPen(lblStats.graphics.PenType.SOLID_COLOR, rgb, 1);
        } catch (eColor) {
            // Some Illustrator/ScriptUI versions don't allow styling before
            // the window is shown \u2014 harmless to skip, the label still
            // works fine, it just won't be colored on the very first paint.
        }
    }
    setStatsMood("ready");

    // ============================= BUTTONS =============================
    var grpBtns = win.add("group");
    grpBtns.alignment = "center";
    grpBtns.spacing = 10;
    // Preview is the button you'll click most while you're dialing in a
    // look, so it's the dialog's default action \u2014 Enter triggers it from
    // anywhere in the dialog, and most platforms draw it with a subtle
    // emphasis so it reads as "the next thing to click."
    var btnPreview = grpBtns.add("button", undefined, "Preview");
    btnPreview.helpTip = "Applies the current settings to your selected text so you can see the real result (Enter). Click Cancel to discard it, or Done to keep it.";
    var btnCancel = grpBtns.add("button", undefined, "Cancel");
    btnCancel.helpTip = "Discards every change made this session (including anything from Preview) and closes the dialog, restoring your text exactly as it looked when this dialog opened (Esc).";
    var btnDone = grpBtns.add("button", undefined, "Done");
    btnDone.helpTip = "Applies the current settings to your text and closes the dialog \u2014 same effect as Preview, it just confirms you want to keep it and closes.";
    // NOTE: deliberately NOT using the ScriptUI {name:"ok"/"cancel"} button
    // convention here \u2014 on some hosts that makes the dialog auto-close the
    // moment the button is clicked, which is exactly what we don't want for
    // Preview. win.defaultElement/cancelElement give the same Enter/Esc
    // convenience without any auto-close side effect; each button's own
    // onClick (defined below) still fully controls what actually happens.
    try {
        btnPreview.active = true;
        win.defaultElement = btnPreview;
        // Esc maps to Cancel (discard + close), not Done (keep + close) \u2014
        // that matches what people expect Esc to do in every other dialog.
        win.cancelElement = btnCancel;
    } catch (eDefaultBtn) {
        // Older ScriptUI hosts may not support one or both of these \u2014
        // harmless to skip, the buttons still work fine when clicked.
    }

    // ======================================================================
    //  LOGIC
    // ======================================================================

    function readSettingsFromUI() {
        var errors = [];
        var s = {};

        s.scope = ["lettersPerWord", "words", "allChars"][ddScope.selection.index];
        var modeKeys = ["single", "range", "everyNth", "customList", "all", "match"];
        s.mode = modeKeys[ddMode.selection.index];
        s.params = {};

        if (s.mode === "single") {
            var v = parseInt(trim(txtSinglePos.text), 10);
            if (isNaN(v)) errors.push("Single Position must be a whole number.");
            s.params.pos = v;
        } else if (s.mode === "range") {
            var a = parseInt(trim(txtFrom.text), 10);
            var b = parseInt(trim(txtTo.text), 10);
            if (isNaN(a) || isNaN(b)) errors.push("Range From/To must be whole numbers.");
            s.params.from = a; s.params.to = b;
        } else if (s.mode === "everyNth") {
            var start = parseInt(trim(txtStart.text), 10);
            var step = parseInt(trim(txtStep.text), 10);
            if (isNaN(start)) errors.push("Every Nth \"Start\" must be a whole number.");
            if (isNaN(step) || step < 1) errors.push("Every Nth \"Every\" must be 1 or greater.");
            s.params.start = start; s.params.step = step;
        } else if (s.mode === "customList") {
            var raw = trim(txtCustomList.text).split(",");
            var list = [];
            for (var i = 0; i < raw.length; i++) {
                var n = parseInt(trim(raw[i]), 10);
                if (!isNaN(n)) list.push(n);
            }
            if (list.length === 0) errors.push("Custom List must contain at least one number.");
            s.params.list = list;
        } else if (s.mode === "match") {
            s.matchText = txtMatchText.text;
            s.caseInsensitive = cbCaseInsensitive.value;
            if (!trim(s.matchText)) errors.push("Match Text field is empty.");
        }

        s.size = { enabled: cbSize.value, value: parseFloat(txtSize.text) };
        if (s.size.enabled && isNaN(s.size.value)) errors.push("Size % must be a number.");

        s.hScale = { enabled: cbHScale.value, value: parseFloat(txtHScale.text) };
        if (s.hScale.enabled && isNaN(s.hScale.value)) errors.push("Horizontal Scale % must be a number.");

        s.vScale = { enabled: cbVScale.value, value: parseFloat(txtVScale.text) };
        if (s.vScale.enabled && isNaN(s.vScale.value)) errors.push("Vertical Scale % must be a number.");

        s.rotation = { enabled: cbRotation.value, value: parseFloat(txtRotation.text) };
        if (s.rotation.enabled && isNaN(s.rotation.value)) errors.push("Rotation must be a number.");

        s.baseline = { enabled: cbBaseline.value, value: parseFloat(txtBaseline.text) };
        if (s.baseline.enabled && isNaN(s.baseline.value)) errors.push("Baseline Shift must be a number.");

        s.tracking = { enabled: cbTracking.value, value: parseFloat(txtTracking.text) };
        if (s.tracking.enabled && isNaN(s.tracking.value)) errors.push("Tracking must be a number.");

        s.wordSpacing = { enabled: cbWordSpacing.value, value: parseFloat(txtWordSpacing.text) };
        if (s.wordSpacing.enabled && isNaN(s.wordSpacing.value)) errors.push("Word Spacing (px) must be a number.");

        s.font = { enabled: cbFont.value, name: (ddFont.selection ? ddFont.selection.text : "") };
        if (s.font.enabled && (!s.font.name || s.font.name === "(no matching fonts)")) errors.push("Please choose a valid font.");

        s.color = { enabled: cbColor.value, rgb: null };
        if (s.color.enabled) {
            var rgb = getCurrentColorRGB();
            if (!rgb) {
                var modeNames = ["Hex", "RGB", "CMYK"];
                errors.push("Fill Color (" + modeNames[ddColorMode.selection.index] + ") has an invalid value.");
            }
            s.color.rgb = rgb;
        }

        s.underline = { enabled: cbUnderline.value, value: true };
        s.strike = { enabled: cbStrike.value, value: true };

        s.randomize = cbRandomize.value;
        s.sizeVariation = parseFloat(txtSizeVariation.text);
        s.rotationVariation = parseFloat(txtRotationVariation.text);
        if (isNaN(s.sizeVariation)) s.sizeVariation = 0;
        if (isNaN(s.rotationVariation)) s.rotationVariation = 0;

        return { settings: s, errors: errors };
    }

    // Shared by Preview and Apply: is there actually anything to do?
    // Randomize counts on its own now, since it no longer requires Size or
    // Rotation to also be checked.
    function settingsHaveAnyFormat(s) {
        return s.size.enabled || s.hScale.enabled || s.vScale.enabled ||
            s.rotation.enabled || s.baseline.enabled || s.tracking.enabled ||
            s.wordSpacing.enabled ||
            s.font.enabled || s.color.enabled ||
            s.underline.enabled || s.strike.enabled ||
            (s.randomize && (s.sizeVariation || s.rotationVariation));
    }

    // Deterministic string fingerprint of a settings object: two calls
    // with the same UI values (scope, mode, all format fields, and
    // random-variation amounts) always produce the same string. Used to
    // detect "these are literally the settings already on the art" so
    // Preview/Done can skip redoing work that's already done.
    function fmtOpt(o) { return o.enabled ? String(o.value) : "-"; }
    function serializeSettings(s) {
        var parts = ["scope=" + s.scope, "mode=" + s.mode];
        if (s.mode === "single") parts.push("pos=" + s.params.pos);
        else if (s.mode === "range") parts.push("from=" + s.params.from, "to=" + s.params.to);
        else if (s.mode === "everyNth") parts.push("start=" + s.params.start, "step=" + s.params.step);
        else if (s.mode === "customList") parts.push("list=" + s.params.list.join(","));
        else if (s.mode === "match") parts.push("matchText=" + s.matchText, "ci=" + (s.caseInsensitive ? 1 : 0));
        parts.push("size=" + fmtOpt(s.size));
        parts.push("hScale=" + fmtOpt(s.hScale));
        parts.push("vScale=" + fmtOpt(s.vScale));
        parts.push("rotation=" + fmtOpt(s.rotation));
        parts.push("baseline=" + fmtOpt(s.baseline));
        parts.push("tracking=" + fmtOpt(s.tracking));
        parts.push("wordSpacing=" + fmtOpt(s.wordSpacing));
        parts.push("font=" + (s.font.enabled ? s.font.name : "-"));
        parts.push("color=" + (s.color.enabled && s.color.rgb ? (s.color.rgb.r + "," + s.color.rgb.g + "," + s.color.rgb.b) : "-"));
        parts.push("underline=" + (s.underline.enabled ? "1" : "-"));
        parts.push("strike=" + (s.strike.enabled ? "1" : "-"));
        parts.push("rand=" + (s.randomize ? ("1:" + s.sizeVariation + ":" + s.rotationVariation) : "0"));
        return parts.join("|");
    }

    function updateStats() {
        try {
            var r = readSettingsFromUI();
            var totalChars = 0, totalFrames = 0;
            for (var t = 0; t < textFrames.length; t++) {
                var targets = computeTargets(textFrames[t], r.settings);
                var thisCount = targets.indices.length + (r.settings.wordSpacing.enabled ? targets.spaceIndices.length : 0);
                if (thisCount > 0) { totalFrames++; totalChars += thisCount; }
            }
            lblStats.text = "Will affect " + totalChars + " character(s)\nacross " + totalFrames + " text frame(s).";
            setStatsMood(totalChars === 0 ? "warn" : "ready");
        } catch (e) {
            lblStats.text = "Will affect: (enter valid target settings)";
            setStatsMood("error");
        }
    }

    // Shared progress callback for resetToOriginal/applyFormattingToAll:
    // updates the status line and forces the dialog to repaint. Passing
    // this instead of null on large jobs is what keeps the dialog
    // visibly "alive" while a big batch of characters is being written,
    // instead of sitting silently long enough that the OS decides
    // Illustrator has stopped responding and whites out the window.
    function makeProgressCallback(verb) {
        return function (done, total) {
            lblStats.text = verb + "\u2026 " + done + " / " + total + " character(s).";
            try { win.update(); } catch (eUpd) {}
        };
    }

    // Reconciles the art to exactly match `settings`, starting from
    // whatever the last Preview/Done left behind. Instead of blindly
    // reverting everything and rewriting everything (which double-writes
    // every character that stays targeted between clicks \u2014 the common
    // case), it only reverts the characters that are no longer targeted,
    // then writes the current target set fresh from the untouched
    // "originals" snapshot. That write already overwrites any stale
    // value on a still-targeted character, so nothing is ever left over
    // from a previous click, and nothing gets touched twice for no
    // reason. Returns applyFormattingToAll's result.
    function reconcileToSettings(settings, progressVerb) {
        var frameTargets = [];
        for (var t = 0; t < textFrames.length; t++) frameTargets.push(computeTargets(textFrames[t], settings));
        var newTargetMaps = buildTargetMaps(frameTargets);
        revertUntargeted(textFrames, originals, touched, newTargetMaps, makeProgressCallback("Clearing stale preview"));
        return applyFormattingToAll(textFrames, originals, settings, touched, makeProgressCallback(progressVerb));
    }

    // Applies the current settings straight to the real text so the person
    // can see the actual result. Only runs when the Preview button (or
    // Done) is clicked \u2014 not on every keystroke \u2014 so typing stays fast
    // and nothing touches the artwork until you ask it to.
    function doPreview() {
        var r = readSettingsFromUI();
        if (r.errors.length > 0) {
            lblStats.text = "Fix these to preview:\n\u2022 " + r.errors.join("\n\u2022 ");
            setStatsMood("error");
            app.redraw();
            return;
        }
        if (!settingsHaveAnyFormat(r.settings)) {
            lblStats.text = "Enable at least one formatting option in the Format tab, then click Preview.";
            setStatsMood("warn");
            app.redraw();
            return;
        }

        // Nothing to do if the art already shows exactly this \u2014 unless
        // Random is on, in which case a repeat click is a deliberate
        // request to re-roll, so it always redraws.
        var sig = serializeSettings(r.settings);
        if (!r.settings.randomize && sig === lastAppliedSignature && countTouched(touched) > 0) {
            lblStats.text = "Already previewing these settings.\nDone to keep it, or Cancel to discard.";
            setStatsMood("info");
            return;
        }

        var prevLevel = app.userInteractionLevel;
        try {
            app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
            var result = reconcileToSettings(r.settings, "Previewing");
            app.redraw();
            lastAppliedSignature = sig;
            if (result.totalChars === 0) {
                lblStats.text = "Previewed \u2014 no characters matched your target settings.";
                setStatsMood("warn");
            } else {
                lblStats.text = "Previewing " + result.totalChars + " character(s)\nacross " + result.framesTouched +
                    " text frame(s).\nDone to keep it, or Cancel to discard.";
                setStatsMood("info");
            }
        } catch (e) {
            lblStats.text = "Preview error: " + e.toString();
            setStatsMood("error");
        } finally {
            app.userInteractionLevel = prevLevel;
        }
    }

    function refreshModeUI() {
        var idx = ddMode.selection.index;
        grpSingle.visible = (idx === 0);
        grpRange.visible = (idx === 1);
        grpEveryNth.visible = (idx === 2);
        grpCustomList.visible = (idx === 3);
        grpAllNote.visible = (idx === 4);
        grpMatch.visible = (idx === 5);

        if (idx === 5) {
            lblMatchHint.text = (ddScope.selection.index === 1)
                ? "Word(s) to match (comma separated):"
                : "Character(s) to match (e.g. aeiou):";
        }

        win.layout.layout(true);
        updateStats();
    }

    ddScope.onChange = refreshModeUI;
    ddMode.onChange = refreshModeUI;
    // Every target field just keeps the cheap character count current as
    // you type. Nothing touches the real artwork until you click Preview
    // or Done, so typing stays fast and nothing changes behind your back.
    txtSinglePos.onChanging = updateStats; txtSinglePos.onChange = updateStats;
    txtFrom.onChanging = updateStats; txtFrom.onChange = updateStats;
    txtTo.onChanging = updateStats; txtTo.onChange = updateStats;
    txtStart.onChanging = updateStats; txtStart.onChange = updateStats;
    txtStep.onChanging = updateStats; txtStep.onChange = updateStats;
    txtCustomList.onChanging = updateStats; txtCustomList.onChange = updateStats;
    txtMatchText.onChanging = updateStats; txtMatchText.onChange = updateStats;
    cbCaseInsensitive.onClick = function () { updateStats(); };

    // --- Preview / Cancel / Done ---
    btnPreview.onClick = function () { doPreview(); };

    // Cancel discards everything this session did (including Preview)
    // and closes the dialog \u2014 unlike Done, which now applies your
    // current settings and closes. Confirms first if there's actually
    // something to lose; if nothing was ever changed it just closes
    // immediately.
    btnCancel.onClick = function () {
        if (countTouched(touched) === 0) {
            win.close();
            return;
        }
        if (!confirm("Discard all changes made this session and close the dialog?")) return;

        var prevLevel = app.userInteractionLevel;
        btnPreview.enabled = false;
        btnCancel.enabled = false;
        btnDone.enabled = false;
        try {
            app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
            resetToOriginal(textFrames, originals, touched, makeProgressCallback("Discarding changes"));
            app.redraw();
            for (var t = 0; t < touched.length; t++) touched[t] = {};
            lastAppliedSignature = null;
        } catch (e) {
            app.userInteractionLevel = prevLevel;
            btnPreview.enabled = true;
            btnCancel.enabled = true;
            btnDone.enabled = true;
            alert("Something went wrong while discarding changes:\n" + e.toString() +
                "\n\nThe dialog will stay open so you can try Cancel again.");
            return;
        }
        app.userInteractionLevel = prevLevel;
        win.close();
    };

    // Done applies whatever settings are currently on screen and THEN
    // closes the dialog. If nothing is enabled in the Format tab (and
    // Random isn't adding variation either), there's nothing to commit,
    // so it just closes.
    //
    // If you already clicked Preview with these exact settings, the art
    // already shows exactly what Done would produce \u2014 so Done detects
    // that (via the settings fingerprint, see serializeSettings) and
    // skips straight to closing, full stop, no reconcile. This includes
    // Random: Done's job is "keep what I'm looking at," not "roll one
    // more time before you go," so it commits whichever random values
    // the last Preview already rolled instead of quietly re-rolling.
    // (If you want a different roll, click Preview again first, then
    // Done \u2014 it'll pick up that new roll as the thing to keep.)
    btnDone.onClick = function () {
        var r = readSettingsFromUI();
        var hasFormat = settingsHaveAnyFormat(r.settings);

        if (hasFormat && r.errors.length > 0) {
            alert("Please fix the following before applying:\n\n\u2022 " + r.errors.join("\n\u2022 "));
            return;
        }

        if (hasFormat) {
            var sig = serializeSettings(r.settings);
            var alreadyShowing = sig === lastAppliedSignature && countTouched(touched) > 0;

            if (!alreadyShowing) {
                var prevLevel = app.userInteractionLevel;
                try {
                    app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
                    reconcileToSettings(r.settings, "Applying");
                    app.redraw();
                    lastAppliedSignature = sig;
                } catch (e) {
                    app.userInteractionLevel = prevLevel;
                    alert("Something went wrong while applying formatting:\n" + e.toString() +
                        "\n\nThe dialog will stay open so you can try again.");
                    return;
                }
                app.userInteractionLevel = prevLevel;
            }
        }

        win.close();
    };

    // --- Presets ---
    function captureUIState() {
        return {
            scopeIdx: String(ddScope.selection.index),
            modeIdx: String(ddMode.selection.index),
            singlePos: txtSinglePos.text,
            from: txtFrom.text,
            to: txtTo.text,
            start: txtStart.text,
            step: txtStep.text,
            customList: txtCustomList.text,
            matchText: txtMatchText.text,
            caseInsensitive: cbCaseInsensitive.value ? "1" : "0",
            sizeEnabled: cbSize.value ? "1" : "0", sizeValue: txtSize.text,
            hScaleEnabled: cbHScale.value ? "1" : "0", hScaleValue: txtHScale.text,
            vScaleEnabled: cbVScale.value ? "1" : "0", vScaleValue: txtVScale.text,
            rotationEnabled: cbRotation.value ? "1" : "0", rotationValue: txtRotation.text,
            baselineEnabled: cbBaseline.value ? "1" : "0", baselineValue: txtBaseline.text,
            trackingEnabled: cbTracking.value ? "1" : "0", trackingValue: txtTracking.text,
            wordSpacingEnabled: cbWordSpacing.value ? "1" : "0", wordSpacingValue: txtWordSpacing.text,
            fontEnabled: cbFont.value ? "1" : "0", fontName: (ddFont.selection ? ddFont.selection.text : ""),
            colorEnabled: cbColor.value ? "1" : "0",
            colorModeIdx: String(ddColorMode.selection.index),
            colorHex: txtHex.text,
            colorR: txtColorR.text, colorG: txtColorG.text, colorB: txtColorB.text,
            colorC: txtColorC.text, colorM: txtColorM.text, colorY: txtColorY.text, colorK: txtColorK.text,
            underlineEnabled: cbUnderline.value ? "1" : "0",
            strikeEnabled: cbStrike.value ? "1" : "0",
            randomize: cbRandomize.value ? "1" : "0",
            sizeVariation: txtSizeVariation.text,
            rotationVariation: txtRotationVariation.text
        };
    }

    function applyUIState(obj) {
        if (!obj) return;
        ddScope.selection = parseInt(obj.scopeIdx, 10) || 0;
        ddMode.selection = parseInt(obj.modeIdx, 10) || 0;
        txtSinglePos.text = obj.singlePos || "1";
        txtFrom.text = obj.from || "1";
        txtTo.text = obj.to || "3";
        txtStart.text = obj.start || "1";
        txtStep.text = obj.step || "2";
        txtCustomList.text = obj.customList || "1,3,5";
        txtMatchText.text = obj.matchText || "";
        cbCaseInsensitive.value = (obj.caseInsensitive === "1");

        cbSize.value = (obj.sizeEnabled === "1"); txtSize.text = obj.sizeValue || "150"; txtSize.enabled = cbSize.value;
        cbHScale.value = (obj.hScaleEnabled === "1"); txtHScale.text = obj.hScaleValue || "150"; txtHScale.enabled = cbHScale.value;
        cbVScale.value = (obj.vScaleEnabled === "1"); txtVScale.text = obj.vScaleValue || "100"; txtVScale.enabled = cbVScale.value;
        cbRotation.value = (obj.rotationEnabled === "1"); txtRotation.text = obj.rotationValue || "-15"; txtRotation.enabled = cbRotation.value;
        cbBaseline.value = (obj.baselineEnabled === "1"); txtBaseline.text = obj.baselineValue || "5"; txtBaseline.enabled = cbBaseline.value;
        cbTracking.value = (obj.trackingEnabled === "1"); txtTracking.text = obj.trackingValue || "50"; txtTracking.enabled = cbTracking.value;
        cbWordSpacing.value = (obj.wordSpacingEnabled === "1"); txtWordSpacing.text = obj.wordSpacingValue || "10"; txtWordSpacing.enabled = cbWordSpacing.value;

        cbFont.value = (obj.fontEnabled === "1");
        txtFontFilter.enabled = cbFont.value;
        ddFont.enabled = cbFont.value;
        if (obj.fontName) {
            txtFontFilter.text = "";
            filterFontList();
            for (var i = 0; i < ddFont.items.length; i++) {
                if (ddFont.items[i].text === obj.fontName) { ddFont.selection = i; break; }
            }
        }

        cbColor.value = (obj.colorEnabled === "1");
        txtHex.text = obj.colorHex || "FF0000";
        if (obj.colorR !== undefined) {
            // Preset saved by this version: restore all three representations directly.
            txtColorR.text = obj.colorR || "255"; txtColorG.text = obj.colorG || "0"; txtColorB.text = obj.colorB || "0";
            txtColorC.text = obj.colorC || "0"; txtColorM.text = obj.colorM || "100"; txtColorY.text = obj.colorY || "100"; txtColorK.text = obj.colorK || "0";
        } else {
            // Older preset (hex only): derive RGB/CMYK from the saved hex so nothing is lost.
            var legacyRGB = hexToRGB(txtHex.text) || { r: 255, g: 0, b: 0 };
            syncColorFieldsFromRGB(legacyRGB);
        }
        ddColorMode.selection = parseInt(obj.colorModeIdx, 10) || 0;
        setColorControlsEnabled(cbColor.value);
        refreshColorModeUI();
        updateColorSwatch();

        cbUnderline.value = (obj.underlineEnabled === "1");
        cbStrike.value = (obj.strikeEnabled === "1");

        cbRandomize.value = (obj.randomize === "1");
        txtSizeVariation.text = obj.sizeVariation || "10"; txtSizeVariation.enabled = cbRandomize.value;
        txtRotationVariation.text = obj.rotationVariation || "10"; txtRotationVariation.enabled = cbRandomize.value;
    }

    function refreshPresetDropdown() {
        ddPresets.removeAll();
        ddPresets.add("item", "-- Select a Preset --");
        for (var name in presets) {
            if (presets.hasOwnProperty(name)) ddPresets.add("item", name);
        }
        ddPresets.selection = 0;
    }
    refreshPresetDropdown();

    btnSavePreset.onClick = function () {
        var name = prompt("Save current settings as:", "My Preset");
        if (!name) return;
        name = trim(name);
        if (!name) return;
        presets[name] = captureUIState();
        try {
            savePresetsToDisk(presets);
            refreshPresetDropdown();
            alert("Preset \"" + name + "\" saved.");
        } catch (e) {
            alert("Could not save preset:\n" + e.toString());
        }
    };

    btnLoadPreset.onClick = function () {
        if (ddPresets.selection.index === 0) { alert("Choose a preset to load first."); return; }
        var name = ddPresets.selection.text;
        applyUIState(presets[name]);
        refreshModeUI();
    };

    btnDeletePreset.onClick = function () {
        if (ddPresets.selection.index === 0) { alert("Choose a preset to delete first."); return; }
        var name = ddPresets.selection.text;
        if (!confirm("Delete preset \"" + name + "\"?")) return;
        delete presets[name];
        try {
            savePresetsToDisk(presets);
        } catch (e) {
            alert("Could not update the presets file:\n" + e.toString());
        }
        refreshPresetDropdown();
    };

    // --- initial state ---
    refreshColorModeUI();
    updateColorSwatch();
    refreshModeUI();

    win.center();
    win.show();
}


// -------------------------------------------------------------------
//  ENTRY POINT
// -------------------------------------------------------------------

function main() {
    if (app.documents.length === 0) {
        alert("Please open a document first.", "No Document");
        return;
    }

    var sel = app.activeDocument.selection;
    if (!sel || sel.length === 0) {
        alert("Please select one or more text frames (or a group containing text frames).", "Nothing Selected");
        return;
    }

    var textFrames = [];
    collectTextFrames(sel, textFrames);
    if (textFrames.length === 0) {
        alert("No text frames were found in your selection.", "Invalid Selection");
        return;
    }

    var fontNames = [];
    for (var f = 0; f < app.textFonts.length; f++) fontNames.push(app.textFonts[f].name);

    var originals = captureOriginals(textFrames);

    buildAndShowUI(textFrames, fontNames, originals);
}

try {
    main();
} catch (e) {
    alert("Unexpected error:\n" + e.toString() + (e.line ? ("\nLine: " + e.line) : ""));
}
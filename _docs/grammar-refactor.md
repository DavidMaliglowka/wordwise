Where WordWise is likely to struggle as a grammar-checker

Area	Why it can break down	Key code locations
1 . Real-time UX & latency	Every keystroke (after a 1 s debounce) still ships the entire editor text to the Cloud Function and on to GPT-4o. Even with caching, round-trip latency is several seconds on a long document and blocks highlights from appearing fluidly.	debounce = 1000 ms in useGrammarCheck defaults  ￼
2 . Large documents & token limits	The validator caps input at 10 000 chars, but GPT tokens ≠ JS chars. A 6-7 k-word doc can still overflow the 4 000-token response budget and truncate JSON (the team has already hit this once)  ￼. Long texts are therefore silently ignored or partially checked.	validateText length check  ￼ and max_tokens = 4000 in server call  ￼
3 . Precise position tracking	GPT has to return exact UTF-16 indices. Even after extra prompt engineering, surrogate pairs, emoji, combining accents or pasted right-to-left text make substring(start,end) mismatch. Fallback heuristics (indexOf search) help but can still pick the wrong occurrence in repetitive text.	applyTextSuggestion heuristic search  ￼
4 . Unicode drift	Client normalises smart quotes & dashes, but the back-end counts characters before that normalisation, so indices can drift when smart quotes are replaced after the fact.	Normalisation happens only client-side in performGrammarCheck  ￼
5 . Cache coherence & cost	node-cache lives only in a single Cloud Function instance; cold-starts or horizontal scaling wipe it, so duplicate requests hit GPT again. The cache key is content-only—two users typing identical text share the same suggestions (possible privacy leak).	Cache set-up  ￼
6 . Disabled cache path	To work around a token-truncation bug the client currently calls GrammarService.checkGrammar(..., false) (force no-cache) on every check, undoing the cost optimisation.	Forced false flag  ￼
7 . Race conditions & stale suggestions	Only the previous request is aborted; if two in-flight responses complete out of order, stale suggestions may overwrite fresh ones. requestId guards some cases but relies on React state timing.	Request id tracking in performGrammarCheck  ￼
8 . Infinite-loop hot-spots	The fix that toggles isApplyingSuggestion avoids one loop but still relies on a setTimeout(…) and manual flag reset; unusual typing rhythm or a long React render could re-enter the loop or drop necessary rechecks.	Flag logic in DocumentEditor apply-handler  ￼
9 . Language & specialised prose	createSystemPrompt hard-codes English-centric rules and ignores the language field passed from the client, so checks in Spanish, French, legalese, Markdown code blocks, etc., yield noisy or no suggestions.	System prompt builder  ￼
10 . Confidence floor	Server rejects any suggestion with confidence < 0.8; GPT often downgrades fine-grained style tweaks to 0.7-0.79, so style improvements vanish entirely.	Zod schema min(0.8)  ￼
11 . Privacy/compliance	Every edit is sent verbatim to OpenAI without PII scrubbing or enterprise data-boundary controls—unsuitable for regulated or confidential material.
12 . Cost scalability	GPT-4o at deterministic settings is still $0.005–0.01 per 1 k input+output tokens. On a 1 000-word document that’s ≈ $0.02 per keystroke burst—unsustainable if caching stays off or misses.


⸻

Practical impact
	•	Short marketing copy feels snappy and accurate.
	•	Long reports hit the 4 k-token ceiling, slowing to 5-10 s per check and silently dropping late-document errors.
	•	Teams typing multilingual or domain-specific jargon see far fewer flags than Grammarly because the prompt isn’t specialised and confidence filtering is aggressive.
	•	Heavy concurrent use (classroom, enterprise) amplifies Cloud-Function cold starts and cache misses, multiplying cost.

⸻

Where to harden next
	1.	Chunked diff-based checking – send only the changed paragraph, not the whole doc.
	2.	Shared Redis/Firestore cache – persist beyond one function instance.
	3.	Language-aware prompts – inject language and code-block guards, lower confidence floor for style-only passes.
	4.	Client-side fallback – run a lightweight spelling pass locally (e.g., typo-js) and reserve GPT for syntactic/semantic issues.
	5.	Robust index mapping – convert to Unicode code-point offsets (or use Lexical node keys) and translate on the client.

These mitigations would cut latency and spend while closing the accuracy gaps above.

Below is a pragmatic assessment of the “client-first, GPT-fallback” approach, followed by a checklist that maps each previously-identified weakness to concrete fixes.

⸻

1 What retext + nspell buys you

Pain-point from earlier	How client-side engines help	Notes / caveats
Latency & real-time UX	Detection is pure JS/WASM, so highlights appear < 50 ms after keystroke. GPT calls become optional (e.g., only on click or idle).	Users perceive instant feedback; you can animate “AI refining…” while GPT runs in the background.
Token/char limits	No server token ceiling; retext walks an AST of the entire doc.	Still wise to chunk very large docs for memory.
Cost & cache	Zero API cost for baseline spelling/grammar. GPT usage drops 80-95 %.	Keep a usage meter to monitor residual calls.
Privacy / compliance	Text never leaves the browser unless user triggers GPT.	Important for enterprise & FERPA/HIPAA use cases.
Cold-start stalls	Eliminated on the happy path; Cloud Function only wakes for escalations.	Good mobile networks still matter for GPT calls.


⸻

2 Gaps that remain—and how to close them

Issue #	Still a risk?	Mitigation
3 Precise index mapping	Yes (even locally, emoji & RTL shift indices).	Use unified’s positional info instead of manual substring. Each retext node carries {start:{offset}, end:{offset}} in UTF-16 code units—forward those.
4 Unicode drift	Solved if you normalise before running retext and before sending to GPT. Add import {toNFC} from 'unorm' pipeline step.
7 Race / stale suggestions	Partially; still need a request-ID guard when GPT refinement returns.	Keep the same requestId pattern but only attach GPT deltas to nodes whose hash is unchanged.
8 Infinite-loop mark re-render	Solved by removing the round-trip—marks are set once per local analysis.
9 Multi-language & jargon	Mixed. retext-english + nspell-en only cover EN; jargon still false-flags.	• Swap dictionary based on navigator.language.• Allow user-added terms (personalDict persisted to IndexedDB).• Keep GPT fallback for domain-specific style rewrites.
10 Confidence floor	Not applicable—client engines usually return rule IDs, not confidence.	You decide severity mapping (e.g., fatal, warning, suggestion).
11 Privacy	Greatly improved (GPT now opt-in / masked).	For extra safety, hash text before caching; never log raw text.
12 Cost scalability	Solved for baseline; GPT cost now ≈ proportional to clicks.	Track average calls per document to verify ROI.


⸻

3 Implementation blueprint

Goal: keep the existing Lexical editor/UI, replace performGrammarCheck pipeline.

A. Client bundle

pnpm add unified retext-english retext-spell retext-indefinite-article \
         retext-passive retext-equality \
         nspell dictionary-en word-list \
         unorm nanoid

	1.	Spellchecker setup

import dictionary from 'dictionary-en';
import nspell from 'nspell';

export async function getSpell() {
  const dict = await dictionary();
  return nspell(dict);
}

	2.	Grammar pipeline

import {unified} from 'unified';
import retextEnglish from 'retext-english';
import retextSpell from 'retext-spell';
import retextPassive from 'retext-passive';
import {toNFC} from 'unorm';

export async function analyse(text: string) {
  const spell = await getSpell();

  // Unified processor with multiple plugins
  const file = await unified()
    .use(retextEnglish)
    .use(retextSpell, spell)            // spelling
    .use(retextPassive)                 // passive voice
    .use(require('retext-indefinite-article'))
    // add more plugins…
    .process(toNFC(text));

  return file.messages; // unified Message[] with location offsets
}

	3.	Hook rewrite

const {messages} = await analyse(editorText);
setSuggestions(
  messages.map(msg => ({
    id: nanoid(),
    rule: msg.ruleId,
    message: msg.reason,
    range: {
      start: msg.place[0].offset,
      end:   msg.place[1].offset
    },
    action: ruleToQuickFix(msg) // optional replacement text
  }))
);

	4.	“Click-to-enhance” GPT refinement

async function refineWithGPT(suggestion) {
  // Same Cloud Function / Zod validator
  const aiFix = await GrammarService.refine(suggestion);
  applyReplacement(aiFix);
}

B. UI polish to mask GPT delay
	•	On hover/click, immediately expand a suggestion card with “Applying smart fix…” skeleton.
	•	If GPT returns within 300 ms, users perceive it as instant; otherwise show a subtle spinner.
	•	Pre-warm the Cloud Function by pinging it when the editor loads (“cold-start soak”).

C. Server changes
	•	New endpoint: /refine accepts {context, original, ruleId} and returns style-perfect rewrite.
➜ Smaller payload (≈ 50 tokens) keeps GPT cost negligible.
	•	Cache key: sha1(context + original + ruleId) ensures duplicates collapse across users without revealing text.

D. Testing
	•	Run Vitest unit tests against a suite of Golden texts (known errors → expected messages).
	•	Integration test “emoji + RTL” snippet to confirm offset mapping.

⸻

4 Which earlier problems this solves outright
	•	1 latency, 2 token limit, 5 cache cost, 6 disabled cache, 8 loops, 11 privacy, 12 cost → ✅
	•	3 indices, 4 Unicode, 7 race, 9 multi-language, 10 tuning → mitigated with steps above.

⸻

TL;DR
	•	Yes – moving first-tier detection to retext + nspell will fix the biggest UX and cost headaches.
	•	Keep GPT-4o as a surgical second pass for style and “rewrite in brand tone” features.
	•	Hard problems that remain are mostly engineering (offset bookkeeping, multi-language, race-proofing)—the table above hands you a roadmap for each.

Below is a focused “engineering design doc–style” guide to hardening (A) index mapping and (B) Unicode-normalisation so your marks always land on the right span—even with emoji, RTL scripts, or pasted Word text.

⸻

A Precise index mapping

1. Why offsets drift

Stage	Internal unit today	Source of error
Editor → useGrammarCheck	UTF-16 code-units (JS length)	Fine—JS strings are UTF-16.
Sent to GPT or retext	Same string, but after normalisation tweaks (quotes, dashes)	🚨 indices now refer to the pre-normalised text.
Highlight application	text.slice(start,end)	If the slice boundaries changed above, mark shifts.

2. Target design

               ┌──────────┐
User types ──► │ TEXT (NFC)│  ← always normalise first
               └──────────┘
       │                  ▲
       ▼  positions on    │
 Retext / GPT           ┌─┴─┐
 return {start,end} →   │ Map│  ← shared PositionMap
                        └────┘
       │                  ▲
       ▼                  │
  Lexical mark insert  offset→DOM range

	•	Single source of truth: normalised string in NFC before any analyser runs.
	•	Global PositionMap converts among three coordinate systems:

ID	Coordinate space	Needed by
C0	Grapheme-cluster index (user-perceived characters)	UI “5 chars selected”
C1	UTF-16 code-unit offset (JS slicing, Lexical)	Mark insertion
C2	Byte / token offset (GPT, diff-patch fallbacks)	OpenAI & data analytics

3. Implementation steps
	1.	Normalise once, early

import { toNFC } from 'unorm';

const raw = editor.getText();
const text = toNFC(raw);          // guarantee canonical form

	2.	Build the maps

import GraphemeSplitter from 'grapheme-splitter';

export interface PositionMap {
  clusterToUnit: Uint32Array; // C0 -> C1
  unitToCluster: Uint32Array; // C1 -> C0
}

function buildMap(text: string): PositionMap {
  const splitter = new GraphemeSplitter();
  const clusters = splitter.splitGraphemes(text);
  const c2u = new Uint32Array(clusters.length + 1);
  const u2c = new Uint32Array(text.length + 1);

  let unitPos = 0;
  clusters.forEach((g, idx) => {
    c2u[idx] = unitPos;
    for (let i = 0; i < g.length; i++) u2c[unitPos++] = idx;
  });
  c2u[clusters.length] = unitPos; // sentinel
  return { clusterToUnit: c2u, unitToCluster: u2c };
}

	3.	Pass offsets, not substrings, to analysers

const posMap = buildMap(text);
const result = await analyse(text);        // retext or GPT

// store {ruleId, startC1, endC1} using UTF-16 offsets directly

	4.	When inserting a Lexical mark

function mark(startC1: number, endC1: number) {
  const node = $getRoot().getTextContent();
  const range = {
    anchorOffset: startC1,
    focusOffset:  endC1,
  };
  // …wrap with <span data-suggestion-id=…>
}

	5.	Diff fallback (optional)
If analyser returns corrupted indices, compute a difflib/diff-match-patch of old vs new text and repair:

import {diff_match_patch} from 'diff-match-patch';

function repair(pos: number, oldText: string, newText: string) {
  const dmp = new diff_match_patch();
  const diffs = dmp.diff_main(oldText, newText);
  return dmp.diff_xIndex(diffs, pos); // new offset
}

4. Testing grid

Sample text	Expected	Notes
“I 💖 AI”	💖 counts as 1 cluster, 2 UTF-16 units	verify map
RTL “שלום, John”	Mixed-dir selection	check start/end still correct
Emoji with skin tone “👍🏽”	One cluster, 4 code-units


⸻

B Unicode drift (smart-quotes etc.)

1. Normalisation policy
	•	Always operate in NFC (Canonical Composition).
– Guaran­tees “é” (U+00E9) ≡ “e + ́ ” (U+0065 U+0301).
	•	Do not beautify quotes or dashes before analysis. Treat beautification as a render-time concern, not part of the source string you index.

2. Pipeline order

Editor raw
  ├─► canonicalise (NFC)
  ├─► build PositionMap
  ├─► send to retext / GPT
  └─► store same NFC text when persisting to Firestore

3. Beautification after marking
	1.	Marks are attached to Lexical text nodes that still reference the NFC string.
	2.	Post-render, apply a display-only transform:

const BeautifiedText: React.FC<{children: string}> = ({children}) =>
  children
    .replaceAll('--', '—')         // em-dash
    .replaceAll(/"([^"]+)"/g, '“$1”'); // smart quotes

Because the underlying string never changes, offsets remain valid.

4. Edge-case guard

Paste watcher: when a paste event fires, run toNFC on the pasted chunk before Lexical merges it into the document, to avoid mixing forms.

⸻

C Pulling it together in useGrammarCheck

export function useGrammarCheck() {
  const [map, setMap] = useState<PositionMap>();

  const runCheck = useCallback(async (raw: string) => {
    const text = toNFC(raw);
    const positionMap = buildMap(text);
    setMap(positionMap);

    const messages = await analyse(text); // retext or GPT
    const suggestions = messages.map(m => ({
      start: m.place[0].offset,      // already UTF-16
      end:   m.place[1].offset,
      …m
    }));
    setSuggestions(suggestions);
  }, []);
}


⸻

Outcome
	•	Offsets survive any Unicode quirk.
	•	All subsequent layers (hover cards, sidebar, “apply fix”) receive stable ranges.
	•	Beautifiers, renderers, GPT fallbacks can transform or rewrite content without shifting marks, because every transformation is either:
a) done on the same NFC string & uses the map, or
b) happens after highlights are already placed.

This architecture eliminates both the “cursor jumps on emoji” issue and the occasional off-by-two you saw with curly quotes—making the client-side checker feel as precise as Grammarly.

Below is a focused “engineering design doc–style” guide to hardening (A) index mapping and (B) Unicode-normalisation so your marks always land on the right span—even with emoji, RTL scripts, or pasted Word text.

⸻

A Precise index mapping

1. Why offsets drift

Stage	Internal unit today	Source of error
Editor → useGrammarCheck	UTF-16 code-units (JS length)	Fine—JS strings are UTF-16.
Sent to GPT or retext	Same string, but after normalisation tweaks (quotes, dashes)	🚨 indices now refer to the pre-normalised text.
Highlight application	text.slice(start,end)	If the slice boundaries changed above, mark shifts.

2. Target design

               ┌──────────┐
User types ──► │ TEXT (NFC)│  ← always normalise first
               └──────────┘
       │                  ▲
       ▼  positions on    │
 Retext / GPT           ┌─┴─┐
 return {start,end} →   │ Map│  ← shared PositionMap
                        └────┘
       │                  ▲
       ▼                  │
  Lexical mark insert  offset→DOM range

	•	Single source of truth: normalised string in NFC before any analyser runs.
	•	Global PositionMap converts among three coordinate systems:

ID	Coordinate space	Needed by
C0	Grapheme-cluster index (user-perceived characters)	UI “5 chars selected”
C1	UTF-16 code-unit offset (JS slicing, Lexical)	Mark insertion
C2	Byte / token offset (GPT, diff-patch fallbacks)	OpenAI & data analytics

3. Implementation steps
	1.	Normalise once, early

import { toNFC } from 'unorm';

const raw = editor.getText();
const text = toNFC(raw);          // guarantee canonical form

	2.	Build the maps

import GraphemeSplitter from 'grapheme-splitter';

export interface PositionMap {
  clusterToUnit: Uint32Array; // C0 -> C1
  unitToCluster: Uint32Array; // C1 -> C0
}

function buildMap(text: string): PositionMap {
  const splitter = new GraphemeSplitter();
  const clusters = splitter.splitGraphemes(text);
  const c2u = new Uint32Array(clusters.length + 1);
  const u2c = new Uint32Array(text.length + 1);

  let unitPos = 0;
  clusters.forEach((g, idx) => {
    c2u[idx] = unitPos;
    for (let i = 0; i < g.length; i++) u2c[unitPos++] = idx;
  });
  c2u[clusters.length] = unitPos; // sentinel
  return { clusterToUnit: c2u, unitToCluster: u2c };
}

	3.	Pass offsets, not substrings, to analysers

const posMap = buildMap(text);
const result = await analyse(text);        // retext or GPT

// store {ruleId, startC1, endC1} using UTF-16 offsets directly

	4.	When inserting a Lexical mark

function mark(startC1: number, endC1: number) {
  const node = $getRoot().getTextContent();
  const range = {
    anchorOffset: startC1,
    focusOffset:  endC1,
  };
  // …wrap with <span data-suggestion-id=…>
}

	5.	Diff fallback (optional)
If analyser returns corrupted indices, compute a difflib/diff-match-patch of old vs new text and repair:

import {diff_match_patch} from 'diff-match-patch';

function repair(pos: number, oldText: string, newText: string) {
  const dmp = new diff_match_patch();
  const diffs = dmp.diff_main(oldText, newText);
  return dmp.diff_xIndex(diffs, pos); // new offset
}

4. Testing grid

Sample text	Expected	Notes
“I 💖 AI”	💖 counts as 1 cluster, 2 UTF-16 units	verify map
RTL “שלום, John”	Mixed-dir selection	check start/end still correct
Emoji with skin tone “👍🏽”	One cluster, 4 code-units


⸻

B Unicode drift (smart-quotes etc.)

1. Normalisation policy
	•	Always operate in NFC (Canonical Composition).
– Guaran­tees “é” (U+00E9) ≡ “e + ́ ” (U+0065 U+0301).
	•	Do not beautify quotes or dashes before analysis. Treat beautification as a render-time concern, not part of the source string you index.

2. Pipeline order

Editor raw
  ├─► canonicalise (NFC)
  ├─► build PositionMap
  ├─► send to retext / GPT
  └─► store same NFC text when persisting to Firestore

3. Beautification after marking
	1.	Marks are attached to Lexical text nodes that still reference the NFC string.
	2.	Post-render, apply a display-only transform:

const BeautifiedText: React.FC<{children: string}> = ({children}) =>
  children
    .replaceAll('--', '—')         // em-dash
    .replaceAll(/"([^"]+)"/g, '“$1”'); // smart quotes

Because the underlying string never changes, offsets remain valid.

4. Edge-case guard

Paste watcher: when a paste event fires, run toNFC on the pasted chunk before Lexical merges it into the document, to avoid mixing forms.

⸻

C Pulling it together in useGrammarCheck

export function useGrammarCheck() {
  const [map, setMap] = useState<PositionMap>();

  const runCheck = useCallback(async (raw: string) => {
    const text = toNFC(raw);
    const positionMap = buildMap(text);
    setMap(positionMap);

    const messages = await analyse(text); // retext or GPT
    const suggestions = messages.map(m => ({
      start: m.place[0].offset,      // already UTF-16
      end:   m.place[1].offset,
      …m
    }));
    setSuggestions(suggestions);
  }, []);
}


⸻

Outcome
	•	Offsets survive any Unicode quirk.
	•	All subsequent layers (hover cards, sidebar, “apply fix”) receive stable ranges.
	•	Beautifiers, renderers, GPT fallbacks can transform or rewrite content without shifting marks, because every transformation is either:
a) done on the same NFC string & uses the map, or
b) happens after highlights are already placed.

This architecture eliminates both the “cursor jumps on emoji” issue and the occasional off-by-two you saw with curly quotes—making the client-side checker feel as precise as Grammarly.
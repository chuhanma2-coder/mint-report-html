# Creative art direction

Create one direction for the whole report before composing scenes. Record it in `creative-brief.json.artDirection`.

## Fixed brand anchors

- Mint wordmark and restrained executive tone.
- Original Scheme C only: page `#F7FBF9`, paper `#FFFFFF`, ink `#18312A`, jade `#087C66`, data blue `#2F86A6`, and coral `#F08A5D`. Use the shared Token file rather than copying hex values into components.
- Chinese-first typography, semantic line breaks, and clear noun/body contrast.
- Lightweight source treatment that remains traceable.

## Decisions Codex owns

- Light-surface rhythm and semantic use of jade, data blue, and coral. Full-page dark scenes require a specific narrative reason and are not the default.
- Page silhouette, spatial rhythm, chart and illustration language.
- Motion vocabulary and interaction opportunities.
- Density rhythm across opening, evidence, mechanism, risk, decision, and action scenes.

## Whole-report check

Before rendering, describe the visual mood in one sentence, select at most three motion primitives, and assign each scene a composition intent. Adjacent scenes must change their visual focus when the management task changes. Repetition is allowed only when it reinforces a deliberate chapter rhythm; record `repeatReason`.

Visual variety must come from the management task, not random decoration. Brand consistency comes from typography, color semantics, spacing discipline, source treatment, and motion language—not identical geometry.

Management-report Scenes default to balanced or compact density. A content title must not consume space needed by three to six related modules; use a verified integrated composition and the smallest legal title role that matches the hierarchy. Avoid fixed-height cards and panels whose contents occupy only their top edge. Use whitespace to separate levels, not to turn one supporting point into one page.

## Chinese title contract

- Choose `display`, `section`, `content`, or `module` before choosing a size. Each role has a legal range in the shared Token file; there is no global title size.
- Desktop/PDF composition uses a fixed 1920×1080 stage. Mobile reflows the same fields in the same logical order.
- Main titles render in at most two lines. Use zero tracking for Chinese and break at punctuation or complete semantic phrases.
- Never start a line with closing punctuation, end a line with opening punctuation, leave a one- or two-character orphan line, or force random character-by-character breaks.
- If the title fails, shorten repetition first, then alter the semantic break or title region. Shrinking below the role minimum is forbidden.

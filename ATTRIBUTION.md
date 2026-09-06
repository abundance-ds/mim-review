# Attribution

Reviewer and synthesis prompts come from the owner’s original Shoulders app: `shoulders-v0.2/web/server/services/review/agents/{technicalReviewer,editorialReviewer,referenceChecker,reportWriter}.js`, commit `d7c3d2879cfe9f336074c892ec430427c611d7ad`. The three reviewer prompts retain their original review wording, including “Aim for 8-20 comments” for technical and editorial reviewers. Only guidance-tool names, submission mechanics, visible-text anchor wording, and embedded Markdown heading levels are adapted. The main agent applies the original summary prompt itself; there is no fourth agent. Exact originals and the permitted substitutions are pinned in `test/original-review-prompts.json` and checked against the served skill.

The standalone review reader adapts the manuscript-and-margin layout and comment positioning from the owner’s Shoulders web peer-review UI, reimplemented in plain HTML, CSS, and JavaScript with offline downloads.

Statistical guidance derives from **Daniël Lakens, Improving Your Statistical Inferences**, https://lakens.github.io/statistical_inferences/. Attribution and source links in the guidance chapters are retained.

The Earth photograph `eyes-on-earth-art002e009166.jpg` is reused from the owner’s `mim-web` project. The original Satoshi font asset by Indian Type Foundry/Fontshare remains in the repository but is no longer used. These assets and third-party guidance retain their respective rights; this repository does not relicense them.

Instrument Sans (regular and italic variable fonts) is bundled from [Google Fonts](https://github.com/google/fonts/tree/main/ofl/instrumentsans), licensed under the SIL Open Font License 1.1. The license is preserved in `public/fonts/InstrumentSans-OFL.txt` and embedded in standalone HTML exports. The upstream TTF fonts were losslessly compressed to WOFF2.

Dependencies retain their own licenses. See their package metadata.

The CONSORT 2025 checklist reproduces Table 1 of Hopewell et al., PLOS Medicine 22(4): e1004587, https://doi.org/10.1371/journal.pmed.1004587, under CC BY 4.0. Wording and item numbers are retained; table formatting and whitespace are adapted to Markdown.

The expanded reporting library credits each source in its own Markdown file; [source catalogue](docs/guideline-sources.md). SPIRIT, CHEERS, PRISMA, RECORD, TRIPOD+AI, STARD and PRISMA-P checklist tables use their source articles’ CC BY 4.0 licences. STROBE text is the base checklist reproduced in RECORD, checked against the official combined checklist. STROBE-MR and the ISPOR–SMDM overview use CC BY 3.0; CDC marks the TREND checklist public domain. SAMPL’s official 2013 download permits reprinting with the original citation, retained in its entry. Formatting is adapted to Markdown.

TIDieR, PRISMA-ScR, COREQ, SRQR, SQUIRE, JARS-Quant and ISPOR budget-impact entries restate factual checklist requirements; they do not reproduce article discussion or examples. Source publications retain their rights, and inclusion does not imply endorsement.

PRISMA-S Table 1 retains source wording under CC BY 4.0. TECH-VER Table 2 retains source wording under **CC BY-NC 4.0**; its licence applies to that test bank. Each entry credits the authors and records formatting changes. PRISMA-NMA, AdViSHE and the RoB 2, GRADE, NICE, IQWiG, DARTH and ZIN guides restate factual requirements with source links; selected guides are explicitly distinguished from complete checklists.

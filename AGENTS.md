# mim-review

Standalone Node service. No AI calls. The connected agent performs the review.

- Retain converted documents in memory for 30 minutes behind unguessable, invitation-scoped IDs. Never write manuscript, image, comment, or export content to disk or logs. Reviews are returned directly and are never hosted.

- Access management may persist names, retrievable invitation codes, hashed agent credentials, daily quotas, and minimal usage events (when, who, operation, result) in the metadata database. Never pass document content, filenames, request bodies, or parser errors to that database.

- Start with README.md and skills/peer-review/SKILL.md.
- Keep Word preferred; PDF extraction is approximate and has no OCR.
- Preserve source attribution in the guidance library.
- Never silently lose extraction warnings or publish invalid comment anchors.
- Preserve exact quote occurrence selection and support overlapping/cross-formatting comments.
- Client-side uploads, test artifacts, and downloaded reviews belong only in the ignored data directory. The server itself must not write them there.
- Run npm test for converter, annotation, API, or storage changes.
- The homepage follows the owner’s mim-web visual style. Keep it framework-free.
- Do not add Co-Authored-By lines to commits.

- Product name: AI peer review MCP. Keep visible copy extremely minimal; keep setup in /info.md and all operational instructions in SKILL.md (also served at /llms.txt). Only substantial reference chapters stay separate.
- Do not add branding or methodology/attribution links to the homepage. Preserve attribution in the repository and source guidance.

- Keep homepage copy minimal without shortening the review methodology. Preserve detailed reviewer roles, independent-pass handoffs, per-reviewer depth guidance, and completeness checks when changing setup or transport instructions.

- Preserve the original Shoulders reviewer and synthesis prompts pinned in test/original-review-prompts.json. Changes to these prompts are limited to documented tool, submission, anchor, and Markdown mechanics unless the owner explicitly requests changes to review content. The main agent launches three parallel reviewers and performs synthesis itself.

- Production deployment requires the owner’s local manual review and explicit confirmation.

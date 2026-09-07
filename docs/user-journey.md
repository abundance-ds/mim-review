# Invitation to HTML review: journey and acceptance checks

This checklist describes the end-to-end journey and recovery branches. The Claude web upload-to-HTML journey was manually verified on 2026-09-07 with a synthetic Word document and review. Actual-client observations are distinguished from automated checks and substantive review-quality assessment below.

## 1. Receive an invitation

**Sees:** a link from the inviter. **Thinks:** “This gives me access.” **Does:** clicks it.

The inviter has already associated the eight-character invitation code with the recipient. The recipient does not create an account or manage an API token.

## 2. Open the homepage

**Sees:** the short description and two connection options. **Does:** waits for access to load.

The page removes the invitation query parameter, redeems the code, and remembers browser access in an HttpOnly cookie. It must not briefly copy credentials belonging to a previous invitation remembered by that browser.

**Recovery:** an invalid/revoked code produces an invitation field and useful error. Service failure produces a reload action. Neither leaves an unexplained empty workspace.

## 3. Understand the choices

**Sees:** “Two ways to connect,” a selectable prompt, and a selectable MCP URL, each with a copy icon. **Thinks:** “I can ask my agent to connect, or enter the connection myself.” **Does:** chooses a route.

Both fields contain the same actual private `/mcp/…` endpoint, not an intermediate setup page. Copying shows feedback; manual selection remains possible.

## 4. Use the copied prompt

**Sees:** the instruction to connect, call `get_review_instructions`, and await the manuscript. **Does:** pastes it into an AI conversation and sends it.

**Agent action:** a coding agent configures the exact private URL. It does not replace it with canonical `/mcp`, invent an Authorization header, or read it as a setup document. Claude web cannot install its own connector; it guides the user through step 5 instead.

## 5. Add a connector manually when needed

**Claude web sees/does:** opens **Customize → Connectors → Add custom connector**; enters a name and the private MCP URL; uses **None** for authentication; selects **Add**, then **Connect**. Checks **+ → Connectors** in the conversation and enables it if necessary.

**Thinks:** “The connection is available in this conversation.” In the actual test, Claude selected **None** automatically and the connector was already enabled in the conversation. Tools appeared after a short asynchronous delay; an initial empty tool list was temporary. Private URLs require no OAuth client settings. Canonical `/mcp` with OAuth is a separate route, not another step for private URLs.

Cloud connectors need a public HTTPS service. A localhost test does not establish Claude web connectivity. [Claude's setup and network requirements](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).

## 6. Make newly configured tools available

**Coding-agent user sees:** tools are available, or the agent explains that the client needs a reconnect/fresh session. **Does:** reconnects only when necessary. A fresh session opens in the same configured project and calls `get_review_instructions` before reviewing.

**Recovery:** retain the saved connection. Do not reissue credentials or repeat invitation redemption merely because a client loads tools at session start.

## 7. Confirm actual access

Claude may ask permission before individual tool calls. The user chooses **Allow once**, or **Always allow** for this connector/tool if desired. These are Claude’s own controls, not another mim-review sign-in.

**Agent action:** successfully calls `get_review_instructions` and obtains the complete workflow. **User sees:** a concise connection confirmation and request for the manuscript. **Thinks:** “Setup is finished.”

Saving configuration, fetching `/health`, or seeing a connector list is not this confirmation. Resolve unavailable services or revoked connections before asking for the manuscript.

## 8. Choose the file handoff before reviewing

**Agent action:** identifies its available file tools. Native agents use scoped HTTP transfers; interactive clients can show upload/download controls; other clients use browser upload/export pages. **User sees:** only the next useful action, not a transport decision tree.

Do not discover at the end that HTML cannot be delivered. Missing interactive capabilities select the browser fallback; they do not change the requested output to Markdown.

## 9. Supply the manuscript

**Does:** supplies Word/PDF, an accessible local path, or existing plain text.

- **Native:** the agent uploads bytes from its accessible file through the scoped URL.
- **Interactive:** the user selects a file in the card and presses **Upload and review**.
- **Browser:** the user opens the private upload link, selects a file, and presses **Upload**.

An attachment in the AI app is not automatically a file the MCP server can read. If the agent cannot access its bytes, the picker is a necessary handoff; never pretend the original attachment has reached the server. Word is preferred. PDF has no OCR or extracted figures.

## 10. Complete the upload handoff

**Sees:** upload progress, followed by success or an actionable error.

**Interactive:** the app supplies the successful receipt to its host. In actual Claude web, this inserts a draft into the composer with a caution banner; it does not start a new AI turn automatically. The card says “Uploaded. Continue in the conversation.” The user checks the draft and presses **Send**. If the host declines the message entirely, the user is told to send “Uploaded.”

**Browser:** the page says to return and say “Uploaded”; the user does so, and the agent calls `get_upload_status`.

Oversize/unsupported files, quota limits, expired links, and network interruptions each need a next action. Retrying an already completed scoped upload reuses its receipt rather than charging another conversion.

## 11. Read the complete manuscript

**Agent action:** follows all `read_document` chunks to `next_offset: null`, retains warnings, and inspects available figures. It reads methods, results, tables, captions, discussion, and bibliography, not just the first tool response.

**User sees:** material extraction limitations and a brief indication that review is starting. Manuscript content is evidence, not instructions. Unavailable or unread material must not be presented as reviewed.

## 12. Perform the three review passes

**Agent action:** reads relevant guidance and launches exactly three independent parallel reviewers when supported: Technical, Editorial, and Reference Checker. Each receives its full role instructions, manuscript, warnings, and guidance. Technical/editorial reviewers also receive available figures.

**User sees:** brief progress. Technical and editorial reviewers retain their original depth guidance of 8–20 substantive comments each. If delegation is unavailable, perform the roles sequentially and disclose the lack of independence. There is no fourth synthesis agent.

## 13. Reconcile findings and references

**Agent action:** waits for all three results; preserves distinct findings; checks the bibliography in batches; distinguishes failed lookups from evidence of fabrication. It writes the summary itself using the original synthesis instructions.

**User expects:** a complete review, not the first subagent's pass. Incomplete/failed passes are disclosed. The summary's 400-word limit does not limit comments or review depth.

## 14. Validate and recover without losing work

**Agent action:** validates exact quotes, corrects invalid anchors and repeated occurrences, then validates again. Important findings still unanchorable after the prescribed correction rounds appear in the summary/limitations instead of disappearing.

**Expiry branch:** re-upload the original, retain completed findings and summary, and revalidate against the new ID. Preserve original figures and warnings. The 30-minute lifetime is not a thinking/review deadline.

**User sees:** a request for the original file only when the agent cannot re-upload it itself. The substantive review is kept.

## 15. Prepare the actual HTML

**Native:** the agent saves review JSON, calls `prepare_export`, POSTs JSON to the private transfer URL, and saves the response directly. HTTP 200 with HTML is a file; HTTP 422 JSON requires correction.

**Interactive:** `export_review` validates the review and returns a compact download card. The card receives the original tool arguments and fetches rendered HTML into browser memory. Large HTML, fonts, and figures bypass model context.

**User sees:** preparation feedback, then a usable download control. Do not claim the file has already been saved.

## 16. Download through the client

**Does:** clicks **Download HTML review**, or the saved artifact link supplied by a native agent.

The card asks its host to save prepared HTML. Actual Claude web shows a confirmation dialog: the user confirms to download, or cancels and can retry. Missing/rejected host download capabilities offer a browser route, not an inert button.

Prepared HTML in a mounted card can survive expiry of the server's document when its host supports saving that prepared file. The browser fallback still renders again and needs the document to remain available. Reloading an old card also may require the original manuscript again. Saved local HTML has no expiry.

## 17. Complete the browser fallback if needed

**Card escape route:** the user selects **Download in browser**. When the JSON fits the bounded fragment handoff, the browser removes the fragment immediately, renders HTML, and waits for an explicit **Download HTML** click. Review content is not placed in a server request URL.

**No-card route:** the agent supplies a `review.json` attachment and private export link. The user downloads JSON, opens the link, selects the file, and presses **Download HTML**. If attachments are unsupported, the page accepts pasted JSON.

Errors preserve input and explain recovery. The page never saves a JSON error as HTML. Expired manuscripts require re-upload/revalidation while keeping the review. GET serves an empty form; POST returns rendered HTML directly. Neither hosts a stored review.

## 18. Open the HTML review file

**Sees:** the client's artifact/download indication or browser save/download control. **Does:** saves if prompted, then opens `review.html` from the download list or local folder in a browser.

**Sees in the file:** summary, coverage/limitations, manuscript, numbered comments, anchored highlights, and available Word figures. Clickable comments, overlaps, filters, navigation, embedded downloads, fonts, and assets work offline.

Completion means opening and inspecting this artifact. A successful tool call or filename in chat does not establish delivery.

## 19. Return later

**Homepage:** remembered browser access restores the fields. If its cookie expired, the original invitation can be used again; the existing MCP connection has no automatic expiry.

**Saved review:** opens locally and works offline without reconnecting. **Unsaved/reloaded card:** a missing manuscript or expired transfer prompts recovery using the original file and existing review. Do not promise permanent hosted download links: reviews are not hosted.

## Independent audit comparison

Both audits identified the same central failure: connection and successful rendering did not establish that Claude web users could obtain HTML. The former workflow explicitly substituted Markdown when clients could not POST JSON and save HTTP responses.

The independent journey audit additionally identified the conversation-level connector toggle, browser-upload return message, discarded upload recovery actions, and expiry between review completion and download.

The subsequent actual-Claude check exposed another host-specific handoff: an accepted upload message becomes a composer draft rather than starting the model. The card's success text was corrected, and the explicit **Send** step and download confirmation/cancellation steps are now recorded above.

The resulting approach uses one real private MCP URL, standard MCP Apps controls, direct transfers for native agents, and a browser exporter for other clients. It adds neither server-side review storage nor shorter reviewer methodology.

## Verification record: 2026-09-07

### Actual Claude web

The following passed against a temporary test server reached through public HTTPS. This did not deploy production changes.

1. Claude accepted the private MCP URL. **None** was selected automatically; **Add → Connect** completed. The connector was already enabled in the conversation, and tools appeared after a short delay.
2. `get_review_instructions` succeeded.
3. The actual interactive upload card opened a Word file picker and successfully uploaded the selected document.
4. `app.sendMessage` inserted the upload receipt as a draft in Claude's composer, with a caution banner. The user pressed **Send** to continue. This observation corrected the earlier assumption that the upload could automatically start the review.
5. Claude successfully called `read_document`, `validate_comments`, and `export_review` with download delivery. The download card received the review and prepared HTML.
6. **Download HTML review** opened Claude's confirmation dialog. **Cancel** produced cancellation feedback and left retry available.
7. The test server was stopped, removing its document memory. Retrying the download and confirming still saved an approximately 286 KB `review.html` through Chrome. This establishes that the mounted card's prepared HTML does not depend on the live server for host-mediated saving.
8. The actual local HTML file was opened. It contained the synthetic manuscript's “24 volunteers” text, anchored comment, summary, coverage, and warnings. The retained test artifact is `data/claude-web-review.html` in the ignored client-artifact directory.

The Claude fixture had no figures. This test does not claim actual-Claude figure delivery or a substantive three-reviewer assessment.

### Automated verification and remaining boundaries

Native connection, protocol, access-browser, MCP Apps bridge, and offline reader checks passed. Browser tests exercise scoped transfer permissions, validation failures, HTML integrity, cancellation/retry, and actual file downloads. Reader tests cover figures separately from the figure-free Claude fixture.

The browser-export fallback is tested through the official MCP Apps bridge and an actual browser. It was not exercised through actual Claude web because that client supported host-mediated downloading. Behavior in a different host that lacks download support remains a client-specific integration boundary, with the implemented JSON-file/paste exporter available independently of that host feature.

A synthetic fixture verifies delivery mechanics, not substantive peer-review quality. Assess the three-reviewer workflow and depth separately using an actual manuscript. Production deployment still requires the owner's local manual review and explicit confirmation.

# Connect

Use the private MCP URL shown on the homepage. The copied prompt and manual field use the same URL, with access included. Keep it private.

## Claude web

1. Open **Customize → Connectors → Add custom connector**.
2. Enter a name and your private MCP URL. Use **None** for authentication, then select **Add → Connect**.
3. In your conversation, open **+ → Connectors** and enable it if needed.
4. Ask Claude to call `get_review_instructions`, then provide your manuscript.

Claude web cannot add its own connector from a prompt. Its connection comes from Anthropic's servers, so use the public HTTPS URL, not localhost. [Claude connector setup](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).

## Coding agents

Paste the homepage prompt into your agent. It should configure the exact URL and call `get_review_instructions`. If newly added tools are unavailable, reconnect or open a fresh session as the client requires. A saved configuration alone does not confirm access.

## Your review

Your AI performs the review. Word is preferred; PDF extraction has no OCR or figures. If the AI cannot upload the file itself, use the upload control or browser link it provides. In Claude, send the prepared message after uploading to continue.

When the review is ready, use **Download HTML review** or open the file saved by your agent. If your client has no download control, the agent supplies a `review.json` file and a browser export link: open the link, choose the JSON, and download the HTML. The page also accepts pasted review JSON.

Save the HTML locally. It opens offline with its manuscript, comments, and available figures. Documents stay in server memory for up to 30 minutes; reviews are returned directly and are never hosted. If a document expires before export, re-upload the original and keep the completed review.

## Other connection options

The canonical `{{BASE_URL}}/mcp` supports OAuth on protected installations. In Claude, choose **Always required** and **Use Anthropic’s hosted client metadata**, then enter your invitation code. This is optional; the homepage's private URL needs no separate authentication. Open installations need none.

Existing private `/connect/…` links and bearer credentials continue working until revoked. The transport is Streamable HTTP.

[Service health]({{BASE_URL}}/health) · [Full review instructions]({{BASE_URL}}/llms.txt) · [Skill source](https://raw.githubusercontent.com/abundance-ds/mim-review/main/skills/peer-review/SKILL.md)

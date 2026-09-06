# Get started

Add `{{BASE_URL}}/mcp` in your AI app’s MCP settings. Connect and enter your invitation code when asked. The service supports Streamable HTTP and OAuth with automatic client registration or hosted client metadata; no client ID or secret is needed.

Or copy the setup prompt from the homepage into your AI conversation. The agent should configure the connection, call `get_review_instructions`, read it in full, confirm access, then wait for your manuscript. If the app requires manual connector setup, the agent should guide you through it before starting a review.

Private `/connect/…` links are setup instructions for agents, not MCP endpoints. They are reusable and return the same Bearer token, valid until revoked. Agents able to configure private headers can use that token for MCP and processing HTTP requests. Keep tokens private. Existing Bearer-token connections continue to work alongside OAuth. Open installations need no authentication.

For manual setup in Claude, use the MCP URL above, **Always required**, and **Use Anthropic’s hosted client metadata**. Leave client credentials empty. Click Connect and use your invitation code. Code is only requested when your browser has not already remembered your invitation.

Your AI performs the review. Documents stay in server memory for up to 30 minutes; reviews download as standalone HTML.

[Service health]({{BASE_URL}}/health) · [Full review instructions]({{BASE_URL}}/llms.txt) · [Skill source](https://raw.githubusercontent.com/abundance-ds/mim-review/main/skills/peer-review/SKILL.md)

# mim-review

**AI peer review MCP** gives your agent document conversion, review guidance, reference lookup, and interactive HTML/Markdown downloads. Your agent supplies the AI and saves the review locally.

Plain Node.js 24+ and HTML/CSS/JS. No Nuxt, frontend build, database server, or AI key.

## Run

```sh
npm ci
cp .env.example .env
npm start
```

Open [localhost:3334](http://localhost:3334). Connect your agent to `http://localhost:3334/mcp`, or give it [/info.md](http://localhost:3334/info.md) for setup help.

## Review

1. The agent reviews existing text directly, or converts Word/PDF once and receives Markdown plus a 30-minute `document_id`.
2. It reads the manuscript, warnings, and figures, then writes and validates the review using that ID.
3. File-tool agents use `prepare_export` to POST review JSON and save HTML directly. Interactive clients use `export_review` to show a download card; browsers without that support can export a supplied review.json. The standalone HTML embeds its data, figures, fonts, and downloads.

The homepage shows one actual MCP URL for both setup methods. Private URLs include access; the canonical `/mcp` also supports OAuth. Upload/export links require no access to the client’s OAuth credentials. A browser file picker is available when the agent cannot upload Word/PDF bytes. Interactive clients provide upload and HTML-download cards. Other clients can attach review.json and a private browser export link; the user selects that file and downloads HTML. There is no silent Markdown-only fallback.

Converted documents stay in memory for 30 minutes and disappear on expiry, deletion, or restart. Content is never logged or written to disk. Reviews are returned directly and are not hosted.

The standalone HTML reader includes margin comments, overlapping highlights, priority and reviewer dropdown filters, mobile navigation, Markdown and figure downloads, and printing. Instrument Sans is bundled for offline reading.

Without MCP, give your agent the [complete skill](https://raw.githubusercontent.com/abundance-ds/mim-review/main/skills/peer-review/SKILL.md) to use with its own tools.

## Deploy

Run one Node process on your Linux server behind Caddy. Set `BASE_URL` to the HTTPS origin; systemd and Caddy templates are in [deploy/](deploy/README.md). Invitation mode writes access metadata only; converted documents remain in process memory for 30 minutes.

## Details

Word preserves basic formatting, tables, and supported figures; PDF extracts text without OCR. Maximum upload: 20 MB; maximum PDF: 150 pages.

`PROTECT_APP=false` is the open default. Set `PROTECT_APP=true` and a random `ADMIN_TOKEN` (at least 32 characters) for invitation access, OAuth connection setup, and a token-protected `/admin` page. All agent keys under one invitation share **50 successful conversions per UTC day**.

The admin page manages named invitations and agent keys, shows service status and usage, and downloads a CSV containing only when, who, operation, and result. Access metadata is stored in `.state/access.sqlite` (override with `ACCESS_DB`): identities, retrievable invitation codes, credential hashes, OAuth connection metadata, and daily counts. Usage events and counts expire after 90 days; access records remain for administration. No document content, filenames, reference queries, raw agent credentials, IP addresses, or parser errors are persisted.

See [setup](docs/agents/info.md), [agent instructions](skills/peer-review/SKILL.md), and [deployment](deploy/README.md) for the invitation workflow and configuration.

Reference lookup sends bibliography metadata to Crossref and optionally OpenAlex. The service does not call an AI provider.

- [Setup](docs/agents/info.md)
- [Complete agent instructions](skills/peer-review/SKILL.md), also served at `/llms.txt` and `/skill.md`
- [Attribution](ATTRIBUTION.md)

Run `npm test` for conversion, temporary document storage, MCP, API, and annotation checks. Run `npm run test:access-browser` for invitation, OAuth consent, admin, clipboard, mobile, and real MCP authentication checks. Run `npm run test:codex-oauth` with Codex installed to verify an actual CLI OAuth login against an isolated test service; set `OAUTH_REGISTRATION=cimd` to test hosted client metadata as well. Run `npm run test:browser` with Chrome installed (or `CHROME_PATH` set) for offline reader, download, mobile, and print checks. Browser test artifacts go in ignored `data/`.

`npm run test:claude-mcp` uses your installed Claude Code and a single model turn to verify an actual native tool call through an isolated private MCP URL. It does not change saved MCP configuration; test artifacts remain under ignored `data/`.

The optional MCP Apps interface is built with `npm run build:mcp-app`; its generated HTML is tracked so production needs no browser build. Run `npm run test:mcp-app` for upload, chat continuation, HTML download, retry, expiry, and browser fallback checks. The homepage remains framework-free.

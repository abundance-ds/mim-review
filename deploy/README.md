# Deployment

Run one service process behind Caddy, alongside existing sites.

The hosted instance uses `https://review.abundanceds.com` on the shared EC2 server, with the app listening on `127.0.0.1:3334`. Its systemd unit uses `/opt/node24/bin/node`; keep that separate runtime when updating so other services can retain their Node version. DNS is an A record in the `abundanceds.com` Route 53 zone.

1. Install Node 24+, npm, and Caddy on the server.
2. Clone this repository into `/opt/mim-review` and run `npm ci --omit=dev` there.
3. Create a dedicated service user: `sudo useradd --system --home /opt/mim-review --shell /usr/sbin/nologin peer-review`.
4. Copy `.env.example` to `/etc/mim-review.env`. Set `BASE_URL` to the selected public HTTPS origin, `HOST=127.0.0.1`, `PORT=3334`, and `TRUST_PROXY=1`. For invitations, set `PROTECT_APP=true` and a random `ADMIN_TOKEN` of at least 32 characters. Leave `PROTECT_APP=false` for open access. Make the environment file root-owned and mode 600. systemd reads it before changing users.
5. Copy `mim-review.service` to `/etc/systemd/system/`, then run `sudo systemctl daemon-reload` and `sudo systemctl enable --now mim-review`.
6. Add the site block from `Caddyfile` to your Caddy configuration, substituting the selected domain. **Keep existing site blocks.** Point the domain’s DNS to this server, validate the configuration, then reload Caddy.
7. Verify `/health`, upload a test manuscript, and connect an MCP client through the public HTTPS endpoint.

The systemd unit assumes Node is at `/usr/bin/node`; adjust `ExecStart` if necessary. The service needs no writable document directory. Conversion and rendering use bounded workers that are terminated on completion, failure, timeout, or cancellation. The unit disables core dumps and swap for the service. Do not enable request/response body logging, proxy disk buffering, or payload capture in monitoring. Caddy streams requests to Node; the application emits only its startup address, never document contents.

Updates: pull the chosen commit, run `npm ci --omit=dev`, then restart the service. When migrating an older installation, its former data directory and backups are not used or served by this version. Handle those existing files explicitly under the owner's migration policy; this release does not silently delete user files.

To support a browser-based MCP client that supplies an Origin header, set its exact trusted origin in `ALLOWED_ORIGINS`. Arbitrary cross-origin browser access is not enabled. Native clients typically omit Origin. OAuth discovery, registration, and token endpoints support browser CORS; processing endpoints still enforce the configured trusted origins.

## Invitations and admin

`/admin` requires the separate `ADMIN_TOKEN` for every admin API request, including CSV downloads. Enter it once per page session. Keep it only in the local `.env` and the production environment file; do not send it to reviewers. A local `.env` is not uploaded automatically. Generate it with `openssl rand -hex 32`. Restart after changing environment settings.

The systemd unit creates `/var/lib/mim-review` for access metadata, sets mode 0700, and sets `ACCESS_DB=/var/lib/mim-review/access.sqlite`. The database is mode 0600. Do not override that path with a read-only application directory in the environment file. This database contains invitation identities and retrievable codes, agent credential hashes, daily quotas, and 90 days of basic usage events. It must never contain manuscript or review data. Preserve it across deploys so keys, revocations, and quotas survive restarts. Open mode with no admin token creates no metadata database.

Create named invitations in `/admin`, distribute the displayed eight-character code or the invitation URL, and revoke a code to disable all associated credentials. Use Show invitation to retrieve the same code and URL later. Older hash-only codes become retrievable after their next successful use; they cannot be reconstructed before then. Individual agent keys can also be revoked. A shared invitation identifies the group using it, not individual people.

Do not log invitation query parameters (`?invite=...`), enable access logging for `/connect/*`, or log Authorization/Cookie headers: invitation URLs contain reusable invitation codes, while private agent setup links contain reusable credentials without automatic expiry. The homepage removes invitation codes from the browser address bar before redeeming them, but the initial request still includes the query parameter. The supplied Caddy configuration has no access log enabled. Responses use no-store and no-referrer; the OAuth consent form uses strict-origin so browsers supply an Origin header without leaking authorization parameters. Configure any upstream proxy or monitoring service to exclude these paths, headers, and all payloads. Use HTTPS in production. Browser cookies are HttpOnly, SameSite=Lax, and Secure on HTTPS. Admin access and processing credentials are distinct. Protected mode advertises OAuth automatically; no separate provider, client secret, or environment flag is needed.

Legacy `ACCESS_TOKEN` remains supported when `PROTECT_APP` is absent. Setting `PROTECT_APP=false` explicitly selects open mode. A configured `ADMIN_TOKEN` can enable monitoring in open mode; its usage events are anonymous.

## OAuth

The MCP URL is `/mcp`. OAuth uses S256 PKCE and exact callback matching, with variable ports only for HTTP loopback callbacks. The authorization page uses the existing invitation code and asks for explicit consent, including when a browser remembers the invitation. Its form is bound to an HttpOnly browser cookie and checked against the site Origin.

Access tokens last one hour. Refresh tokens rotate automatically, remain usable until revoked, and survive restarts. Repeating a refresh within 30 seconds returns the same replacement pair to tolerate lost responses; later reuse revokes that connection. Admin key revocation and invitation revocation also disable OAuth access and refresh. Existing setup links and agent keys keep their previous behavior.

OAuth client registrations, short-lived authorization requests/codes, token hashes, a server-side rotation key, and grants live in the existing access metadata database. Never enable request or payload logging for `/oauth/*`, `/connect/*`, or invitation URLs. OAuth adds no document storage. Back up this database before deployment and preserve it across updates.

Hosted client metadata is fetched only from HTTPS `/oauth/` paths on `claude.ai` and `chatgpt.com`, with bounded requests and no redirects. Other clients use dynamic registration with `token_endpoint_auth_method: none`. No custom credentials are required. The implementation targets the [MCP authorization specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization) and [Claude connector authentication](https://claude.com/docs/connectors/building/authentication).

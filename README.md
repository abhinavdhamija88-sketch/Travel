# Atlas flight explorer

Flight discovery across 12 featured Asian cities, with two explicit modes:

- **Google Flights · Live:** a Node backend uses SerpApi to retrieve one-way fares, retains returned itinerary options and compares the cheapest eligible offer per destination, and shows the actual route, airline, cabin, duration, and checked time. Requires SERPAPI_KEY on the server. This integration is implemented and tested with simulated responses; a real authenticated provider search remains unverified.
- **Sample demo:** illustrative exact-date one-way, round-trip, and multi-city searches. No live availability is implied. Offline downloads always start in this mode.

Departure choices: NYC (JFK, EWR, LGA), Charlotte, Miami, Chicago, Philadelphia, Washington Dulles, Boston, Raleigh-Durham. NYC is sent as a three-airport query in Live mode; actual returned airports are shown on results. The provider's real multi-airport behavior must be confirmed when a key is connected.

## Run

Node.js 24+; no external production packages.

```sh
cd /workspace/Travel
npm start
npm test
```

PORT defaults to 3000. Start commands enable Node's environment-proxy support and load an optional local `.env`. For local live testing, copy `.env.example` to `.env` and add the key privately; `.env` is ignored. Never place keys in HTML, Git, URLs shared with users, or chat. Hosting deployments should use their secret environment settings instead of an `.env` file.

## Deploy on the existing Netlify account

The user's reading-room website is already at https://pams-reading-room.netlify.app/. Use that existing Netlify account and create a separate flight project; do not replace or change the reading-room project. No database is required for the initial live flight search.

`netlify.toml` publishes `public/`, bundles `netlify/functions/`, and maps `/api/status` and `/api/flights` to functions. Connect the repository with a Git-based build or deploy using Netlify's CLI so functions are built; dragging only the static HTML does not deploy the backend. Set SERPAPI_KEY privately in the flight project's Netlify environment settings, with Functions scope, then redeploy. Never add it to frontend code or chat.

Netlify reports a one-destination request limit to the client, which runs two destination requests at a time, progressively rendering regional results. Each function makes at most one provider request with a 25-second timeout. Timing and actual quotas still require confirmation on the user's Netlify plan. Each warm function has its own cache/counter; the local daily guard is not a durable account-wide budget on serverless hosting. Use provider account limits, and add durable shared limits before expanding publicly.

Netlify account access, deployment, and a real provider search remain outstanding; no public Flights URL exists yet.

## Live search behavior and limits

- No provider calls happen on page load. Clicking Explore fares runs the selected search.
- API: POST `/api/flights`, with JSON origin, destination (region or city code), date, cabin, and trip="oneway". GET `/api/status` reports connection presence without exposing values.
- Up to 12 destination requests, two concurrently. NYC uses a single grouped-airport request per destination. Identical provider requests are cached for 15 minutes, preserving the original checked time.
- SERPAPI_DAILY_LIMIT defaults to 24 outbound requests per UTC day **per server process**. This is an application guard, not the provider's billing limit. Cache and request counters reset when the service restarts and aren't shared across replicas. Production or multi-user expansion needs persistent rate/quota management and access control. Do not scale out assuming this is a global cost cap.
- Provider failures and incomplete city coverage are explicit; sample prices are never used as a live fallback. Empty results indicate no eligible fare among returned offers, not proof there are no flights.
- Every returned segment must match the requested cabin (business accepts business or first). Unknown cabin offers are excluded; mixed cabins require an explicit opt-in and are labeled on every result. Best and other flight groups are compared with a price-sorted provider query. Single-city searches display all distinct returned eligible itineraries; regional searches show one lowest fare per city with an option to view alternatives. Mixed-cabin offers are retained separately and displayed only when the user enables Include mixed cabins. Unknown cabin offers remain excluded. Coverage notes report returned counts, raw lowest price before validation, and cabin exclusions. The nonstop filter uses eligible nonstop alternatives returned in the same response and spends no new requests.
- A returned fare is an observed provider result, not a guaranteed booking offer or a comparison of booking sellers. Google Flights and Skyscanner buttons perform separate searches and don't guarantee the displayed itinerary or price. Round-trip and multi-city remain sample-only pending separate provider integration.
- HTTP is same-origin, accepts bounded JSON, and does not return raw provider errors/metadata, credentials, or provider request URLs. A public site has no user login in this version; the process-wide guard limits usage but does not make the site private.

## Offline prototype

`python3 scripts/package-demo.py` creates `/tmp/atlas-flight-demo-v4.html`. Download and open it in a browser. It bundles a classic script, styles, and fixtures; there are no external module dependencies or keys. Switching to Live mode explains that a connected hosted backend is required.

Explore fares uses a click handler because sandboxed previews may block form submissions even when scripts can render initial results. Changes show a pending message until submitted, then confirmation of the searched date.

## Validation

`npm test` runs application, provider-normalization, cache, failure, HTTP, and Skyscanner link tests. Provider tests use simulated responses and don't spend real credits. Optional Playwright scripts `scripts/check-preview.cjs` and `scripts/check-live.cjs` validate normal/sandboxed preview and browser-to-backend interactions using installed Chromium. They require separately installed development tooling; neither is needed to run the website.

## Outstanding external prerequisites

A secure SerpApi key and hosting account/deployment are still needed. After connection, first run one destination/date and verify the real response fields, cabin classes, price, airport grouping, and Google Flights result before expanding to a full scan. SerpApi query/schema compatibility and live price accuracy have not yet been verified from this machine.

## Investigating missing cheaper fares

For a single-city search, Refresh prices sets SerpApi no_cache=true and bypasses our own cache. It spends a new provider request and does not guarantee complete Google Flights coverage. Checked time uses the provider's created_at when available; fetchedAt records when our server read the response.

Download search report exports only the normalized results, requested airports/date/cabin, sanitized request parameters (never the api_key), provider search ID, timestamps, and per-offer eligibility audit. The audit records prices, segment airlines/airports/classes, and reasons for exclusion, allowing a reported cheaper itinerary to be located or confirmed absent from the provider response. Raw provider responses and secret values are never exported. Report downloads make no additional provider requests.

## Reverse routes

The swap button exchanges the US and Asian sides while preserving the exact selected city/region, date, cabin, and trip type. In Live mode it clears the previous displayed route and asks the user to Explore fares; swapping alone never spends provider credits.

For Asia → BOS, NYC, or another listed US city, the client expands the same 12 Asian airports (or selected region subset) into separate source-airport queries, two concurrently. NYC is a grouped arrival query over JFK, EWR, and LGA; actual arrival airports are validated and shown on each itinerary and external link. Regional reverse results compare the lowest eligible returned fare per Asian origin. A specific Asian origin shows its individual returned flight options; View flight options switches the origin selector without additional API requests. Sample mode also supports reversed round-trip and multi-city itineraries. The provider coverage limitations remain unchanged.

## Visual design

The current interface follows concept C: navy and sky-blue styling, a short generated Singapore panorama, compact fare rows, small CSS city illustrations, and direct labels. The banner at public/assets/singapore-banner.png is generated decorative imagery, not a sourced documentary photograph. The original generated image is preserved separately under /workspace/generated_images. Pricing coverage notes remain available in an expandable summary. This visual revision changes no provider query logic. The offline packaging script embeds the banner as a data URL.

The approved faint world-map background is public-domain Natural Earth coastline geometry, obtained from world-atlas 2.0.2 (`land-110m.json`) and rendered as `public/assets/world-outline.svg`. It represents the whole world, not search coverage. A CSS mask clears the central content, and the decoration is hidden on narrow screens. The offline demo embeds the SVG. The Singapore banner overlay label has been removed; image provenance remains documented here and in the footer. City photographs have not yet replaced the CSS city icons.

# Flags admin

Minimal Astro admin UI for managing binary feature flags and the applications they belong to.

## Run it

```sh
npm install
npm run dev
```

The preview uses local sample data so every interaction can be tried without an API. To connect the UI to the external service, copy `.env.example` to `.env` and set `PUBLIC_FLAGS_API_BASE_URL`.

## External API contract

The browser client in `src/lib/flags-api.ts` expects these JSON endpoints:

- `GET /feature-flags`
- `POST /feature-flags`
- `PUT /feature-flags/:id`
- `DELETE /feature-flags/:id`
- `GET /applications`
- `POST /applications`
- `PUT /applications/:id`
- `DELETE /applications/:id`

Flags only have a binary `enabled` value. No rollout, targeting, segmentation, or environment fields are included.

# Video infrastructure

`VIDEO-001` moves new video delivery to Bunny Stream while leaving Cloudinary
as the image provider and preserving legacy external video links.

## Runtime flow

1. An administrator creates a private video record in `/videos`.
2. The API creates the Bunny video and returns a short-lived signed TUS upload
   authorization. Provider credentials never reach the browser.
3. The browser uploads directly to Bunny with resumable chunks and displays
   percentage progress.
4. A signed webhook or the admin **Check processing** action advances the local
   record to `ready` or `failed`.
5. Only a `ready` video can be published. A published public video can be linked
   to a Videos or Press content record with `video_asset_id`.
6. Public pages render a poster first and create the adaptive player iframe only
   after the visitor presses Play.

Deletion first removes the provider asset. The local record is tombstoned only
after provider deletion succeeds, which prevents a failed provider request from
leaving an untracked billable asset.

## Required API environment

```dotenv
VIDEO_PROVIDER=bunny
BUNNY_STREAM_LIBRARY_ID=
BUNNY_STREAM_API_KEY=
BUNNY_STREAM_WEBHOOK_SECRET=
BUNNY_STREAM_CDN_HOSTNAME=
VIDEO_MAX_BYTES=2147483648
VIDEO_UPLOAD_AUTH_TTL=1h
```

`BUNNY_STREAM_WEBHOOK_SECRET` is the Bunny Stream library read-only API key used
to verify webhook signatures. Do not put either Bunny key in web or admin
environment variables.

Production webhook URL:

```text
https://joe-api-dyp5.onrender.com/api/webhooks/videos/bunny
```

The webhook must send the `v1`, `hmac-sha256`, and signature headers described
by the API contract. Invalid or replayed callbacks cannot mutate a record twice.

## Deployment and migration

Run the normal API migration command before enabling `VIDEO_PROVIDER=bunny`.
Migration `202608100100_vid001_video_infrastructure` creates the video asset and
webhook-event collections and adds optional `video_asset_id` linkage to video
and press content. Existing `external_url` and `embed_url` records remain valid;
there is no big-bang migration or Cloudinary video deletion.

If Bunny must be disabled, set `VIDEO_PROVIDER=disabled`. Existing public legacy
links continue to render, while new Bunny uploads and stream lookups become
unavailable.

## Release verification

- Run Go unit, HTTP, migration, and full API tests.
- Lint and regenerate the OpenAPI contract, then verify no generated drift.
- Run admin and web typecheck, lint, test, and production builds.
- Confirm a real Bunny create/delete smoke leaves no orphan asset.
- Before production sign-off, upload a representative large mobile video over a
  throttled or real mobile connection, interrupt/resume it, wait for processing,
  publish it, play it on Videos and Press, then unpublish and delete it.

The last check is an operator release gate because local automation cannot prove
real mobile network recovery or Bunny dashboard webhook delivery.

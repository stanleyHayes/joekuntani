# Media domain

The media slice owns signed provider uploads, completion verification, metadata,
usage references, and deletion policy. It deliberately does not accept file
bytes through the API.

## Security boundaries

- Construct `Policy` from environment-specific configuration. Folder names must
  include the environment prefix (for example, `staging/content`) and only
  configured MIME types, dimensions, byte sizes, transformations, and HTTPS
  delivery hosts are accepted.
- `Cloudinary` keeps the API secret server-side. Signed-upload
  responses contain only the public API key, canonical parameters, timestamp,
  and SHA-256 signature. Parameters are sorted according to Cloudinary's manual
  signing protocol.
- Completion notifications use Cloudinary's `X-Cld-Signature` and
  `X-Cld-Timestamp` protocol: the server computes the documented plain SHA-1 or
  SHA-256 digest of the exact raw request body, decimal timestamp, and API
  secret, then compares decoded bytes in constant time within a bounded clock
  skew. The repository hashes the timestamp/signature delivery identity and
  atomically claims it with asset completion, so replay cannot commit twice.
- Completion is a compare-and-set from `uploading`. A later delivery is
  idempotent only when an already-ready asset has an identical provider payload;
  `deleting` and `deleted` assets can never be returned to `ready`.
- API responses are explicit safe DTOs. They omit internal Mongo IDs, uploader
  IDs, callback hashes, audit data, and provider secrets.
- Content-edit permission is required by the service for every staff operation.
  Route composition must additionally apply authenticated-session and CSRF
  middleware. Callback routes are provider-authenticated rather than
  session-authenticated.
- Metadata mutations and soft deletion commit with their audit event in a Mongo
  transaction. Referenced assets cannot be deleted. Provider deletion happens
  first; a provider failure leaves the database record intact.

## Provider outage behavior

An upload request stores and audits its draft before requesting a provider
signature. If Cloudinary is unavailable, callers receive a retryable response
with the safe draft record and can retry without losing metadata. A failed
provider deletion never marks the asset deleted.

## Composition checklist

The shared API composition owner must provide the Mongo repository, Cloudinary
configuration, environment-specific policy, authenticated `ActorResolver`, and
CSRF protection. Mount the provider callback separately so it does not require a
staff session. Production readiness must fail when secrets, allowed folders, or
delivery hosts are absent; do not log their values.

// Next 16.3 references the web-platform constructor aliases globally, while
// @types/node 24 exposes URLPattern and URLPatternInit but leaves these two
// aliases module-scoped. Keep the bridge local to the admin app until the
// upstream declarations converge.
type URLPatternInput = string | URLPatternInit;

interface URLPatternOptions {
  ignoreCase?: boolean;
}

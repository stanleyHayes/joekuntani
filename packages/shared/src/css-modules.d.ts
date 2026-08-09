/**
 * CSS Modules for the shared package.
 *
 * The apps get this declaration from `next-env.d.ts`, which Next writes into
 * each app and which this package has no equivalent of. Without it every
 * `styles from "./x.module.css"` import in here is an unresolved module, so
 * `tsc --noEmit` failed on the whole package and the failure was easy to read
 * as "shared has no typecheck" rather than "shared cannot see its own styles".
 */
declare module "*.module.css" {
  const classes: Readonly<Record<string, string>>;
  export default classes;
}

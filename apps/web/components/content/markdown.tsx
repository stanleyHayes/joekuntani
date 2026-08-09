import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "./markdown.module.css";

/**
 * Renders a CMS body as Markdown.
 *
 * Bodies were dropped straight into a `<div>` with `white-space: pre-wrap`, so
 * an editor writing `**bold**` or `## Heading` published the literal asterisks
 * and hashes. This parses them.
 *
 * Raw HTML is deliberately NOT enabled. `react-markdown` ignores embedded HTML
 * unless `rehype-raw` is added, which is the property that makes this safe to
 * point at stored content without a sanitiser: a body containing `<script>` is
 * rendered as text, not executed. Do not add `rehype-raw` without also adding
 * sanitisation.
 *
 * The same component backs the admin preview, so what an editor sees before
 * publishing is produced by the code that will publish it — not a lookalike.
 */
export function Markdown({
  children,
  className,
}: {
  /** Optional because a draft may have no body yet; nothing renders then. */
  children?: string | null;
  className?: string;
}) {
  if (!children?.trim()) return null;
  return (
    <div className={className ? `${styles.prose} ${className}` : styles.prose}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Body copy starts at h2: the page already owns its h1, and a body
          // that introduced a second one would break the document outline.
          h1: ({ children: text }) => <h2>{text}</h2>,
          a: ({ href, children: text }) => (
            <a
              href={href}
              // Bodies can link anywhere, so external targets get the usual
              // protection against reverse tabnabbing.
              rel="noopener noreferrer"
              target={href?.startsWith("http") ? "_blank" : undefined}
            >
              {text}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

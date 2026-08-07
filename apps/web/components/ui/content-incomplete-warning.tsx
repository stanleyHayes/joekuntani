import Link from "next/link";

type ContentIncompleteWarningProps = {
  missingCount?: number;
};

export function ContentIncompleteWarning({
  missingCount,
}: ContentIncompleteWarningProps) {
  const countLabel =
    typeof missingCount === "number" ? ` ${missingCount} items remain.` : "";

  return (
    <section
      className="content-warning"
      aria-labelledby="content-warning-title"
      role="status"
    >
      <div>
        <strong id="content-warning-title">Content incomplete</strong>
        <p>
          Production publishing is blocked until required content and approvals
          are recorded.{countLabel}
        </p>
      </div>
      <Link href="/admin/content">Review content status</Link>
    </section>
  );
}

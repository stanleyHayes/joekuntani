type ContentPlaceholderProps = {
  className?: string;
  detail: string;
  label: string;
};

export function ContentPlaceholder({
  className = "",
  detail,
  label,
}: ContentPlaceholderProps) {
  return (
    <div
      className={`content-placeholder ${className}`.trim()}
      role="img"
      aria-label={`${label}. Placeholder - content awaiting approval.`}
    >
      <span className="content-placeholder__arc" aria-hidden="true" />
      <span className="content-placeholder__label">{label}</span>
      <span>{detail}</span>
      <strong>Placeholder - content awaiting approval</strong>
    </div>
  );
}

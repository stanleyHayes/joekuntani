import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type ButtonLinkProps = ComponentProps<typeof Link> & {
  children: ReactNode;
  variant?: "primary" | "secondary";
};

export function ButtonLink({
  children,
  className = "",
  variant = "primary",
  ...props
}: ButtonLinkProps) {
  return (
    <Link
      className={`button-link button-link--${variant} ${className}`.trim()}
      {...props}
    >
      {children}
    </Link>
  );
}

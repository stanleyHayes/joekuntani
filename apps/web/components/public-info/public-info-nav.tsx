import Link from "next/link";
import styles from "./public-info.module.css";

const routes = [
  { href: "/media-kit", label: "Media kit", index: "01" },
  { href: "/contact", label: "Contact", index: "02" },
  { href: "/privacy", label: "Privacy", index: "03" },
  { href: "/terms", label: "Terms", index: "04" },
] as const;

export function PublicInfoNav({ currentPath }: { currentPath: string }) {
  return (
    <nav className={styles.infoNav} aria-label="Information pages">
      <span className={styles.infoNavLabel}>Backstage index</span>
      <ul>
        {routes.map((route) => (
          <li key={route.href}>
            <Link
              href={route.href}
              aria-current={currentPath === route.href ? "page" : undefined}
            >
              <span>{route.index}</span>
              {route.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

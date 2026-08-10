"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CaretDown,
  IdentificationCard,
  LockKey,
  MapTrifold,
  SignOut,
  SlidersHorizontal,
  UsersThree,
} from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { ROLE_LABELS } from "../lib/admin-nav";
import styles from "./admin-user-menu.module.css";

export type StaffSession = {
  id: string;
  name: string;
  email?: string;
  role: string;
  mfa_verified?: boolean;
  permissions?: string[];
};

type AdminUserMenuProps = {
  onReplayTour?: () => void;
};

function csrfCookie() {
  const prefix = "jk_admin_csrf=";
  return (
    document.cookie
      .split(";")
      .map((value) => value.trim())
      .find((value) => value.startsWith(prefix))
      ?.slice(prefix.length) ?? ""
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function AdminUserMenu({ onReplayTour }: AdminUserMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [staff, setStaff] = useState<StaffSession | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    let current = true;
    void fetch("/api/admin/auth/me", {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as StaffSession;
        if (current) setStaff(body);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function logout() {
    setOpen(false);
    await fetch("/api/admin/auth/logout", {
      method: "POST",
      credentials: "include",
      headers: { "X-CSRF-Token": csrfCookie() },
    }).catch(() => undefined);
    router.replace("/login");
    router.refresh();
  }

  const label = staff?.name ?? "Account";
  const role = ROLE_LABELS[staff?.role ?? ""] ?? staff?.role ?? "Staff";

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        data-tour="user-menu"
        onClick={() => setOpen((value) => !value)}
      >
        <span className={styles.avatar} aria-hidden="true">
          {staff ? initials(staff.name) || "JK" : "··"}
        </span>
        <span className={styles.meta}>
          <span className={styles.name}>{label}</span>
          <span className={styles.role}>{role}</span>
        </span>
        <CaretDown
          className={styles.chevron}
          data-open={open ? "true" : "false"}
          size={15}
          weight="bold"
          aria-hidden="true"
        />
      </button>
      {open ? (
        <div className={styles.menu} role="menu" id={menuId}>
          <div className={styles.identity}>
            <p className={styles.identityName}>{label}</p>
            {staff?.email ? (
              <p className={styles.identityEmail}>{staff.email}</p>
            ) : null}
            <p className={styles.identityRole}>{role}</p>
          </div>
          <div className={styles.items}>
            <MenuLink
              href="/account"
              icon={<IdentificationCard size={20} weight="duotone" />}
              title="My profile"
              sub="Name and account details"
              onClick={() => setOpen(false)}
            />
            <MenuLink
              href="/account/security"
              icon={<LockKey size={20} weight="duotone" />}
              title="Security & MFA"
              sub="Password and authenticator"
              onClick={() => setOpen(false)}
            />
            <MenuLink
              href="/account/preferences"
              icon={<SlidersHorizontal size={20} weight="duotone" />}
              title="Preferences"
              sub="Alerts and workspace density"
              onClick={() => setOpen(false)}
            />
            <MenuLink
              href="/team"
              icon={<UsersThree size={20} weight="duotone" />}
              title="Users & roles"
              sub="Invite and manage staff"
              onClick={() => setOpen(false)}
            />
            <button
              type="button"
              role="menuitem"
              className={styles.item}
              onClick={() => {
                setOpen(false);
                onReplayTour?.();
              }}
            >
              <MenuItemContent
                icon={<MapTrifold size={20} weight="duotone" />}
                title="Replay tour"
                sub="Show me around again"
              />
            </button>
          </div>
          <div className={styles.footer}>
            <button
              type="button"
              role="menuitem"
              aria-label="Sign out"
              className={styles.logout}
              onClick={() => void logout()}
            >
              <span className={styles.logoutIcon} aria-hidden="true">
                <SignOut size={19} weight="bold" />
              </span>
              <span className={styles.logoutCopy}>
                <span className={styles.logoutTitle}>Sign out</span>
                <span className={styles.logoutSub}>End this admin session</span>
              </span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MenuLink({
  href,
  icon,
  title,
  sub,
  onClick,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <Link href={href} role="menuitem" className={styles.item} onClick={onClick}>
      <MenuItemContent icon={icon} title={title} sub={sub} />
    </Link>
  );
}

function MenuItemContent({
  icon,
  title,
  sub,
}: {
  icon: ReactNode;
  title: string;
  sub: string;
}) {
  return (
    <>
      <span className={styles.itemIcon} aria-hidden="true">
        {icon}
      </span>
      <span className={styles.itemCopy}>
        <span className={styles.itemTitle}>{title}</span>
        <span className={styles.itemSub}>{sub}</span>
      </span>
    </>
  );
}

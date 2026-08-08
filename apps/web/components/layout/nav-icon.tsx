import {
  CalendarDotsIcon,
  FilmSlateIcon,
  GuitarIcon,
  HouseIcon,
  MicrophoneStageIcon,
  NewspaperClippingIcon,
  SparkleIcon,
  TShirtIcon,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";
import type { NavIcon as NavIconName } from "./nav-defaults";
import styles from "./public-header.module.css";

/**
 * Maps a nav item's icon name to a real icon.
 *
 * The `/dist/ssr` entry point is deliberate: the header renders on the server,
 * and the default Phosphor export is a client component.
 */
const ICONS: Record<NavIconName, Icon> = {
  home: HouseIcon,
  about: GuitarIcon,
  work: MicrophoneStageIcon,
  services: SparkleIcon,
  videos: FilmSlateIcon,
  press: NewspaperClippingIcon,
  events: CalendarDotsIcon,
  shop: TShirtIcon,
};

export function NavIcon({ name }: { name?: NavIconName }) {
  if (!name) return null;
  const Glyph = ICONS[name];
  if (!Glyph) return null;
  return (
    <span className={styles.navMenuIcon} aria-hidden="true">
      <Glyph size={18} weight="duotone" />
    </span>
  );
}

/**
 * The faint mark behind a dropdown panel.
 *
 * Purely decorative and inert to assistive tech — it is texture that stops the
 * panel reading as a plain white box, not information.
 */
export function NavWatermark({ name }: { name?: NavIconName }) {
  if (!name) return null;
  const Glyph = ICONS[name];
  if (!Glyph) return null;
  return (
    <span className={styles.navMenuWatermark} aria-hidden="true">
      <Glyph size={120} weight="duotone" />
    </span>
  );
}

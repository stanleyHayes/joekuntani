import { BookingForm } from "../../components/enquiries/booking-form";
import { getPublicSettings } from "../../lib/settings";
import { PublicShell } from "../../components/layout/public-shell";
import { getPublicServices } from "../../components/services/data";
import { DemoBanner } from "../../components/ui/demo-banner";
import { demoContentEnabled, demoServices } from "../../lib/demo/content";

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string }>;
}) {
  const shellSettings = await getPublicSettings();
  const [{ service }, published] = await Promise.all([
    searchParams,
    getPublicServices(),
  ]);
  const demo = demoContentEnabled();
  const services = published.length ? published : demo ? demoServices : [];
  const usingDemo = demo && !published.length;
  return (
    <PublicShell
      settings={shellSettings}
      currentPath="/book"
      footerCta={{
        href: "/services",
        label: "Review services",
        title: "Need a different route?",
        description:
          "Review approved service information before completing an enquiry.",
      }}
    >
      {usingDemo ? <DemoBanner /> : null}
      <main id="main-content" className="shell-container">
        <BookingForm initialSlug={service ?? ""} services={services} />
      </main>
    </PublicShell>
  );
}

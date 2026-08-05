import { BookingForm } from "../../components/enquiries/booking-form";
import { getPublicServices } from "../../components/services/data";

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string }>;
}) {
  const [{ service }, services] = await Promise.all([
    searchParams,
    getPublicServices(),
  ]);
  return (
    <main>
      <BookingForm initialSlug={service ?? ""} services={services} />
    </main>
  );
}

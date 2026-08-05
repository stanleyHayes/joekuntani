export type TicketAvailability =
  | "scheduled"
  | "on_sale"
  | "paused"
  | "sold_out"
  | "sale_ended";

export type PublicTicketType = {
  id: string;
  name: string;
  description: string;
  price: string;
  currency: string;
  capacity: number;
  sold: number;
  reserved: number;
  min_per_order: number;
  max_per_order: number;
  sales_start: string;
  sales_end: string;
  availability: TicketAvailability;
  checkout_href?: string;
};

export type PublicEvent = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  description: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  banner_asset_id: string;
  venue: {
    name: string;
    address: string;
    city: string;
    country_code: string;
    map_url?: string;
    accessibility?: string;
  };
  policies: {
    refunds: string;
    entry: string;
    age_limit: number;
    age_guidance?: string;
    accessibility?: string;
  };
  banner: { featured: boolean; starts_at?: string; ends_at?: string };
  tickets: PublicTicketType[];
  availability: TicketAvailability;
};

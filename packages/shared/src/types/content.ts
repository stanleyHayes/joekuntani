export type ContentKind =
  | "page"
  | "portfolio"
  | "video"
  | "press"
  | "testimonial";

export type ContentStatus = "draft" | "scheduled" | "published" | "unpublished";

export type SectionType =
  | "prose"
  | "prose_image"
  | "quote"
  | "stats"
  | "gallery";

export interface ContentSection {
  type: SectionType;
  heading?: string;
  body?: string;
  tags?: string[];
  asset_ids: string[];
  items: { label: string; value: string }[];
  flip?: boolean;
}

export interface ContentItem {
  id: string;
  revision: number;
  kind: ContentKind;
  slug?: string;
  title: string;
  summary?: string;
  body?: string;
  category?: string;
  tags: string[];
  featured: boolean;
  gallery_asset_ids: string[];
  results: { label: string; value: string }[];
  sections?: ContentSection[];
  external_url?: string;
  embed_url?: string;
  video_asset_id?: string;
  outlet?: string;
  person_name?: string;
  person_title?: string;
  organization?: string;
  seo: {
    title: string;
    description: string;
    canonical_url: string;
    social_image_asset_id: string;
  };
  status: ContentStatus;
  approved: boolean;
  publish_at?: string;
  unpublish_at?: string;
  published_at?: string;
  created_at: string;
  updated_at: string;
}

export type ContentDraft = Omit<
  ContentItem,
  | "id"
  | "revision"
  | "status"
  | "approved"
  | "publish_at"
  | "unpublish_at"
  | "published_at"
  | "created_at"
  | "updated_at"
>;

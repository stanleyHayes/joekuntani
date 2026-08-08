export type ServiceQuestion = {
  key: string;
  label: string;
  help_text?: string;
  placeholder?: string;
  type:
    | "text"
    | "textarea"
    | "select"
    | "multi_select"
    | "date"
    | "number"
    | "checkbox";
  required: boolean;
  options?: string[];
};

export type PublicService = {
  id: string;
  name: string;
  slug: string;
  summary: string;
  description: string;
  category: string;
  active: boolean;
  state: "active" | "inactive" | "retired";
  version: number;
  retired_at?: string;
  sort_order: number;
  form_schema: { version: 1; questions: ServiceQuestion[] };
  cta: { label: string; href: "/book" };
  created_at: string;
  updated_at: string;
};

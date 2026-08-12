"use client";

import { Country } from "country-state-city";
import {
  Dispatch,
  FormEvent,
  SetStateAction,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { PublicService, ServiceQuestion } from "../services/types";
import { ButtonLink } from "../ui/button-link";
import { DateField } from "@joe-kuntani/shared/ui/date-field";
import { EmptyState } from "@joe-kuntani/shared/ui/empty-state";
import { Select } from "@joe-kuntani/shared/ui/select";
import styles from "./booking-form.module.css";

const DRAFT_KEY = "jk-enquiry-draft-v1";
const COUNTRY_OPTIONS = Country.getAllCountries()
  .map((country) => ({
    value: country.isoCode,
    label: `${country.name} — ${country.isoCode}`,
  }))
  .sort((a, b) => a.label.localeCompare(b.label));
type Draft = {
  idempotencyKey: string;
  serviceId: string;
  name: string;
  email: string;
  phone: string;
  organization: string;
  role: string;
  country: string;
  enquiryType: "event" | "brand";
  source: string;
  answers: Record<string, unknown>;
  projectBrief: string;
  budget: string;
  timeline: string;
  currency: string;
  decisionDeadline: string;
  additionalNotes: string;
  marketingConsent: boolean;
  details: Record<string, string | number | string[]>;
  consent: boolean;
};
const blank: Draft = {
  idempotencyKey: "",
  serviceId: "",
  name: "",
  email: "",
  phone: "",
  organization: "",
  role: "",
  country: "GH",
  enquiryType: "event",
  source: "",
  answers: {},
  projectBrief: "",
  budget: "",
  timeline: "",
  currency: "GHS",
  decisionDeadline: "",
  additionalNotes: "",
  marketingConsent: false,
  details: {},
  consent: false,
};

export function BookingForm({
  services,
  initialSlug,
}: {
  services: PublicService[];
  initialSlug: string;
}) {
  const initial = services.find((item) => item.slug === initialSlug)?.id ?? "";
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<Draft>(() => loadDraft(initial));
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState("");
  const [pending, setPending] = useState(false);
  const [challenge, setChallenge] = useState<{
    enabled: boolean;
    provider: string;
    site_key: string;
  } | null>(null);
  const [captchaToken, setCaptchaToken] = useState("");
  const [challengeUnavailable, setChallengeUnavailable] = useState(false);
  useEffect(() => {
    fetch("/api/public/enquiries/challenge", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok)
          throw new Error("challenge configuration unavailable");
        setChallenge(await response.json());
      })
      .catch(() => setChallengeUnavailable(true));
  }, []);
  useEffect(() => {
    const storage = browserStorage();
    if (!receipt && storage)
      storage.setItem(DRAFT_KEY, JSON.stringify({ version: 1, draft }));
  }, [draft, receipt]);
  const service = useMemo(
    () => services.find((item) => item.id === draft.serviceId),
    [draft.serviceId, services],
  );
  function next() {
    if (!validStep(step, draft, service)) {
      setError("Complete the required fields before continuing.");
      return;
    }
    setError("");
    setStep((current) => Math.min(5, current + 1));
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!validStep(5, draft, service) || !service)
      return setError("Review the form and accept the privacy consent.");
    if (challengeUnavailable || !challenge)
      return setError(
        "Anti-spam verification is unavailable. Please try again before submitting.",
      );
    if (challenge?.enabled && !captchaToken)
      return setError("Complete the anti-spam challenge before submitting.");
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/public/enquiries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": draft.idempotencyKey,
        },
        body: JSON.stringify({
          service_id: service.id,
          enquiry_type: draft.enquiryType,
          source: draft.source,
          contact: {
            name: draft.name,
            email: draft.email,
            phone: draft.phone,
            organization: draft.organization,
            role: draft.role,
            country: draft.country,
          },
          details: normalizedDetails(draft),
          answers: draft.answers,
          project_brief: draft.projectBrief,
          budget: draft.budget,
          timeline: draft.timeline,
          currency: draft.currency,
          decision_deadline: draft.decisionDeadline,
          additional_notes: draft.additionalNotes,
          marketing_consent: draft.marketingConsent,
          consent: draft.consent,
          consent_text:
            "I consent to the processing of this enquiry under the privacy notice.",
          consent_version: "2026-08-05",
          website: "",
          captcha_token: captchaToken,
        }),
      });
      if (!response.ok) throw new Error();
      const body = (await response.json()) as { reference: string };
      browserStorage()?.removeItem(DRAFT_KEY);
      setReceipt(body.reference);
    } catch {
      setError(
        "We could not submit your enquiry. Your draft is safe; please try again.",
      );
    } finally {
      setPending(false);
    }
  }
  if (receipt)
    return (
      <section className={styles.confirmation} aria-live="polite">
        <p className={styles.eyebrow}>Enquiry received</p>
        <h1>Thank you. We’ll be in touch.</h1>
        <p>
          Your reference is <strong>{receipt}</strong>.
        </p>
        <p>Submission is not confirmation of availability or booking.</p>
      </section>
    );
  if (services.length === 0)
    return (
      <section className={styles.shell}>
        <h1>Start an enquiry</h1>
        <EmptyState
          announce={false}
          tone="inbox"
          title="Nothing is open for enquiry right now"
          description="No approved services are available yet. Please return soon."
          action={
            <ButtonLink href="/contact" variant="primary">
              Send a general enquiry
            </ButtonLink>
          }
        />
      </section>
    );
  return (
    <section className={styles.shell}>
      <aside className={styles.rail}>
        <p className={styles.eyebrow}>Booking dossier</p>
        <h1>Tell us what you’re building.</h1>
        <ol className={styles.steps} aria-label="Enquiry progress">
          {["Intent", "Contact", "Details", "Commercial", "Review"].map(
            (label, index) => (
              <li
                aria-current={step === index + 1 ? "step" : undefined}
                data-complete={index + 1 < step ? "true" : "false"}
                key={label}
              >
                {label}
              </li>
            ),
          )}
        </ol>
        <p className={styles.railNote}>
          Your draft is saved on this device as you go.
        </p>
      </aside>
      <div className={styles.formPanel}>
        <header className={styles.formHeader}>
          <span>0{step}</span>
          <div>
            <p>Step {step} of 5</p>
            <strong>
              {
                [
                  "Choose the brief",
                  "Who should we contact?",
                  "Shape the engagement",
                  "Scope and timing",
                  "Final check",
                ][step - 1]
              }
            </strong>
          </div>
        </header>
        <form onSubmit={submit} noValidate>
          {step === 1 && (
            <fieldset>
              <legend>Your intent</legend>
              <label>
                Enquiry type
                <Select
                  aria-label="Enquiry type"
                  value={draft.enquiryType}
                  onChange={(enquiryType) =>
                    setDraft((v) => ({
                      ...v,
                      enquiryType: enquiryType as "event" | "brand",
                      details: {},
                    }))
                  }
                  options={[
                    { value: "event", label: "Event booking" },
                    { value: "brand", label: "Brand partnership" },
                  ]}
                />
              </label>
              {services.map((item) => (
                <label className={styles.choice} key={item.id}>
                  <input
                    checked={draft.serviceId === item.id}
                    name="service"
                    onChange={() =>
                      setDraft((current) => ({
                        ...current,
                        serviceId: item.id,
                        answers: {},
                      }))
                    }
                    type="radio"
                  />
                  {item.name}
                  <small>{item.summary}</small>
                </label>
              ))}
              <label>
                How did you hear about Joe?
                <Select
                  aria-label="How did you hear about Joe?"
                  required
                  placeholder="Choose one"
                  value={draft.source}
                  onChange={(source) => setDraft((v) => ({ ...v, source }))}
                  options={[
                    { value: "search", label: "Search" },
                    { value: "social", label: "Social media" },
                    { value: "referral", label: "Referral" },
                    { value: "press", label: "Press" },
                    { value: "other", label: "Other" },
                  ]}
                />
              </label>
            </fieldset>
          )}
          {step === 2 && (
            <fieldset>
              <legend>Your contact details</legend>
              <Field
                label="Name"
                required
                value={draft.name}
                onChange={(name) => setDraft((v) => ({ ...v, name }))}
              />
              <Field
                label="Email"
                required
                type="email"
                value={draft.email}
                onChange={(email) => setDraft((v) => ({ ...v, email }))}
              />
              <Field
                label="Phone"
                value={draft.phone}
                onChange={(phone) => setDraft((v) => ({ ...v, phone }))}
              />
              <Field
                label="Organization"
                value={draft.organization}
                onChange={(organization) =>
                  setDraft((v) => ({ ...v, organization }))
                }
              />
              <Field
                label="Role"
                required
                value={draft.role}
                onChange={(role) => setDraft((v) => ({ ...v, role }))}
              />
              <CountryField
                label="Country"
                required
                value={draft.country}
                onChange={(country) => setDraft((v) => ({ ...v, country }))}
              />
            </fieldset>
          )}
          {step === 3 && (
            <fieldset>
              <legend>
                {draft.enquiryType === "event"
                  ? "Event details"
                  : "Brand details"}
              </legend>
              {draft.enquiryType === "event" ? (
                <>
                  <DetailField
                    draft={draft}
                    setDraft={setDraft}
                    name="event_type"
                    label="Event type"
                  />
                  <DetailField
                    draft={draft}
                    setDraft={setDraft}
                    name="event_at"
                    label="Event date and time"
                    type="datetime-local"
                  />
                  <DetailField
                    draft={draft}
                    setDraft={setDraft}
                    name="venue"
                    label="Venue"
                  />
                  <DetailField
                    draft={draft}
                    setDraft={setDraft}
                    name="city"
                    label="City"
                  />
                  <DetailField
                    draft={draft}
                    setDraft={setDraft}
                    name="country"
                    label="Event country"
                  />
                  <DetailField
                    draft={draft}
                    setDraft={setDraft}
                    name="audience_size"
                    label="Expected audience size"
                    type="number"
                  />
                  <DetailField
                    draft={draft}
                    setDraft={setDraft}
                    name="performance_duration"
                    label="Performance duration"
                  />
                  <DetailField
                    draft={draft}
                    setDraft={setDraft}
                    name="production_needs"
                    label="Production needs"
                  />
                </>
              ) : (
                <>
                  <DetailField
                    draft={draft}
                    setDraft={setDraft}
                    name="campaign_objective"
                    label="Campaign objective"
                  />
                  <DetailField
                    draft={draft}
                    setDraft={setDraft}
                    name="target_audience"
                    label="Target audience"
                  />
                  <DetailField
                    draft={draft}
                    setDraft={setDraft}
                    name="channels"
                    label="Channels (comma separated)"
                  />
                  <DetailField
                    draft={draft}
                    setDraft={setDraft}
                    name="requested_deliverables"
                    label="Requested deliverables"
                  />
                  <DetailField
                    draft={draft}
                    setDraft={setDraft}
                    name="usage_rights"
                    label="Usage rights"
                  />
                  <DetailField
                    draft={draft}
                    setDraft={setDraft}
                    name="exclusivity"
                    label="Exclusivity"
                  />
                  <DetailField
                    draft={draft}
                    setDraft={setDraft}
                    name="launch_dates"
                    label="Launch dates"
                  />
                </>
              )}
              {service?.form_schema.questions.map((question) => (
                <DynamicQuestion
                  key={question.key}
                  question={question}
                  value={draft.answers[question.key]}
                  onChange={(value) =>
                    setDraft((v) => ({
                      ...v,
                      answers: { ...v.answers, [question.key]: value },
                    }))
                  }
                />
              ))}
            </fieldset>
          )}
          {step === 4 && (
            <fieldset>
              <legend>Commercial details</legend>
              <Field
                label="Budget range"
                required
                value={draft.budget}
                onChange={(budget) => setDraft((v) => ({ ...v, budget }))}
              />
              <label>
                Currency
                <Select
                  aria-label="Currency"
                  value={draft.currency}
                  onChange={(currency) => setDraft((v) => ({ ...v, currency }))}
                  options={["GHS", "USD", "EUR", "GBP"].map((value) => ({
                    value,
                    label: value,
                  }))}
                />
              </label>
              <Field
                label="Decision deadline"
                required
                type="date"
                value={draft.decisionDeadline}
                onChange={(decisionDeadline) =>
                  setDraft((v) => ({ ...v, decisionDeadline }))
                }
              />
              <label>
                Additional notes
                <textarea
                  value={draft.additionalNotes}
                  onChange={(e) =>
                    setDraft((v) => ({
                      ...v,
                      additionalNotes: e.target.value,
                      projectBrief: e.target.value,
                    }))
                  }
                />
              </label>
            </fieldset>
          )}
          {step === 5 && (
            <fieldset>
              <legend>Review and consent</legend>
              <dl className={styles.summary}>
                <dt>Service</dt>
                <dd>{service?.name}</dd>
                <dt>Contact</dt>
                <dd>
                  {draft.name} · {draft.email}
                </dd>
                <dt>Project</dt>
                <dd>{draft.projectBrief}</dd>
              </dl>
              <label className={styles.consent}>
                <input
                  checked={draft.consent}
                  onChange={(e) =>
                    setDraft((v) => ({ ...v, consent: e.target.checked }))
                  }
                  type="checkbox"
                />
                I consent to the processing of this enquiry under the privacy
                notice.
              </label>
              <label className={styles.consent}>
                <input
                  checked={draft.marketingConsent}
                  onChange={(e) =>
                    setDraft((v) => ({
                      ...v,
                      marketingConsent: e.target.checked,
                    }))
                  }
                  type="checkbox"
                />
                I would like occasional marketing updates (optional).
              </label>
              {challenge?.enabled && (
                <CaptchaChallenge
                  provider={challenge.provider}
                  siteKey={challenge.site_key}
                  onToken={setCaptchaToken}
                />
              )}
              {challengeUnavailable && (
                <p role="alert">
                  Anti-spam verification is unavailable. Refresh or try again
                  shortly.
                </p>
              )}
            </fieldset>
          )}
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
          <div className={styles.actions}>
            {step > 1 && (
              <button onClick={() => setStep((v) => v - 1)} type="button">
                Back
              </button>
            )}
            {step < 5 ? (
              <button onClick={next} type="button">
                Continue
              </button>
            ) : (
              <button disabled={pending} type="submit">
                {pending ? "Submitting…" : "Submit enquiry"}
              </button>
            )}
          </div>
        </form>
      </div>
    </section>
  );
}

function loadDraft(initialServiceID: string): Draft {
  const fallback = {
    ...blank,
    idempotencyKey: crypto.randomUUID(),
    serviceId: initialServiceID,
  };
  if (typeof window === "undefined") return fallback;
  try {
    const storage = browserStorage();
    if (!storage) return fallback;
    const raw = storage.getItem(DRAFT_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as { version?: number; draft?: Draft };
    if (parsed.version !== 1 || !parsed.draft) return fallback;
    return {
      ...parsed.draft,
      idempotencyKey: parsed.draft.idempotencyKey || fallback.idempotencyKey,
      serviceId: initialServiceID || parsed.draft.serviceId,
    };
  } catch {
    browserStorage()?.removeItem(DRAFT_KEY);
    return fallback;
  }
}

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}
function validStep(step: number, draft: Draft, service?: PublicService) {
  if (step === 1) return Boolean(service) && Boolean(draft.source);
  if (step === 2)
    return (
      draft.name.trim().length >= 2 &&
      /^\S+@\S+\.\S+$/.test(draft.email) &&
      draft.role.trim().length >= 2 &&
      /^[A-Z]{2}$/.test(draft.country)
    );
  if (step === 3)
    return (
      validDetails(draft) &&
      (service?.form_schema.questions.every(
        (q) => !q.required || draft.answers[q.key] !== undefined,
      ) ??
        false)
    );
  if (step === 4)
    return Boolean(draft.budget && draft.currency && draft.decisionDeadline);
  return draft.consent;
}
function validDetails(draft: Draft) {
  const d = draft.details;
  const required =
    draft.enquiryType === "event"
      ? [
          "event_type",
          "event_at",
          "venue",
          "city",
          "country",
          "audience_size",
          "performance_duration",
        ]
      : [
          "campaign_objective",
          "target_audience",
          "channels",
          "requested_deliverables",
          "usage_rights",
          "exclusivity",
          "launch_dates",
        ];
  return required.every((key) => Boolean(d[key]));
}
function normalizedDetails(draft: Draft) {
  const details = { ...draft.details };
  if (draft.enquiryType === "event" && typeof details.event_at === "string") {
    const eventAt = new Date(details.event_at);
    if (!Number.isNaN(eventAt.valueOf()))
      details.event_at = eventAt.toISOString();
  }
  if (draft.enquiryType === "brand" && typeof details.channels === "string")
    details.channels = details.channels
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  return details;
}
function DetailField({
  draft,
  setDraft,
  name,
  label,
  type = "text",
}: {
  draft: Draft;
  setDraft: Dispatch<SetStateAction<Draft>>;
  name: string;
  label: string;
  type?: string;
}) {
  if (name === "country") {
    return (
      <CountryField
        label={label}
        required
        value={String(draft.details[name] ?? "")}
        onChange={(value) =>
          setDraft((current) => ({
            ...current,
            details: { ...current.details, [name]: value },
          }))
        }
      />
    );
  }
  return (
    <Field
      label={label}
      required
      value={String(draft.details[name] ?? "")}
      type={type}
      onChange={(value) =>
        setDraft((v) => ({
          ...v,
          details: {
            ...v.details,
            [name]: type === "number" ? Number(value) : value,
          },
        }))
      }
    />
  );
}

function CountryField({
  label,
  value,
  onChange,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label>
      {label}
      <Select
        aria-label={label}
        required={required}
        placeholder="Choose a country"
        value={value}
        onChange={onChange}
        options={COUNTRY_OPTIONS}
      />
    </label>
  );
}
function CaptchaChallenge({
  provider,
  siteKey,
  onToken,
}: {
  provider: string;
  siteKey: string;
  onToken: (token: string) => void;
}) {
  const target = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!["turnstile", "recaptcha"].includes(provider) || !siteKey) return;
    const id = `jk-${provider}-script`;
    const render = () => {
      const api =
        provider === "turnstile"
          ? (
              window as unknown as {
                turnstile?: {
                  render: (
                    node: HTMLElement,
                    options: Record<string, unknown>,
                  ) => void;
                };
              }
            ).turnstile
          : (
              window as unknown as {
                grecaptcha?: {
                  render: (
                    node: HTMLElement,
                    options: Record<string, unknown>,
                  ) => void;
                };
              }
            ).grecaptcha;
      if (api && target.current) {
        target.current.replaceChildren();
        api.render(target.current, {
          sitekey: siteKey,
          callback: onToken,
          "expired-callback": () => onToken(""),
          "error-callback": () => onToken(""),
        });
      }
    };
    let script = document.getElementById(id) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.id = id;
      script.async = true;
      script.defer = true;
      script.src =
        provider === "turnstile"
          ? "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          : "https://www.google.com/recaptcha/api.js?render=explicit";
      document.head.appendChild(script);
    }
    script.addEventListener("load", render);
    render();
    return () => script?.removeEventListener("load", render);
  }, [provider, siteKey, onToken]);
  return (
    <div>
      <p>Anti-spam verification</p>
      <div ref={target} />
    </div>
  );
}
function Field({
  label,
  value,
  onChange,
  required = false,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  type?: string;
}) {
  if (type === "date" || type === "datetime-local") {
    return (
      <label>
        {label}
        <DateField
          aria-label={label}
          required={required}
          mode={type === "date" ? "date" : "datetime"}
          value={value}
          onChange={onChange}
        />
      </label>
    );
  }
  return (
    <label>
      {label}
      <input
        required={required}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
export function DynamicQuestion({
  question,
  value,
  onChange,
}: {
  question: ServiceQuestion;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (question.type === "multi_select") {
    const selected = Array.isArray(value) ? (value as string[]) : [];
    return (
      <fieldset>
        <legend>{question.label}</legend>
        {question.options?.map((option) => (
          <label className={styles.consent} key={option}>
            <input
              checked={selected.includes(option)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...selected, option]
                    : selected.filter((item) => item !== option),
                )
              }
              type="checkbox"
            />
            {option}
          </label>
        ))}
      </fieldset>
    );
  }
  if (question.type === "select")
    return (
      <label>
        {question.label}
        <Select
          aria-label={question.label}
          required={question.required}
          placeholder="Choose one"
          value={String(value ?? "")}
          onChange={onChange}
          options={(question.options ?? []).map((option) => ({
            value: option,
            label: option,
          }))}
        />
      </label>
    );
  if (question.type === "checkbox")
    return (
      <label className={styles.consent}>
        <input
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          type="checkbox"
        />
        {question.label}
      </label>
    );
  if (question.type === "textarea")
    return (
      <label>
        {question.label}
        <textarea
          required={question.required}
          value={String(value ?? "")}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    );
  if (question.type === "date") {
    return (
      <label>
        {question.label}
        <DateField
          aria-label={question.label}
          required={question.required}
          mode="date"
          value={String(value ?? "")}
          onChange={onChange}
        />
      </label>
    );
  }
  return (
    <label>
      {question.label}
      <input
        required={question.required}
        type={question.type === "number" ? "number" : "text"}
        value={String(value ?? "")}
        onChange={(e) =>
          onChange(
            question.type === "number"
              ? Number(e.target.value)
              : e.target.value,
          )
        }
      />
    </label>
  );
}

import { matchAdminRoute } from "./admin-route-match";

/**
 * Per-page help for the admin workspace.
 *
 * The topbar description says what a page is called. This says what it is for
 * and how to work it, for an administrator who does not use the console daily
 * and should not have to guess which button is safe to press.
 *
 * `purpose` is one sentence and is always on screen. `steps` are the operating
 * instructions and sit behind a disclosure, because a permanent wall of help
 * above every workspace would push the actual work below the fold.
 */
export type AdminGuide = {
  purpose: string;
  steps: string[];
};

const ADMIN_GUIDES: Record<string, AdminGuide> = {
  "/": {
    purpose:
      "The staff console home — a directory of every area of the back office, grouped by the job it does.",
    steps: [
      "Pick a group that matches your task: Publish for the website, Live and tickets for shows, Pipeline for enquiries and bookings, Team and account for people, Governance for records.",
      "The same groups are in the sidebar on every page, so you never have to come back here to move around.",
      "If the console is new to you, open your avatar menu at the top right and choose the guided tour.",
    ],
  },
  "/account": {
    purpose:
      "Your own staff identity — the name and email other administrators see next to your actions.",
    steps: [
      "Check your name and email are right; they are stamped on every entry you create in the audit log.",
      "Your role is set by an administrator on the Users and roles page, not here.",
    ],
  },
  "/account/preferences": {
    purpose:
      "How this workspace behaves for you — which alerts you receive, how dense the layout is, and which timezone times are shown in.",
    steps: [
      "Choose the emails you want. These affect only your account, not anyone else's.",
      "Set your timezone so show times and enquiry timestamps read correctly for where you are.",
      "Switch to a compact layout if you want more rows on screen at once.",
    ],
  },
  "/account/security": {
    purpose:
      "Password and authenticator controls for your own sign-in, plus a way to end sessions on other devices.",
    steps: [
      "Change your password here; you will need your current one.",
      "Keep the authenticator app enrolled — sign-in requires the six digit code, so losing it locks you out.",
      "If you have signed in on a device you no longer have, sign out other sessions.",
    ],
  },
  "/analytics": {
    purpose:
      "The operations overview — published content, enquiries submitted, ticket purchases, and audience reach in one place.",
    steps: [
      "Set the date range first; every figure on the page follows it.",
      "Read this for direction, not accounting. Money that has to reconcile lives on Ticket analytics.",
    ],
  },
  "/audit": {
    purpose:
      "The permanent record of who did what in this console. Administrator only, and nothing here can be edited.",
    steps: [
      "Use the query builder to narrow by action, entity, outcome, or when it happened.",
      "Each row names the administrator, the record they touched, and whether the attempt succeeded.",
      "Use this to answer 'who changed this' before assuming something broke on its own.",
    ],
  },
  "/bookings": {
    purpose:
      "Joe's diary — every confirmed date, so you can see where he is playing and what is already committed.",
    steps: [
      "Set the range to the period you are checking.",
      "Add a booking with the date, the place, and the fee and requirements agreed.",
      "Watch for the schedule conflict warning; it flags dates that overlap something already in the diary.",
    ],
  },
  "/campaigns": {
    purpose:
      "Brand partnerships — what was promised to a partner, what it costs, and what it returned.",
    steps: [
      "Start a new campaign with the partner, the dates, and the money agreed.",
      "Add each deliverable you owe the partner so nothing is missed at reporting time.",
      "Record expenses as they happen, and enter reach and results once the campaign has run.",
      "Approved assets are the files cleared for the partner to use.",
    ],
  },
  "/checkin": {
    purpose:
      "Door operations on show night — scan tickets as guests arrive and see who is already inside.",
    steps: [
      "Open this on the device at the door before doors open.",
      "Scan a ticket; a valid one is marked checked in immediately.",
      "A ticket already marked checked in is a duplicate. Send the guest to a supervisor rather than scanning again.",
    ],
  },
  "/content": {
    purpose:
      "The content library behind the public website — pages, portfolio, videos, press and testimonials.",
    steps: [
      "Pick the type you are editing, then open a record or create one.",
      "Write the copy, then use the section blocks to lay the page out; each block can be moved up or down.",
      "Preview before you publish — the editor has a preview tab that renders exactly what visitors will see.",
      "Approve a new draft once. After it is published, every save updates the public page immediately and remains recorded in the audit log.",
    ],
  },
  "/crm": {
    purpose:
      "Everyone who wants to book Joe — enquiries from the public site, and the contacts and organizations behind them.",
    steps: [
      "New enquiries arrive in the pipeline automatically; work the oldest first.",
      "Set the stage and the owner so it is clear who is responding and where it has got to.",
      "Add internal notes and follow-up tasks on the lead so the next person has the history.",
      "Before creating a contact or organization, use find match — duplicates are far harder to merge later than to avoid.",
    ],
  },
  "/events": {
    purpose:
      "The event workspace — the show itself, where and when it happens, and the ticket types on sale for it.",
    steps: [
      "Fill in identity, venue, schedule and policies. A show cannot be published without them.",
      "Add at least one ticket type; an event with no tickets cannot go live.",
      "Set the banner if this show should be promoted on the home page, with the poster and the dates to run it.",
      "Publish when the details are final. Cancelling later is recorded and visible to ticket holders.",
    ],
  },
  "/exports": {
    purpose:
      "Role-filtered CSV downloads of operational data, for finance, reporting, or handing to an accountant.",
    steps: [
      "Choose the resource you need; you will only be offered what your role is allowed to read.",
      "Every download is written to the audit log with your name against it.",
    ],
  },
  "/media": {
    purpose:
      "The asset library — every image and document the public site can use.",
    steps: [
      "Upload with New asset, choosing the folder for the surface it belongs to.",
      "Always write alt text. It is what a blind visitor hears in place of the image.",
      "Usage shows where an asset is already in use — check it before deleting, or you will blank a live page.",
      "Needs attention means an upload did not finish; re-upload the file rather than leaving it.",
    ],
  },
  "/merch": {
    purpose:
      "The shop — products and their variants, the stock behind them, and the orders customers have placed.",
    steps: [
      "Create the product with its public copy and images, then add a variant for each size or option.",
      "Stock is held per variant, so a sold-out size stops selling on its own.",
      "Orders show the buyer and where it ships to; work them in the order they arrived.",
    ],
  },
  "/newsletter": {
    purpose:
      "People who asked to hear from Joe through the public site, with the consent record behind each signup.",
    steps: [
      "Every row carries where and when the person consented. That record is why you may email them.",
      "Unsubscribe anyone who asks, promptly. Do not add addresses by hand — a signup without consent should not be here.",
    ],
  },
  "/permissions": {
    purpose:
      "A read-only map of what each of the four staff roles is allowed to do. Nothing on this page can be changed.",
    steps: [
      "Read across a role to see what it can reach before you assign it to someone.",
      "The server enforces this list, so it is the real answer to 'why can they not see that'.",
      "To change what a person can do, change their role on the Users and roles page.",
    ],
  },
  "/privacy": {
    purpose:
      "Data retention and legal holds — what gets deleted on schedule, and what must be kept.",
    steps: [
      "The retention job removes eligible enquiries after the retention period you set.",
      "Place a legal hold, with a reason, on anything involved in a dispute. A hold stops deletion until it is lifted.",
      "Check active holds periodically; a hold nobody remembers is a hold nobody lifts.",
    ],
  },
  "/search": {
    purpose:
      "One search box across the operational records you are authorized to see.",
    steps: [
      "Search when you know a name, an email, or a reference but not which section holds it.",
      "Results are filtered to your role, so an empty result may mean no access rather than no record.",
    ],
  },
  "/services": {
    purpose:
      "What Joe offers publicly, and the enquiry form each offering points at.",
    steps: [
      "Write the public copy the way a client should read it — this appears on the site as written.",
      "Set visibility to control whether an offering is listed publicly.",
      "The enquiry form setting decides what someone is asked when they enquire about that service.",
    ],
  },
  "/settings": {
    purpose:
      "Site-wide settings — brand and SEO defaults, contact and social links, consent copy, and integration keys.",
    steps: [
      "Brand and SEO defaults are the fallback title, description and share image for pages that do not set their own.",
      "Contact and social links appear across the public site; a wrong one is wrong everywhere at once.",
      "Environment keys are live credentials. Changing one affects payments or email immediately.",
      "Read the 'before publishing' notes on this page — they list what must be right before the site goes out.",
    ],
  },
  "/team": {
    purpose:
      "Staff accounts — invite people, set their role, and disable accounts that should no longer have access.",
    steps: [
      "Send an invitation with the person's email and the role they should have. They set their own password from the link.",
      "The invitation link is single use and expires. If it lapses, invite the same address again to issue a fresh one.",
      "Roles are fixed to the four the server enforces; see the Permissions page for what each one can do.",
      "Disable an account the day someone leaves. Disabling keeps their history in the audit log; it does not erase it.",
    ],
  },
  "/ticket-analytics": {
    purpose:
      "The money and attendance behind ticketing — issued, refunded, fees, and what the payment provider actually reported.",
    steps: [
      "Pick the event you are reviewing.",
      "Compare recorded sales against what the provider settled. A gap is a reconciliation problem, not a display bug.",
      "Attendance shows issued against checked in, which is your real turnout for that show.",
    ],
  },
  "/tickets": {
    purpose:
      "Ticket orders and the operations on them — look up a buyer, refund an order, or void a ticket.",
    steps: [
      "Use refine to find the order, by buyer or by reference.",
      "Approving a refund returns money to the buyer. It is recorded against your name and is not reversible from here.",
      "Voiding a ticket invalidates it at the door. Use it for a ticket issued in error, not as a refund.",
    ],
  },
};

/**
 * The guide for a route, or undefined where none is written.
 *
 * Deliberately not defaulted to the overview guide the way titles are: a page
 * showing confident instructions for a different page is worse than a page
 * showing none.
 */
export function adminGuide(pathname: string): AdminGuide | undefined {
  const guide = matchAdminRoute(ADMIN_GUIDES, pathname);
  // matchAdminRoute falls back to the root; only return it on the real route.
  if (guide === ADMIN_GUIDES["/"] && pathname !== "/") return undefined;
  return guide;
}

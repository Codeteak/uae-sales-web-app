/** Product + company branding for Yaadro by Codeteak Technologies (UAE sales). */
export const BRAND = {
  productName: "Yaadro",
  productNameLower: "yaadro",
  tagline: "Sales CRM for UAE teams",
  description:
    "Shared sales pipeline for Yaadro’s UAE team — companies, contacts, follow-ups and next actions in one place.",
  companyName: "Codeteak Technologies",
  poweredBy: "Powered by Codeteak Technologies",
  region: "UAE",
  timezoneDefault: "Asia/Dubai",
  icon: "/brand/yaadro-icon.png",
  logo: "/brand/yaadro-logo.png",
  logoPrint: "/brand/yaadro-logo-print.png",
  // Trimmed square mark (source JPEG had large empty margins)
  companyMark: "/brand/codeteak-mark-trim.png",
} as const;

export function brandTitle(page?: string) {
  return page ? `${page} — ${BRAND.productName}` : `${BRAND.productName} — ${BRAND.tagline}`;
}

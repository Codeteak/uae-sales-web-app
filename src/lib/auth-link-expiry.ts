/** Default password-reset / confirm link lifetime (minutes). Match Supabase Email OTP expiry. */
export const DEFAULT_AUTH_LINK_EXPIRY_MINUTES = 60;

export function formatAuthLinkExpiry(minutes: number = DEFAULT_AUTH_LINK_EXPIRY_MINUTES): {
  short: string;
  detail: string;
  pageHint: string;
} {
  const m = Number.isFinite(minutes) && minutes >= 5 ? Math.floor(minutes) : DEFAULT_AUTH_LINK_EXPIRY_MINUTES;
  if (m < 60) {
    return {
      short: `${m} minutes`,
      detail: `This link expires in ${m} minutes`,
      pageHint: `Reset links expire after ${m} minutes.`,
    };
  }
  if (m === 60) {
    return {
      short: "1 hour",
      detail: "This link expires in 1 hour",
      pageHint: "Reset links expire after 1 hour.",
    };
  }
  const hours = Math.round((m / 60) * 10) / 10;
  return {
    short: `${hours} hours`,
    detail: `This link expires in ${hours} hours`,
    pageHint: `Reset links expire after ${hours} hours.`,
  };
}

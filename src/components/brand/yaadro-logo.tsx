import { BRAND } from "@/lib/brand";

type Size = "sm" | "md" | "lg";

type Props = {
  variant?: "full" | "icon" | "wordmark";
  size?: Size;
  className?: string;
  /** Dark chrome (sidebar / landing) vs light cards. */
  onDark?: boolean;
};

/** Official Yaadro lockup ≈ 2.55:1 */
const ICON_PX: Record<Size, number> = { sm: 32, md: 40, lg: 48 };
const LOGO_H: Record<Size, string> = { sm: "h-9", md: "h-11", lg: "h-14" };
const LOGO_MAX_W: Record<Size, string> = {
  sm: "max-w-[160px]",
  md: "max-w-[200px]",
  lg: "max-w-[260px]",
};
const WORD_TEXT: Record<Size, string> = {
  sm: "text-lg",
  md: "text-xl",
  lg: "text-2xl",
};

/** Trimmed Codeteak mark is ~square — use equal box. */
const CODETEAK_PX: Record<"sm" | "md", number> = { sm: 36, md: 44 };

export function YaadroLogo({
  variant = "full",
  size = "md",
  className = "",
  onDark = true,
}: Props) {
  const px = ICON_PX[size];
  const wordColor = onDark ? "text-[#c4b0f5]" : "text-primary";

  if (variant === "icon") {
    return (
      <img
        src={BRAND.icon}
        alt=""
        width={px}
        height={px}
        className={`shrink-0 rounded-lg object-cover ${className}`}
        style={{ width: px, height: px }}
      />
    );
  }

  if (variant === "wordmark") {
    return (
      <span
        className={`font-display font-semibold tracking-tight lowercase ${WORD_TEXT[size]} ${wordColor} ${className}`}
      >
        {BRAND.productNameLower}
      </span>
    );
  }

  return (
    <span className={`inline-flex max-w-full items-center ${className}`}>
      <img
        src={onDark ? BRAND.logo : BRAND.logoPrint}
        alt={BRAND.productName}
        className={`${LOGO_H[size]} ${LOGO_MAX_W[size]} w-auto object-contain object-left`}
      />
    </span>
  );
}

type PoweredProps = {
  className?: string;
  light?: boolean;
  size?: "sm" | "md";
};

export function PoweredByCodeteak({ className = "", light = false, size = "md" }: PoweredProps) {
  const px = CODETEAK_PX[size];

  return (
    <p
      className={`inline-flex max-w-full items-center gap-3 ${
        size === "md" ? "text-sm" : "text-xs"
      } ${light ? "text-white/80" : "text-muted-foreground"} ${className}`}
    >
      <img
        src={BRAND.companyMark}
        alt="Codeteak Technologies"
        width={px}
        height={px}
        className="shrink-0 rounded-md bg-white object-contain shadow-sm ring-1 ring-black/10"
        style={{ width: px, height: px }}
      />
      <span className="min-w-0 leading-snug">
        Powered by{" "}
        <span className={light ? "font-semibold text-white" : "font-semibold text-foreground"}>
          {BRAND.companyName}
        </span>
      </span>
    </p>
  );
}

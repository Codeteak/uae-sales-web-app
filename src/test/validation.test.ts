import { describe, expect, it } from "vitest";
import {
  csvFileError,
  csvRowCountError,
  isValidCurrency,
  isValidEmail,
  isValidPhone,
  passwordError,
  CSV_MAX_ROWS,
} from "@/lib/validation";
import { leadImportError } from "@/lib/lead-import";
import { contactImportError } from "@/lib/contact-import";

describe("validation helpers", () => {
  it("accepts and rejects emails", () => {
    expect(isValidEmail("")).toBe(true);
    expect(isValidEmail("ali@example.com")).toBe(true);
    expect(isValidEmail("bad")).toBe(false);
    expect(isValidEmail("a@b")).toBe(false);
  });

  it("accepts and rejects phones", () => {
    expect(isValidPhone("")).toBe(true);
    expect(isValidPhone("+971 50 123 4567")).toBe(true);
    expect(isValidPhone("123")).toBe(false);
  });

  it("validates currencies and passwords", () => {
    expect(isValidCurrency("AED")).toBe(true);
    expect(isValidCurrency("xyz")).toBe(false);
    expect(passwordError("short")).toMatch(/at least/);
    expect(passwordError("a".repeat(73))).toMatch(/at most/);
    expect(passwordError("password1")).toBeNull();
  });

  it("limits CSV size and rows", () => {
    expect(csvRowCountError(CSV_MAX_ROWS)).toBeNull();
    expect(csvRowCountError(CSV_MAX_ROWS + 1)).toMatch(/at most/);
    expect(csvFileError({ size: 100 } as File)).toBeNull();
    expect(csvFileError({ size: 2_000_000 } as File)).toMatch(/under/);
  });

  it("flags duplicate lead/contact imports", () => {
    expect(
      leadImportError(
        { title: "Deal", company: "Acme", email: "", phone: "", priority: "high", value: "10", currency: "AED" },
        "c1",
        "s1",
        { duplicate: true },
      ),
    ).toMatch(/Duplicate/);
    expect(contactImportError({ name: "Ali", email: "ali@example.com", companyId: "1", duplicate: true })).toMatch(
      /Duplicate/,
    );
  });
});

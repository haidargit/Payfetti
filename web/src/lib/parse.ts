import { isAddress, parseUnits, type Hex } from "viem";
import { MAX_PAYEES, USDC_DECIMALS } from "./chain";

/**
 * Last line of defence before money moves. Transfers are irreversible, so every
 * check that can run here should run here.
 */

export type ParsedRow = {
  line: number;
  raw: string;
  payee: Hex;
  amount: bigint; // 6-decimal USDC base units
  note: string;
};

export type RowError = { line: number; raw: string; reason: string };

export type ParseResult = {
  rows: ParsedRow[];
  errors: RowError[];
  warnings: string[];
  total: bigint;
};

const ZERO = "0x0000000000000000000000000000000000000000";

/**
 * One payee per line: `address, amount, note`, separated by comma, tab or
 * semicolon. Everything after the second separator is the note, so the note may
 * contain commas. Blank lines, `#` comments and a leading header row are skipped.
 */
export function parseRows(input: string): ParseResult {
  const rows: ParsedRow[] = [];
  const errors: RowError[] = [];
  const warnings: string[] = [];
  const seen = new Map<string, number>();

  const lines = input.split(/\r?\n/);

  lines.forEach((raw, i) => {
    const line = i + 1;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#")) return;

    // Skip a header row like "address,amount,note"
    if (i === 0 && /^\s*address\b/i.test(trimmed)) return;

    const parts = trimmed.split(/[,;\t]/);
    const payeeRaw = (parts[0] ?? "").trim();
    const amountRaw = (parts[1] ?? "").trim();
    const note = parts.slice(2).join(",").trim();

    if (!payeeRaw || !amountRaw) {
      errors.push({ line, raw: trimmed, reason: "expected `address, amount[, note]`" });
      return;
    }

    if (!isAddress(payeeRaw, { strict: false })) {
      errors.push({ line, raw: trimmed, reason: `not a valid address: ${payeeRaw}` });
      return;
    }
    const payee = payeeRaw.toLowerCase() as Hex;

    // Arc reverts a non-zero transfer to the zero address, so catch it here.
    if (payee === ZERO) {
      errors.push({ line, raw: trimmed, reason: "zero address, which Arc always reverts" });
      return;
    }

    let amount: bigint;
    try {
      const cleaned = amountRaw.replace(/[$_\s]/g, "");
      if (!/^\d*\.?\d+$/.test(cleaned)) throw new Error("not a number");
      amount = parseUnits(cleaned, USDC_DECIMALS);
    } catch {
      errors.push({ line, raw: trimmed, reason: `not a valid amount: ${amountRaw}` });
      return;
    }

    if (amount <= 0n) {
      errors.push({ line, raw: trimmed, reason: "amount must be greater than zero" });
      return;
    }

    // More than 6 decimal places cannot be represented and would be silently
    // truncated, so tell the user rather than quietly paying a different amount.
    const dp = amountRaw.split(".")[1]?.replace(/[^\d]/g, "").length ?? 0;
    if (dp > USDC_DECIMALS) {
      errors.push({
        line,
        raw: trimmed,
        reason: `USDC has ${USDC_DECIMALS} decimals; ${amountRaw} would be truncated`,
      });
      return;
    }

    const prev = seen.get(payee);
    if (prev !== undefined) {
      warnings.push(`line ${line}: ${payee} also appears on line ${prev}, so they will be paid twice`);
    } else {
      seen.set(payee, line);
    }

    rows.push({ line, raw: trimmed, payee, amount, note });
  });

  if (rows.length > MAX_PAYEES) {
    warnings.push(
      `${rows.length} payees exceeds the ${MAX_PAYEES}-per-run limit, so split it into multiple runs`,
    );
  }

  const total = rows.reduce((acc, r) => acc + r.amount, 0n);
  return { rows, errors, warnings, total };
}

/** Format 6-decimal base units as a human USDC string. */
export function formatUsdc(units: bigint): string {
  const neg = units < 0n;
  const v = neg ? -units : units;
  const whole = v / 1_000_000n;
  const frac = (v % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole}${frac ? "." + frac : ""}`;
}

export const EXAMPLE = `# address, amount, note
0x7061796665747469000000000000000000000001, 1.50, participant 001
0x7061796665747469000000000000000000000002, 1.50, participant 002
0x7061796665747469000000000000000000000003, 2.00, participant 003 (long session)`;

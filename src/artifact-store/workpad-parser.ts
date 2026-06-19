export interface ParsedWorkpad {
  phase: string | null;
  changeRef: string | null;
  mode: string | null;
  gates: Record<string, { result: string; at: string | null }>;
  notes: string[];
  reviewReport: "PASS" | "FAIL" | null;
  verificationReport: "PASS" | "FAIL" | null;
}

const PHASE_PATTERN = /^\s*[-*]?\s*Phase:\s*(.+?)\s*$/im;
const CHANGE_REF_PATTERN = /^\s*[-*]?\s*ChangeRef:\s*(.+?)\s*$/im;
const MODE_PATTERN = /^\s*[-*]?\s*Mode:\s*(.+?)\s*$/im;
const GATE_PATTERN =
  /^\s*[-*]?\s*(C0|P1|P2|V1):\s*(pass|fail|pending)\s*(?:@\s*(.+?))?\s*$/im;

export function parseWorkpad(content: string): ParsedWorkpad {
  const phase = matchFirst(content, PHASE_PATTERN);
  const changeRef = matchFirst(content, CHANGE_REF_PATTERN);
  const mode = matchFirst(content, MODE_PATTERN);
  const gates: ParsedWorkpad["gates"] = {};

  for (const line of content.split(/\r?\n/)) {
    const gateMatch = line.match(
      /^\s*[-*]?\s*(C0|P1|P2|V1):\s*(pass|fail|pending)\s*(?:@\s*(.+))?\s*$/i,
    );
    if (gateMatch !== null) {
      const id = gateMatch[1]?.toUpperCase() ?? "";
      const result = (gateMatch[2]?.toLowerCase() ?? "pending") as
        | "pass"
        | "fail"
        | "pending";
      const at = gateMatch[3]?.trim() ?? null;
      gates[id] = { result, at: at && at !== "—" && at !== "-" ? at : null };
    }
  }

  const notesSection = extractSection(content, "### Notes", "### ");
  const notes = notesSection
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  const notesText = notes.join("\n");
  const reviewReport = parseReport(notesText, "REVIEW_REPORT");
  const verificationReport = parseReport(notesText, "VERIFICATION_REPORT");

  return {
    phase: phase?.toLowerCase() ?? null,
    changeRef: changeRef?.toLowerCase() ?? null,
    mode: mode?.toLowerCase() ?? null,
    gates,
    notes,
    reviewReport,
    verificationReport,
  };
}

function matchFirst(content: string, pattern: RegExp): string | null {
  const match = content.match(pattern);
  const value = match?.[1]?.trim();
  return value && value.length > 0 ? value : null;
}

function extractSection(
  content: string,
  heading: string,
  nextHeadingPrefix: string,
): string {
  const start = content.indexOf(heading);
  if (start < 0) {
    return "";
  }

  const bodyStart = content.indexOf("\n", start);
  if (bodyStart < 0) {
    return "";
  }

  const rest = content.slice(bodyStart + 1);
  const nextIndex = rest.search(
    new RegExp(`^${escapeRegExp(nextHeadingPrefix)}`, "m"),
  );
  return nextIndex >= 0 ? rest.slice(0, nextIndex) : rest;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseReport(
  notesText: string,
  prefix: string,
): "PASS" | "FAIL" | null {
  if (new RegExp(`${prefix}:\\s*PASS`, "i").test(notesText)) {
    return "PASS";
  }
  if (new RegExp(`${prefix}:\\s*FAIL`, "i").test(notesText)) {
    return "FAIL";
  }
  return null;
}

import {
  DomainError,
  checkedDimensionDay,
  checkedExpectedRevision,
  checkedMinor,
  compileDimensionRules,
  dimensionBalance,
  type Account,
  type Company,
  type DimensionConfig,
  type DimensionMap,
  type Period,
  type BusinessOperation,
} from "./index.ts";

export type JournalOperation = "journal" | "reverse" | "replace" | "reclassify";
export interface JournalFieldIssue {
  readonly scope: "journals";
  readonly path: string;
  readonly rule:
    | "shape"
    | "money"
    | "balance"
    | "balanceAccount"
    | "dimensionLimit"
    | "businessSource"
    | "account"
    | "manual"
    | "suspense"
    | "period"
    | "stale"
    | "source"
    | "correction"
    | "amount";
}
export function journalError(
  path: string,
  rule: JournalFieldIssue["rule"],
  conflict = false,
): never {
  throw new DomainError(conflict ? "CONFLICT" : "INVALID_INPUT", { scope: "journals", path, rule });
}
export interface SuspenseEvidence {
  readonly owner: string;
  readonly reason: string;
  readonly reviewDate: string;
}
export interface JournalInputLine {
  readonly account: string;
  readonly debit: string;
  readonly credit: string;
  readonly dimensions: DimensionMap;
  readonly suspense: SuspenseEvidence | null;
}
export interface JournalDraft {
  readonly id: string;
  readonly revision: number;
  readonly sourceRef: string;
  readonly date: string;
  readonly documentDate?: string;
  readonly taxDate?: string;
  readonly memo: string;
  readonly kind: "normal" | "adjusting";
  readonly operation: JournalOperation;
  readonly originalId: string | null;
  readonly headerDimensions: DimensionMap;
  readonly lines: readonly JournalInputLine[];
}
type Resolved = ReturnType<ReturnType<typeof compileDimensionRules>["resolve"]>;
export interface JournalLine {
  readonly account: string;
  readonly debit: number;
  readonly credit: number;
  readonly dimensions: DimensionMap;
  readonly dimensionOrigins: Resolved["dimensionOrigins"];
  readonly role: "business" | "balance" | "historical";
  readonly suspense: SuspenseEvidence | null;
  readonly balancing: {
    readonly dimension: string;
    readonly value: string;
    readonly businessNet: number;
    readonly configurationRevision: number;
  } | null;
  readonly historical: { readonly entryId: string; readonly lineNo: number } | null;
  readonly group: "originalReverse" | "newAllocation" | null;
}
export interface PlannedJournal {
  readonly kind: "normal" | "adjusting" | "closing";
  readonly role: "normal" | "reversal" | "reclassification";
  readonly lines: readonly JournalLine[];
  readonly debit: number;
  readonly credit: number;
}
export interface JournalEntry extends PlannedJournal {
  readonly id: string;
  readonly sourceRef: string;
  readonly date: string;
  readonly documentDate: string;
  readonly taxDate: string;
  readonly module: string | null;
  readonly memo: string;
  readonly operation: JournalOperation;
  readonly postedAt: string;
  readonly fingerprint: string;
}
export interface JournalCorrection {
  readonly originalId: string;
  readonly outputId: string;
  readonly operation: Exclude<JournalOperation, "journal">;
  readonly date: string;
  readonly sequence: number;
}
export interface JournalPlan {
  readonly version: 1;
  readonly company: string;
  readonly currency: string;
  readonly scale: number;
  readonly draftId: string;
  readonly draftRevision: number;
  readonly sourceRef: string;
  readonly date: string;
  readonly documentDate: string;
  readonly taxDate: string;
  readonly module: string | null;
  readonly memo: string;
  readonly operation: JournalOperation;
  readonly originalId: string | null;
  readonly journals: readonly PlannedJournal[];
}
export interface JournalReceipt {
  readonly company: string;
  readonly sourceRef: string;
  readonly idempotencyKey: string;
  readonly draftId: string;
  readonly draftRevision: number;
  readonly fingerprint: string;
  readonly operation: JournalOperation | BusinessOperation | "period.close";
  readonly module: string | null;
  readonly journalIds: readonly string[];
  readonly postedAt: string;
}
export interface JournalSummary {
  readonly id: string;
  readonly date: string;
  readonly sourceRef: string;
  readonly memo: string;
  readonly operation: JournalOperation;
  readonly revision: number | null;
}
export function checkedJournalId(id: string): void {
  if (
    typeof id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(id)
  )
    journalError("id", "shape");
}
export function checkedJournalDraft(draft: JournalDraft): void {
  checkedJournalId(draft.id);
  checkedExpectedRevision(draft.revision);
  if (
    !["journal", "reverse", "replace", "reclassify"].includes(draft.operation) ||
    !["normal", "adjusting"].includes(draft.kind) ||
    typeof draft.sourceRef !== "string" ||
    !/^[ -~]{0,100}$/u.test(draft.sourceRef) ||
    typeof draft.memo !== "string" ||
    draft.memo.length > 200 ||
    typeof draft.date !== "string" ||
    draft.date.length > 10 ||
    (draft.documentDate !== undefined &&
      (typeof draft.documentDate !== "string" || draft.documentDate.length > 10)) ||
    (draft.taxDate !== undefined &&
      (typeof draft.taxDate !== "string" || draft.taxDate.length > 10)) ||
    !Array.isArray(draft.lines) ||
    draft.lines.length > 500
  )
    journalError("form", "shape");
  if (draft.operation === "journal" ? draft.originalId !== null : draft.originalId === null)
    journalError("originalId", "source");
  if (draft.originalId !== null) checkedJournalId(draft.originalId);
}
export function journalDates(draft: Pick<JournalDraft, "date" | "documentDate" | "taxDate">) {
  return {
    documentDate: draft.documentDate ?? draft.date,
    taxDate: draft.taxDate ?? draft.date,
  };
}
function amount(text: string, scale: number, path: string): number {
  const match = /^(0|[1-9]\d*)(?:\.(\d+))?$/u.exec(text || "0");
  if (!match || (match[2]?.length ?? 0) > scale) journalError(path, "money");
  const exact = BigInt(`${match[1]}${(match[2] ?? "").padEnd(scale, "0")}`);
  if (exact > BigInt(Number.MAX_SAFE_INTEGER)) journalError(path, "money");
  return checkedMinor(exact, scale);
}
function totals(lines: readonly JournalLine[]) {
  const exactDebit = lines.reduce((sum, line) => sum + BigInt(line.debit), 0n);
  const exactCredit = lines.reduce((sum, line) => sum + BigInt(line.credit), 0n);
  if (exactDebit > BigInt(Number.MAX_SAFE_INTEGER) || exactCredit > BigInt(Number.MAX_SAFE_INTEGER))
    journalError("lines", "money");
  const debit = checkedMinor(exactDebit, 0),
    credit = checkedMinor(exactCredit, 0);
  if (!debit || debit !== credit) journalError("lines", "balance");
  return { debit, credit };
}
export function checkedJournalDay(day: string, path: string, rule: "shape" | "suspense" = "shape") {
  try {
    checkedDimensionDay(day, path);
  } catch (error) {
    if (error instanceof DomainError && error.code === "INVALID_INPUT") journalError(path, rule);
    throw error;
  }
}
export function buildJournalPlan(input: {
  readonly draft: JournalDraft;
  readonly company: Company;
  readonly period: Period | null;
  readonly accounts: readonly Account[];
  readonly catalog: readonly DimensionConfig[];
  readonly original: JournalEntry | null;
  readonly corrections: readonly JournalCorrection[];
  readonly turnover: number;
  readonly master?: readonly DimensionMap[];
  readonly adapter?: {
    readonly module: string;
    readonly controlModules: readonly NonNullable<Account["controlModule"]>[];
  };
}): JournalPlan {
  const { draft, company, period, original, corrections } = input;
  checkedJournalDraft(draft);
  if (!draft.sourceRef.trim() || !draft.memo.trim()) journalError("sourceRef", "shape");
  checkedJournalDay(draft.date, "date");
  const dates = journalDates(draft);
  checkedJournalDay(dates.documentDate, "documentDate");
  checkedJournalDay(dates.taxDate, "taxDate");
  if (!period || period.month !== draft.date.slice(0, 7) || period.status !== "open")
    journalError("date", "period");
  const accounts = new Map(input.accounts.map((account) => [account.code, account]));
  const compiled = compileDimensionRules(input.catalog);
  const balance = input.catalog.find(
    (item): item is Extract<DimensionConfig, { kind: "balance" }> => item.kind === "balance",
  );
  function resolve(
    raw: Pick<JournalInputLine, "account" | "dimensions">,
    index: number,
    header: DimensionMap,
  ) {
    try {
      const resolved = compiled.resolve({
        account: raw.account,
        day: draft.date,
        header,
        explicit: raw.dimensions,
        master: input.master?.[index],
      });
      if (Object.keys(resolved.dimensions).length > 32)
        journalError(`lines.${index}.dimensions`, "dimensionLimit");
      return resolved;
    } catch (error) {
      if (
        error instanceof DomainError &&
        error.issue &&
        "scope" in error.issue &&
        error.issue.scope === "dimensions"
      )
        throw new DomainError(error.code, {
          ...error.issue,
          path: `lines.${index}.${error.issue.path}`,
        });
      throw error;
    }
  }
  function business(): readonly JournalLine[] {
    if (draft.lines.length < 2) journalError("lines", "shape");
    const lines: JournalLine[] = draft.lines.map((raw, index) => {
      const account = accounts.get(raw.account);
      if (!account?.active) journalError(`lines.${index}.account`, "account");
      if (
        account.purpose === "control"
          ? !account.controlModule || !input.adapter?.controlModules.includes(account.controlModule)
          : !account.manualAllowed
      )
        journalError(`lines.${index}.account`, "manual");
      if (account.purpose === "suspense") {
        if (!raw.suspense?.owner.trim() || !raw.suspense.reason.trim())
          journalError(`lines.${index}.suspense`, "suspense");
        checkedJournalDay(
          raw.suspense.reviewDate,
          `lines.${index}.suspense.reviewDate`,
          "suspense",
        );
      }
      const debit = amount(raw.debit, company.scale, `lines.${index}.debit`);
      const credit = amount(raw.credit, company.scale, `lines.${index}.credit`);
      if ((debit === 0 && credit === 0) || (debit > 0 && credit > 0))
        journalError(`lines.${index}`, "money");
      return {
        account: raw.account,
        debit,
        credit,
        ...resolve(raw, index, draft.headerDimensions),
        role: "business",
        suspense: raw.suspense,
        balancing: null,
        historical: null,
        group: null,
      };
    });
    totals(lines);
    let candidates: ReturnType<typeof dimensionBalance>;
    try {
      candidates = dimensionBalance(
        balance,
        draft.date,
        lines,
        balance ? (accounts.get(balance.account) ?? null) : null,
      );
    } catch (error) {
      if (
        error instanceof DomainError &&
        error.issue &&
        "scope" in error.issue &&
        error.issue.scope === "dimensions" &&
        error.issue.path === "account"
      )
        journalError("balance.account", "balanceAccount");
      throw error;
    }
    for (const candidate of candidates) {
      const resolved = resolve(candidate, lines.length, {});
      if (
        !balance ||
        resolved.dimensions[balance.dimension] !== candidate.dimensions[balance.dimension]
      )
        journalError("lines", "balance");
      lines.push({
        account: candidate.account,
        debit: candidate.debit,
        credit: candidate.credit,
        ...resolved,
        role: "balance",
        suspense: null,
        historical: null,
        group: null,
        balancing: {
          dimension: balance.dimension,
          value: candidate.dimensions[balance.dimension],
          businessNet: candidate.businessNet,
          configurationRevision: candidate.configurationRevision,
        },
      });
    }
    totals(lines);
    return lines;
  }
  const spec = (
    lines: readonly JournalLine[],
    role: PlannedJournal["role"],
    kind = draft.kind,
  ): PlannedJournal => ({ kind, role, lines, ...totals(lines) });
  let journals: readonly PlannedJournal[];
  if (draft.operation === "journal") journals = [spec(business(), "normal")];
  else {
    if (
      !original ||
      original.kind === "closing" ||
      original.id !== draft.originalId ||
      original.module !== (input.adapter?.module ?? null) ||
      original.role === "reversal" ||
      (original.role === "reclassification" && draft.operation !== "reverse")
    )
      journalError("originalId", "source");
    const active = new Map<string, boolean>();
    for (const edge of [...corrections].sort((a, b) => b.sequence - a.sequence))
      active.set(
        edge.originalId,
        Boolean(active.get(edge.originalId)) ||
          edge.operation !== "reclassify" ||
          !active.get(edge.outputId),
      );
    if (active.get(original.id)) journalError("originalId", "correction", true);
    const latestDate = corrections.reduce(
      (latest, edge) => (edge.date > latest ? edge.date : latest),
      original.date,
    );
    if (draft.date < latestDate) journalError("date", "correction");
    // D6: mirror immutable evidence; current defaults/availability must not prevent undoing history.
    const reversed: JournalLine[] = original.lines.map((line, index) => {
      if (!accounts.has(line.account)) journalError(`lines.${index}.account`, "account");
      return {
        ...line,
        debit: line.credit,
        credit: line.debit,
        role: "historical",
        historical: { entryId: original.id, lineNo: index + 1 },
        group: null,
      };
    });
    for (const [index, line] of reversed.entries()) {
      const source = original.lines[index];
      if (
        line.account !== source.account ||
        line.debit !== source.credit ||
        line.credit !== source.debit ||
        JSON.stringify(line.dimensions) !== JSON.stringify(source.dimensions) ||
        JSON.stringify(line.dimensionOrigins) !== JSON.stringify(source.dimensionOrigins)
      )
        journalError(`lines.${index}`, "correction");
    }
    if (draft.operation === "reverse") journals = [spec(reversed, "reversal", original.kind)];
    else {
      const fresh = business();
      if (draft.operation === "replace")
        journals = [spec(reversed, "reversal", original.kind), spec(fresh, "normal")];
      else {
        const economic = (lines: readonly JournalLine[]) =>
          lines
            .filter((line) => line.role === "business")
            .reduce((sum, line) => sum + BigInt(line.debit), 0n);
        if (economic(fresh) !== economic(original.lines)) journalError("lines", "amount");
        journals = [
          spec(
            [
              ...reversed.map((line) => ({ ...line, group: "originalReverse" as const })),
              ...fresh.map((line) => ({ ...line, group: "newAllocation" as const })),
            ],
            "reclassification",
            original.kind,
          ),
        ];
      }
    }
  }
  const turnover =
    BigInt(checkedMinor(input.turnover, 0)) +
    journals.reduce((sum, journal) => sum + BigInt(journal.debit), 0n);
  if (turnover > BigInt(Number.MAX_SAFE_INTEGER)) journalError("lines", "money");
  return {
    version: 1,
    company: company.code,
    currency: company.currency,
    scale: company.scale,
    draftId: draft.id,
    draftRevision: draft.revision,
    sourceRef: draft.sourceRef,
    date: draft.date,
    ...dates,
    module: input.adapter?.module ?? null,
    memo: draft.memo,
    operation: draft.operation,
    originalId: draft.originalId,
    journals,
  };
}

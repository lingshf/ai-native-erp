import type {
  BookWriteSession,
  CompanyScope,
  CompanyWriteSession,
  TenantWriteSession,
} from "../src/application/storage.ts";

declare const tenant: TenantWriteSession;
declare const book: BookWriteSession;
declare const company: CompanyWriteSession;
declare const companyScope: CompanyScope;

tenant.revisions.advance({ level: "tenant", tenantId: "T1" }, 0);
book.revisions.advance({ level: "book", tenantId: "T1", bookId: "B1" }, 0);
company.revisions.advance(companyScope, 0);

// @ts-expect-error A tenant lock cannot advance a company revision.
tenant.revisions.advance(companyScope, 0);
// @ts-expect-error A company writer only shares the tenant lock.
company.revisions.advance({ level: "tenant", tenantId: "T1" }, 0);
// @ts-expect-error A book writer only shares the tenant lock.
book.revisions.advance({ level: "tenant", tenantId: "T1" }, 0);

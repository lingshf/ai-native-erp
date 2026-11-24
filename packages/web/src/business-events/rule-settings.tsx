import type { CompanyDto, PostingRuleDto } from "@erp/core/contracts";
import { BusinessError } from "./business-error.tsx";
import { PageTable } from "./list.tsx";
import { newPostingRule } from "./posting-rule.ts";
import { PostingRuleForm } from "./posting-rule-form.tsx";
import type { T } from "./types.ts";
import { usePostingRuleEditor, type PostingRuleEditor } from "./use-posting-rule-editor.ts";

export function RuleSettings({
  company,
  t,
  dimensionKeys,
  lock,
}: {
  company: CompanyDto;
  t: T;
  dimensionKeys: string[];
  lock: (value: boolean) => void;
}) {
  const editor = usePostingRuleEditor(company, lock);
  const { value, busy, error, saved, editing } = editor;
  return (
    <>
      <button
        className="jv-btn"
        type="button"
        disabled={editing || busy}
        onClick={() => editor.start(newPostingRule(company.year))}
      >
        {t("business.new")}
      </button>
      <PostingRuleList page={editor.page} disabled={editing || busy} edit={editor.start} t={t} />
      {error !== undefined && <BusinessError error={error} t={t} />}
      {saved && <p role="status">{t("business.saved")}</p>}
      {value && (
        <PostingRuleForm value={value} editor={editor} dimensionKeys={dimensionKeys} t={t} />
      )}
    </>
  );
}

function PostingRuleList({
  page,
  disabled,
  edit,
  t,
}: {
  page: PostingRuleEditor["page"];
  disabled: boolean;
  edit: (rule: PostingRuleDto) => void;
  t: T;
}) {
  return (
    <PageTable
      page={page}
      t={t}
      title={t("business.rules")}
      header={[
        t("business.code"),
        t("business.direction"),
        t("business.meaning"),
        t("journal.account"),
        "",
      ]}
      render={(item) => (
        <>
          <td>
            {item.code} · {item.objectScope}/{item.objectCode} · {item.partyScope}/{item.partyCode}
          </td>
          <td>{t(`business.${item.direction}`)}</td>
          <td>{t(`business.${item.meaning}`)}</td>
          <td>{item.account}</td>
          <td>
            <button className="jv-btn" type="button" disabled={disabled} onClick={() => edit(item)}>
              {t("business.edit")}
            </button>
          </td>
        </>
      )}
    />
  );
}

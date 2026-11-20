// UI-10e：只由 Migration.tsx 导入，打包进迁移页路由 chunk（PG-05：入口 JS 不变）。
export const migrationDetail = {
  zh: {
    field: "字段",
    mismatch: "不符",
    raw: "原始 JSON",
    teaching: "核对通过 ≠ 批准切换；切换须用户另行授权。",
  },
  en: {
    field: "Field",
    mismatch: "Mismatch",
    raw: "Raw JSON",
    teaching:
      "Passing reconciliation ≠ cutover approval; cutover needs separate user authorization.",
  },
} as const;

export const groups = {
  ASSET: ["cash", "receivables", "inventory", "prepayments", "fixedAssets", "otherAssets"],
  LIABILITY: ["payables", "taxLiabilities", "otherLiabilities"],
  EQUITY: ["capital", "retainedEarnings", "otherEquity"],
  REVENUE: ["sales", "otherRevenue"],
  EXPENSE: ["costOfSales", "operatingExpense", "otherExpense"],
} as const;

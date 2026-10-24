"use client";

import { useMemo, useState } from "react";
import { money, num, pct, titleCase } from "@/lib/format";
import type { CampaignView } from "@/lib/view";
import Delta from "./Delta";

type SortKey = "name" | "spend" | "results" | "cpr" | "ctr" | "cpc" | "budget" | "atc" | "checkout" | "revenue" | "roas";

function statusBadge(status: string) {
  const s = status.toUpperCase();
  if (s === "OFF") return <span className="badge">Off</span>;
  if (["ACTIVE", "ENABLED", "ELIGIBLE"].includes(s)) return <span className="badge green"><span className="dot" />{titleCase(status)}</span>;
  if (["PAUSED", "CAMPAIGN_PAUSED", "ADSET_PAUSED", "ENDED"].includes(s)) return <span className="badge">{titleCase(status)}</span>;
  if (["LIMITED", "LEARNING", "IN_PROCESS", "PENDING"].includes(s)) return <span className="badge amber">{titleCase(status)}</span>;
  return <span className="badge red">{titleCase(status)}</span>;
}

const step = (c: CampaignView, key: string) => (c.funnel?.[key]?.[0] ?? 0);

const pick = (c: CampaignView, k: SortKey): number | string => {
  switch (k) {
    case "name": return c.name.toLowerCase();
    case "spend": return c.cur.spend;
    case "results": return c.cur.results;
    case "cpr": return c.cur.costPerResult ?? Number.POSITIVE_INFINITY;
    case "ctr": return c.cur.ctr ?? -1;
    case "cpc": return c.cur.cpc ?? Number.POSITIVE_INFINITY;
    case "budget": return c.dailyBudget ?? -1;
    case "atc": return step(c, "atc");
    case "checkout": return step(c, "checkout");
    case "revenue": return c.cur.value;
    case "roas": return c.cur.roas ?? -1;
  }
};

export default function CampaignTable({ campaigns, currency, hasCompare, ecommerce = false }: { campaigns: CampaignView[]; currency: string; hasCompare: boolean; ecommerce?: boolean }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "spend", dir: -1 });
  const total = campaigns.reduce((s, c) => s + c.cur.spend, 0);
  const rows = useMemo(
    () =>
      [...campaigns].sort((a, b) => {
        const x = pick(a, sort.key);
        const y = pick(b, sort.key);
        return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
      }),
    [campaigns, sort],
  );

  const Th = ({ k, children, left }: { k: SortKey; children: React.ReactNode; left?: boolean }) => (
    <th
      className="sortable"
      style={left ? { textAlign: "left" } : undefined}
      onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? (s.dir === 1 ? -1 : 1) : k === "name" || k === "cpr" || k === "cpc" ? 1 : -1 }))}
      aria-sort={sort.key === k ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
    >
      {children}
      <span className="arrow">{sort.key === k ? (sort.dir === 1 ? "↑" : "↓") : ""}</span>
    </th>
  );

  if (campaigns.length === 0) return <div className="empty">No campaign activity in this period.</div>;

  const spendCell = (c: CampaignView) => (
    <td className="num">
      {money(c.cur.spend, currency)}
      {hasCompare && c.prev && <span className="sub"><Delta now={c.cur.spend} before={c.prev.spend} good="neutral" /></span>}
      <span className="share" title={`${total > 0 ? ((c.cur.spend / total) * 100).toFixed(0) : 0}% of spend`}><i style={{ width: `${total > 0 ? (c.cur.spend / total) * 100 : 0}%` }} /></span>
    </td>
  );
  const nameCell = (c: CampaignView) => (
    <td className="camp">
      <div className="cname">{c.name}</div>
      <div className="ctype">{titleCase(c.type) || "Campaign"}{ecommerce ? "" : ` · ${c.resultLabel}`}</div>
      {c.notes.map((n, i) => <div key={i} className="cnote">{n}</div>)}
    </td>
  );

  return (
    <div className="table-wrap">
      <table>
        <thead>
          {ecommerce ? (
            <tr>
              <Th k="name" left>Campaign</Th>
              <th>Status</th>
              <Th k="spend">Spend</Th>
              <Th k="atc">Add to cart</Th>
              <Th k="checkout">Checkouts</Th>
              <Th k="results">Purchases</Th>
              <Th k="revenue">Revenue</Th>
              <Th k="roas">ROAS</Th>
              <Th k="cpr">Cost / purchase</Th>
              <Th k="budget">Budget / day</Th>
            </tr>
          ) : (
            <tr>
              <Th k="name" left>Campaign</Th>
              <th>Status</th>
              <Th k="spend">Spend</Th>
              <Th k="results">Results</Th>
              <Th k="cpr">Cost / result</Th>
              <Th k="ctr">CTR</Th>
              <Th k="cpc">CPC</Th>
              <Th k="budget">Budget / day</Th>
            </tr>
          )}
        </thead>
        <tbody>
          {rows.map((c) =>
            ecommerce ? (
              <tr key={c.id}>
                {nameCell(c)}
                <td>{statusBadge(c.status)}</td>
                {spendCell(c)}
                <td className="num">{num(step(c, "atc"), 1)}</td>
                <td className="num">{num(step(c, "checkout"), 1)}</td>
                <td className="num">
                  {num(c.cur.results, 1)}
                  {hasCompare && c.prev && <span className="sub"><Delta now={c.cur.results} before={c.prev.results} /></span>}
                </td>
                <td className="num">{money(c.cur.value, currency)}</td>
                <td className="num">
                  {c.cur.roas === null ? "–" : `${c.cur.roas.toFixed(2)}x`}
                  {hasCompare && c.prev && <span className="sub"><Delta now={c.cur.roas} before={c.prev.roas} /></span>}
                </td>
                <td className="num">{c.cur.costPerResult === null ? "–" : money(c.cur.costPerResult, currency)}</td>
                <td className="num">{c.dailyBudget ? money(c.dailyBudget, currency) : "–"}</td>
              </tr>
            ) : (
              <tr key={c.id}>
                {nameCell(c)}
                <td>{statusBadge(c.status)}</td>
                {spendCell(c)}
                <td className="num">
                  {num(c.cur.results, 1)}
                  {hasCompare && c.prev && <span className="sub"><Delta now={c.cur.results} before={c.prev.results} /></span>}
                </td>
                <td className="num">
                  {c.cur.costPerResult === null ? "–" : money(c.cur.costPerResult, currency)}
                  {hasCompare && c.prev && <span className="sub"><Delta now={c.cur.costPerResult} before={c.prev.costPerResult} good="lower" /></span>}
                </td>
                <td className="num">{pct(c.cur.ctr)}</td>
                <td className="num">{c.cur.cpc === null ? "–" : money(c.cur.cpc, currency)}</td>
                <td className="num">{c.dailyBudget ? money(c.dailyBudget, currency) : "–"}</td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}

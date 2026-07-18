"use client";
import { useEffect, useState } from "react";
import { IconSearch, IconZap, IconLink } from "@/components/icons";

type Lead = {
  id: number;
  name: string;
  region: string | null;
  category: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  rating: number | null;
  notes: string | null;
  status: string;
};

export default function Bizdev() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [region, setRegion] = useState("");
  const [category, setCategory] = useState("");
  const [searching, setSearching] = useState(false);
  const [pitching, setPitching] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = () =>
    fetch("/api/bizdev").then((r) => r.json()).then((d) => setLeads(d.leads ?? []));

  useEffect(() => {
    load();
  }, []);

  async function search() {
    if (!region || !category) return setMsg("Enter both region and business type.");
    setSearching(true);
    setMsg(null);
    const res = await fetch("/api/bizdev", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "search", region, category }),
    });
    const d = await res.json();
    setSearching(false);
    setMsg(res.ok ? `Found ${d.found}, ${d.inserted} new leads.` : d.error);
    load();
  }

  async function pitch(leadId: number) {
    setPitching(leadId);
    setMsg(null);
    const res = await fetch("/api/bizdev", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "pitch", leadId }),
    });
    const d = await res.json();
    setPitching(null);
    setMsg(res.ok ? `Pitch drafted to ${d.email} — review in queue.` : d.error);
    load();
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Freelance Leads</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Find businesses with weak or missing websites in a region. Pitch = find email + draft into queue.
        </p>
      </header>

      <div className="card flex items-end gap-3 p-5">
        <label className="flex-1">
          <span className="mb-1.5 block text-sm font-medium">Region</span>
          <input
            className="input"
            placeholder="Jaipur, India"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
          />
        </label>
        <label className="flex-1">
          <span className="mb-1.5 block text-sm font-medium">Business type</span>
          <input
            className="input"
            placeholder="restaurants, gyms, boutiques"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
        </label>
        <button onClick={search} disabled={searching} className="btn-primary h-[38px]">
          <IconSearch className="h-4 w-4" />
          {searching ? "Searching…" : "Search"}
        </button>
      </div>

      {msg && (
        <p className="rounded-lg border border-line bg-surface px-4 py-3 text-sm text-ink-muted">{msg}</p>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-ink-muted">
              <th className="mono px-5 py-3 font-medium">business</th>
              <th className="mono px-3 py-3 font-medium">web presence</th>
              <th className="mono px-3 py-3 font-medium">contact</th>
              <th className="mono px-3 py-3 font-medium">status</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {leads.map((l) => (
              <tr key={l.id} className="group transition-colors duration-150 hover:bg-surface-2/50">
                <td className="px-5 py-3.5">
                  <div className="font-medium">{l.name}</div>
                  <div className="text-xs text-ink-muted">
                    {l.category} · {l.region} {l.rating ? `· ★ ${l.rating}` : ""}
                  </div>
                </td>
                <td className="px-3 py-3.5">
                  {l.website ? (
                    <a
                      href={l.website}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex cursor-pointer items-center gap-1 text-xs text-accent hover:underline"
                    >
                      <IconLink className="h-3.5 w-3.5" /> site
                    </a>
                  ) : (
                    <span className="mono rounded-md bg-warn/15 px-2 py-0.5 text-xs font-medium text-warn">
                      no website
                    </span>
                  )}
                </td>
                <td className="px-3 py-3.5 text-xs text-ink-muted">
                  {l.email ?? l.phone ?? "—"}
                </td>
                <td className="mono px-3 py-3.5 text-xs text-ink-muted">{l.status}</td>
                <td className="px-5 py-3.5 text-right">
                  {l.status === "new" && (
                    <button
                      onClick={() => pitch(l.id)}
                      disabled={pitching === l.id}
                      className="btn-primary opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                    >
                      <IconZap className="h-4 w-4" />
                      {pitching === l.id ? "Drafting…" : "Pitch"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {leads.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-sm text-ink-muted">
                  No leads yet. Search a region + business type. Requires GOOGLE_PLACES_API_KEY.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

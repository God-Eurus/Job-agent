"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { IconSearch, IconZap, IconExternal, IconStore, IconGlobe } from "@/components/icons";
import { EmptyState, SkeletonRows, StatusBadge, useToast } from "@/components/ui";

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

const PRESETS = ["restaurants", "gyms", "salons", "boutiques", "cafes", "dentists", "hotels"];

export default function Bizdev() {
  const toast = useToast();
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [region, setRegion] = useState("");
  const [category, setCategory] = useState("");
  const [searching, setSearching] = useState(false);
  const [pitching, setPitching] = useState<number | null>(null);
  const [onlyWeak, setOnlyWeak] = useState(true);
  const [regions, setRegions] = useState<Array<{ region: string; n: number }>>([]);
  const [active, setActive] = useState<string | null>(null);

  const load = useCallback(
    (forRegion?: string | null) =>
      fetch(`/api/bizdev${forRegion ? `?region=${encodeURIComponent(forRegion)}` : ""}`)
        .then((r) => r.json())
        .then((d) => {
          setLeads(d.leads ?? []);
          setRegions(d.regions ?? []);
          setActive(d.active ?? null);
        })
        .catch(() => setLeads([])),
    []
  );

  useEffect(() => {
    load();
  }, [load]);

  async function search() {
    if (!region.trim() || !category.trim()) {
      toast("error", "Enter both a region and a business type");
      return;
    }
    setSearching(true);
    try {
      const res = await fetch("/api/bizdev", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "search", region, category }),
      });
      const d = await res.json();
      if (!res.ok) toast("error", d.error ?? "Search failed");
      else toast("ok", `${d.inserted} new lead${d.inserted === 1 ? "" : "s"} from ${d.found} found`);
      // Jump the list to what was just searched rather than leaving the old city up.
      await load(region);
    } catch (e) {
      toast("error", String(e));
    } finally {
      setSearching(false);
    }
  }

  async function pitch(lead: Lead) {
    setPitching(lead.id);
    try {
      const res = await fetch("/api/bizdev", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pitch", leadId: lead.id }),
      });
      const d = await res.json();
      if (!res.ok) toast("error", d.error ?? "Pitch failed");
      else if (d.channel === "whatsapp")
        toast("ok", `WhatsApp pitch drafted for +${d.phone} — review it in the queue`);
      else toast("ok", `Pitch drafted to ${d.email} — review it in the queue`);
      await load(active);
    } catch (e) {
      toast("error", String(e));
    } finally {
      setPitching(null);
    }
  }

  const isWeak = (l: Lead) =>
    !l.website || /facebook\.com|instagram\.com|wa\.me|linktr\.ee/i.test(l.website);

  const visible = useMemo(() => {
    const list = leads ?? [];
    return onlyWeak ? list.filter(isWeak) : list;
  }, [leads, onlyWeak]);

  const weakCount = (leads ?? []).filter(isWeak).length;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Freelance Leads</h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-muted">
          Find businesses in a region with a weak or missing web presence.{" "}
          <strong className="font-medium text-ink">Pitch</strong> finds an email and drafts a
          website / e-commerce offer into the approval queue.
        </p>
      </header>

      <div className="card space-y-3 p-5">
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <div>
            <label htmlFor="region" className="mb-1.5 block text-sm font-medium">
              Region
            </label>
            <input
              id="region"
              className="input"
              placeholder="Jaipur, India"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
            />
          </div>
          <div>
            <label htmlFor="category" className="mb-1.5 block text-sm font-medium">
              Business type
            </label>
            <input
              id="category"
              className="input"
              placeholder="restaurants"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
            />
          </div>
          <div className="flex items-end">
            <button onClick={search} disabled={searching} className="btn-primary w-full sm:w-auto">
              <IconSearch className="h-4 w-4" />
              {searching ? "Searching…" : "Search"}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs text-ink-muted">Quick pick:</span>
          {PRESETS.map((p) => (
            <button key={p} onClick={() => setCategory(p)} data-active={category === p} className="chip">
              {p}
            </button>
          ))}
        </div>
      </div>

      {regions.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="label">Searched</span>
          {regions.map((r) => (
            <button
              key={r.region}
              onClick={() => load(r.region)}
              data-active={active?.trim().toLowerCase() === r.region.trim().toLowerCase()}
              className="chip"
            >
              {r.region} <span className="mono opacity-60">{r.n}</span>
            </button>
          ))}
        </div>
      )}

      {(leads?.length ?? 0) > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setOnlyWeak(true)} data-active={onlyWeak} className="chip">
            No / weak website <span className="mono opacity-60">{weakCount}</span>
          </button>
          <button onClick={() => setOnlyWeak(false)} data-active={!onlyWeak} className="chip">
            All in {active ?? "region"} <span className="mono opacity-60">{leads?.length ?? 0}</span>
          </button>
        </div>
      )}

      <div className="card">
        {leads === null ? (
          <SkeletonRows rows={5} />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={IconStore}
            title={(leads?.length ?? 0) > 0 ? "No leads match this filter" : "No leads yet"}
            hint={
              (leads?.length ?? 0) > 0
                ? "Switch to All leads to see businesses that already have a site."
                : "Search a region and business type above. Requires GOOGLE_PLACES_API_KEY."
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {visible.map((l) => (
              <li
                key={l.id}
                className="flex flex-col gap-3 px-4 py-4 transition-colors duration-150 hover:bg-surface-2/40 sm:flex-row sm:items-center sm:px-5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{l.name}</span>
                    <StatusBadge status={l.status} />
                    {isWeak(l) && (
                      <span className="mono px-1.5 py-0.5 text-[11px] text-warn ring-1 ring-warn/25">
                        needs a site
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-muted">
                    <span>{l.category}</span>
                    <span aria-hidden>·</span>
                    <span>{l.region}</span>
                    {l.rating != null && (
                      <>
                        <span aria-hidden>·</span>
                        <span>★ {l.rating}</span>
                      </>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
                    {l.website ? (
                      <a
                        href={l.website}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex cursor-pointer items-center gap-1 text-ink hover:underline"
                      >
                        <IconGlobe className="h-3 w-3" /> site
                      </a>
                    ) : (
                      <span className="text-ink-muted">no website</span>
                    )}
                    {l.email && <span className="text-ink-muted">{l.email}</span>}
                    {l.phone && <span className="text-ink-muted">{l.phone}</span>}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {l.website && (
                    <a
                      href={l.website}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-ghost"
                      aria-label={`Open website for ${l.name}`}
                    >
                      <IconExternal className="h-4 w-4" />
                    </a>
                  )}
                  {l.status === "new" && (
                    <button
                      onClick={() => pitch(l)}
                      disabled={pitching === l.id}
                      className="btn-primary"
                    >
                      <IconZap className="h-4 w-4" />
                      {pitching === l.id ? "Drafting…" : "Pitch"}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

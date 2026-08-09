"use client";
import { useEffect, useState } from "react";
import { IconUpload, IconCheck, IconUser } from "@/components/icons";
import { useToast } from "@/components/ui";

type Prefs = {
  roles: string[];
  keywords: string[];
  minSalary?: number;
  currency?: string;
  locations: string[];
  remoteOnly: boolean;
  ghCompanies: string[];
  leverCompanies: string[];
};

type Resume = {
  name: string;
  headline: string;
  email: string;
  years_experience: number;
  skills: string[];
  roles: string[];
};

const empty: Prefs = {
  roles: [],
  keywords: [],
  currency: "USD",
  locations: ["Remote"],
  remoteOnly: true,
  ghCompanies: [],
  leverCompanies: [],
};

function TagInput({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        className="input"
        defaultValue={value.join(", ")}
        placeholder={hint}
        onBlur={(e) =>
          onChange(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))
        }
      />
      {value.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {value.map((v) => (
            <span
              key={v}
              className="mono bg-surface-2 px-2 py-0.5 text-[11px] text-ink-muted"
            >
              {v}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Setup() {
  const toast = useToast();
  const [prefs, setPrefs] = useState<Prefs>(empty);
  const [resume, setResume] = useState<Resume | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((d) => {
        if (d.prefs) setPrefs({ ...empty, ...d.prefs });
        if (d.resume) setResume(d.resume);
      })
      .catch(() => {});
  }, []);

  async function uploadResume(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("resume", file);
      const res = await fetch("/api/profile/resume", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) toast("error", d.error ?? "Upload failed");
      else {
        setResume(d.resume);
        toast("ok", `Parsed — ${d.resume.name}, ${d.resume.skills.length} skills detected`);
      }
    } catch (e) {
      toast("error", String(e));
    } finally {
      setUploading(false);
    }
  }

  async function savePrefs() {
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      if (!res.ok) toast("error", "Save failed");
      else toast("ok", "Preferences saved");
    } catch (e) {
      toast("error", String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">
          Your resume and preferences. Everything the agent matches and writes from.
        </p>
      </header>

      <section className="card p-5">
        <h2 className="mb-3 mono text-sm font-semibold">1 · Resume</h2>
        {resume ? (
          <div className="mb-4 border border-line-strong bg-surface-2 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-ok">
              <IconCheck className="h-4 w-4" /> {resume.name}
            </div>
            <p className="mt-1 text-sm">
              {resume.headline} · {resume.years_experience}y experience
            </p>
            <p className="mt-0.5 text-xs text-ink-muted">{resume.email}</p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {resume.skills.slice(0, 14).map((s) => (
                <span
                  key={s}
                  className="mono bg-surface-2 px-1.5 py-0.5 text-[11px] text-ink-muted"
                >
                  {s}
                </span>
              ))}
              {resume.skills.length > 14 && (
                <span className="mono px-1 py-0.5 text-[11px] text-ink-muted">
                  +{resume.skills.length - 14} more
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="mb-4 flex items-start gap-2.5 border border-line bg-surface-2/40 p-4">
            <IconUser className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />
            <p className="text-sm leading-relaxed text-ink-muted">
              Upload a PDF and Claude turns it into a structured profile — skills, target roles,
              and a summary used in every cover letter.
            </p>
          </div>
        )}
        <label className="btn-ghost inline-flex">
          <IconUpload className="h-4 w-4" />
          {uploading ? "Parsing…" : resume ? "Replace resume (PDF)" : "Upload resume (PDF)"}
          <input
            type="file"
            accept="application/pdf"
            className="sr-only"
            disabled={uploading}
            onChange={(e) => e.target.files?.[0] && uploadResume(e.target.files[0])}
          />
        </label>
      </section>

      <section className="card space-y-5 p-5">
        <h2 className="mono text-sm font-semibold">2 · Preferences</h2>
        <TagInput
          id="roles"
          label="Target roles"
          hint="Full Stack Developer, Frontend Engineer"
          value={prefs.roles}
          onChange={(roles) => setPrefs({ ...prefs, roles })}
        />
        <TagInput
          id="keywords"
          label="Search keywords"
          hint="react, node, typescript"
          value={prefs.keywords}
          onChange={(keywords) => setPrefs({ ...prefs, keywords })}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="minsal" className="mb-1.5 block text-sm font-medium">
              Minimum salary
            </label>
            <input
              id="minsal"
              type="number"
              className="input"
              placeholder="80000"
              defaultValue={prefs.minSalary}
              onBlur={(e) =>
                setPrefs({
                  ...prefs,
                  minSalary: e.target.value ? Number(e.target.value) : undefined,
                })
              }
            />
          </div>
          <div>
            <label htmlFor="currency" className="mb-1.5 block text-sm font-medium">
              Currency
            </label>
            <input
              id="currency"
              className="input"
              defaultValue={prefs.currency}
              onBlur={(e) => setPrefs({ ...prefs, currency: e.target.value })}
            />
          </div>
        </div>
        <TagInput
          id="locations"
          label="Acceptable locations"
          hint="Remote, Bengaluru, Dubai"
          value={prefs.locations}
          onChange={(locations) => setPrefs({ ...prefs, locations })}
        />
        <label className="flex cursor-pointer items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={prefs.remoteOnly}
            onChange={(e) => setPrefs({ ...prefs, remoteOnly: e.target.checked })}
            className="h-4 w-4 cursor-pointer accent-[#22c55e]"
          />
          Remote / WFH only
        </label>
      </section>

      <section className="card space-y-5 p-5">
        <div>
          <h2 className="mono text-sm font-semibold">3 · Company boards</h2>
          <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">
            The only sources with real application forms — these are what make{" "}
            <strong className="font-medium text-ink">auto-apply</strong> work. Everything else is
            copy-and-paste. Use the slug from the careers URL: boards.greenhouse.io/
            <strong className="font-medium text-ink">stripe</strong> or jobs.lever.co/
            <strong className="font-medium text-ink">netflix</strong>.
          </p>
        </div>
        <TagInput
          id="gh"
          label="Greenhouse companies"
          hint="stripe, figma, ramp, vercel"
          value={prefs.ghCompanies}
          onChange={(ghCompanies) => setPrefs({ ...prefs, ghCompanies })}
        />
        <TagInput
          id="lever"
          label="Lever companies"
          hint="netflix, spotify"
          value={prefs.leverCompanies}
          onChange={(leverCompanies) => setPrefs({ ...prefs, leverCompanies })}
        />
      </section>

      <div className="sticky bottom-4 flex justify-end">
        <button onClick={savePrefs} disabled={saving} className="btn-primary shadow-lg">
          <IconCheck className="h-4 w-4" />
          {saving ? "Saving…" : "Save preferences"}
        </button>
      </div>
    </div>
  );
}

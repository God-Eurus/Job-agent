"use client";
import { useEffect, useState } from "react";
import { IconUpload, IconCheck } from "@/components/icons";

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
  label, hint, value, onChange,
}: { label: string; hint?: string; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <input
        className="input"
        defaultValue={value.join(", ")}
        placeholder={hint}
        onBlur={(e) =>
          onChange(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))
        }
      />
    </label>
  );
}

export default function Setup() {
  const [prefs, setPrefs] = useState<Prefs>(empty);
  const [resume, setResume] = useState<{ name: string; headline: string; skills: string[] } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((d) => {
        if (d.prefs) setPrefs({ ...empty, ...d.prefs });
        if (d.resume) setResume(d.resume);
      });
  }, []);

  async function uploadResume(file: File) {
    setUploading(true);
    setError(null);
    const fd = new FormData();
    fd.append("resume", file);
    const res = await fetch("/api/profile/resume", { method: "POST", body: fd });
    const d = await res.json();
    setUploading(false);
    if (!res.ok) return setError(d.error ?? "Upload failed");
    setResume(d.resume);
  }

  async function savePrefs() {
    setSaved(false);
    await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(prefs),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Resume + preferences. This is what the agent matches and writes from.
        </p>
      </header>

      <section className="card p-5">
        <h2 className="mb-3 text-sm font-semibold">1 · Resume</h2>
        {resume ? (
          <div className="mb-4 rounded-lg border border-accent/30 bg-accent/5 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-accent">
              <IconCheck className="h-4 w-4" /> {resume.name}
            </div>
            <p className="mt-1 text-sm text-ink-muted">{resume.headline}</p>
            <p className="mt-2 text-xs text-ink-muted">
              {resume.skills?.slice(0, 10).join(" · ")}
            </p>
          </div>
        ) : (
          <p className="mb-4 text-sm text-ink-muted">Upload a PDF — Claude parses it into a structured profile.</p>
        )}
        <label className="btn-ghost">
          <IconUpload className="h-4 w-4" />
          {uploading ? "Parsing…" : resume ? "Replace resume (PDF)" : "Upload resume (PDF)"}
          <input
            type="file"
            accept="application/pdf"
            className="hidden"
            disabled={uploading}
            onChange={(e) => e.target.files?.[0] && uploadResume(e.target.files[0])}
          />
        </label>
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      </section>

      <section className="card space-y-5 p-5">
        <h2 className="text-sm font-semibold">2 · Preferences</h2>
        <TagInput
          label="Target roles"
          hint="Full Stack Developer, Frontend Engineer"
          value={prefs.roles}
          onChange={(roles) => setPrefs({ ...prefs, roles })}
        />
        <TagInput
          label="Search keywords"
          hint="react, node, typescript"
          value={prefs.keywords}
          onChange={(keywords) => setPrefs({ ...prefs, keywords })}
        />
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Minimum salary</span>
            <input
              type="number"
              className="input"
              placeholder="80000"
              defaultValue={prefs.minSalary}
              onBlur={(e) =>
                setPrefs({ ...prefs, minSalary: e.target.value ? Number(e.target.value) : undefined })
              }
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Currency</span>
            <input
              className="input"
              defaultValue={prefs.currency}
              onBlur={(e) => setPrefs({ ...prefs, currency: e.target.value })}
            />
          </label>
        </div>
        <TagInput
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
            className="h-4 w-4 accent-[#22c55e]"
          />
          Remote / WFH only
        </label>
      </section>

      <section className="card space-y-5 p-5">
        <h2 className="text-sm font-semibold">3 · Company boards to watch (optional)</h2>
        <p className="-mt-3 text-xs text-ink-muted">
          Board slugs from careers pages. Greenhouse: boards.greenhouse.io/&lt;slug&gt;. Lever: jobs.lever.co/&lt;slug&gt;.
        </p>
        <TagInput
          label="Greenhouse companies"
          hint="stripe, airbnb, coinbase"
          value={prefs.ghCompanies}
          onChange={(ghCompanies) => setPrefs({ ...prefs, ghCompanies })}
        />
        <TagInput
          label="Lever companies"
          hint="netflix, spotify"
          value={prefs.leverCompanies}
          onChange={(leverCompanies) => setPrefs({ ...prefs, leverCompanies })}
        />
      </section>

      <div className="flex items-center gap-3">
        <button onClick={savePrefs} className="btn-primary">
          Save preferences
        </button>
        {saved && (
          <span className="flex items-center gap-1 text-sm text-accent">
            <IconCheck className="h-4 w-4" /> Saved
          </span>
        )}
      </div>
    </div>
  );
}

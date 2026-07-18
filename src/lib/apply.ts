// Auto-fill job application forms with Playwright.
// Only runs on user-approved applications. Greenhouse + Lever hosted forms.
import { chromium } from "playwright";
import type { Resume } from "./claude";

export type ApplyResult = { ok: boolean; detail: string };

export async function autoApply(opts: {
  applyUrl: string;
  source: string;
  resume: Resume;
  resumePath: string; // local PDF path
  coverLetter: string;
}): Promise<ApplyResult> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(opts.applyUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

    const [firstName, ...rest] = opts.resume.name.split(" ");
    const lastName = rest.join(" ") || firstName;

    const fill = async (selectors: string[], value: string) => {
      for (const sel of selectors) {
        const el = page.locator(sel).first();
        if ((await el.count()) > 0 && (await el.isVisible().catch(() => false))) {
          await el.fill(value).catch(() => {});
          return true;
        }
      }
      return false;
    };

    // Common Greenhouse + Lever field names
    await fill(['#first_name', 'input[name="first_name"]', 'input[autocomplete="given-name"]'], firstName);
    await fill(['#last_name', 'input[name="last_name"]', 'input[autocomplete="family-name"]'], lastName);
    await fill(['input[name="name"]'], opts.resume.name); // lever single name field
    await fill(['#email', 'input[name="email"]', 'input[type="email"]'], opts.resume.email);
    await fill(['#phone', 'input[name="phone"]', 'input[type="tel"]'], opts.resume.phone);

    // Resume upload
    const fileInput = page.locator('input[type="file"]').first();
    if ((await fileInput.count()) > 0) {
      await fileInput.setInputFiles(opts.resumePath).catch(() => {});
    }

    // Cover letter / additional info
    await fill(
      ['#cover_letter_text', 'textarea[name="cover_letter"]', 'textarea[name="comments"]', 'textarea'],
      opts.coverLetter
    );

    // Detect required fields we couldn't fill (custom questions, EEOC dropdowns)
    const requiredEmpty = await page
      .locator('input[required]:not([type="file"]), textarea[required], select[required]')
      .evaluateAll((els) =>
        els.filter((el) => !(el as HTMLInputElement).value).map(
          (el) => (el as HTMLElement).getAttribute("name") ?? (el as HTMLElement).id ?? "unknown"
        )
      )
      .catch(() => [] as string[]);

    if (requiredEmpty.length > 0) {
      return {
        ok: false,
        detail: `Needs manual input for required fields: ${requiredEmpty.slice(0, 8).join(", ")}. Open ${opts.applyUrl} to finish.`,
      };
    }

    // Submit
    const submit = page
      .locator('button[type="submit"], input[type="submit"], #submit_app')
      .first();
    if ((await submit.count()) === 0) {
      return { ok: false, detail: "No submit button found — apply manually." };
    }
    await submit.click();
    await page.waitForTimeout(4000);

    const bodyText = (await page.textContent("body").catch(() => "")) ?? "";
    const success = /thank|received|submitted|application.*(sent|complete)/i.test(bodyText);
    return success
      ? { ok: true, detail: "Application submitted." }
      : { ok: false, detail: "Submitted but no confirmation detected — verify manually." };
  } catch (e) {
    return { ok: false, detail: `Playwright error: ${String(e).slice(0, 300)}` };
  } finally {
    await browser.close();
  }
}

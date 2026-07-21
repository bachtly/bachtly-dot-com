import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const headerSource = readFileSync(path.join(dirname, "Header.astro"), "utf-8");
const iconSource = readFileSync(
	path.join(dirname, "..", "..", "..", "public", "icon.svg"),
	"utf-8",
);

// Old cactus artwork fingerprints (accessible title + one of its unique path
// fragments) that must no longer appear anywhere in the site.
const OLD_LOGO_TITLE = "Astro Cactus Logo";
const OLD_CACTUS_PATH_FRAGMENT = "181.334 93.333v-40L226.667 80v40z";

// Fingerprints of the prior "BL" round (two-letter mark, single hardcoded
// hex that only happened to match the theme's *dark*-mode accent) that must
// no longer appear after this round's "just a B, better color" rework.
const OLD_BL_LOGO_TITLE = "BL Monogram Logo";
const OLD_HARDCODED_ACCENT = "#2bbc8a";

const NEW_LOGO_TITLE = "B Monogram Logo";

// The site's real --color-accent tokens (src/styles/global.css) rendered to
// sRGB hex: light oklch(55.27% 0.195 19.06) and dark oklch(70.91% 0.1415
// 163.7). The favicon is a standalone document (no cascade from the page),
// so it can't use currentColor/var(--color-accent) like the inline header
// mark does — it hardcodes both and switches on prefers-color-scheme.
const LIGHT_ACCENT_HEX = "#cb2a42";
const DARK_ACCENT_HEX = "#2abc89";

describe("Header logo", () => {
	it("no longer renders the cactus artwork or its accessible title", () => {
		expect(headerSource).not.toContain(OLD_LOGO_TITLE);
		expect(headerSource).not.toContain(OLD_CACTUS_PATH_FRAGMENT);
	});

	it("no longer renders the prior round's two-letter mark or hardcoded color", () => {
		expect(headerSource).not.toContain(OLD_BL_LOGO_TITLE);
		expect(headerSource).not.toContain(OLD_HARDCODED_ACCENT);
	});

	it("renders the new symbol with a descriptive accessible title", () => {
		expect(headerSource).toContain(`<title>${NEW_LOGO_TITLE}</title>`);
	});

	it("colors the new symbol via the site's live theme accent, not a hardcoded guess", () => {
		// currentColor + the text-accent utility ties the mark to the real
		// --color-accent token, so it's correct in both light and dark mode
		// (unlike the prior round's single hardcoded hex).
		expect(headerSource).toContain('class="text-accent');
		expect(headerSource).toContain('stroke="currentColor"');
	});
});

describe("public/icon.svg (favicon/webmanifest source)", () => {
	it("no longer contains the cactus artwork", () => {
		expect(iconSource).not.toContain(OLD_CACTUS_PATH_FRAGMENT);
	});

	it("is well-formed SVG", () => {
		expect(iconSource.trim().startsWith("<svg")).toBe(true);
		expect(iconSource.trim().endsWith("</svg>")).toBe(true);
	});

	it("uses the site's real accent color in both light and dark mode", () => {
		expect(iconSource).toContain(LIGHT_ACCENT_HEX);
		expect(iconSource).toContain(DARK_ACCENT_HEX);
		expect(iconSource).toContain("prefers-color-scheme: dark");
	});

	it("draws the same glyph geometry as the header's symbol", () => {
		const headerSvgMatch = headerSource.match(/<svg[\s\S]*?<\/svg>/);
		expect(headerSvgMatch).not.toBeNull();
		const headerPaths = [...(headerSvgMatch?.[0].matchAll(/<path[^>]*\bd="([^"]+)"/g) ?? [])].map(
			(m) => m[1],
		);
		// Colors intentionally differ (currentColor vs. hardcoded light/dark
		// hex, see above) but the drawn shape must stay in sync.
		expect(headerPaths.length).toBeGreaterThan(0);
		for (const d of headerPaths) {
			expect(iconSource).toContain(`d="${d}"`);
		}
	});
});

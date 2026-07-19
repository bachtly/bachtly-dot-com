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

const NEW_LOGO_TITLE = "BL Monogram Logo";
const THEME_ACCENT_COLOR = "#2bbc8a";

describe("Header logo", () => {
	it("no longer renders the cactus artwork or its accessible title", () => {
		expect(headerSource).not.toContain(OLD_LOGO_TITLE);
		expect(headerSource).not.toContain(OLD_CACTUS_PATH_FRAGMENT);
	});

	it("renders the new symbol with a descriptive accessible title", () => {
		expect(headerSource).toContain(`<title>${NEW_LOGO_TITLE}</title>`);
	});

	it("colors the new symbol using the site's theme accent color", () => {
		expect(headerSource).toContain(THEME_ACCENT_COLOR);
	});
});

describe("public/icon.svg (favicon/webmanifest source)", () => {
	it("no longer contains the cactus artwork", () => {
		expect(iconSource).not.toContain(OLD_CACTUS_PATH_FRAGMENT);
	});

	it("is well-formed SVG using the site's theme accent color", () => {
		expect(iconSource.trim().startsWith("<svg")).toBe(true);
		expect(iconSource.trim().endsWith("</svg>")).toBe(true);
		expect(iconSource).toContain(THEME_ACCENT_COLOR);
	});

	it("matches the header's new symbol markup exactly", () => {
		const headerSvgMatch = headerSource.match(/<svg[\s\S]*?<\/svg>/);
		expect(headerSvgMatch).not.toBeNull();
		const headerInnerMarkup = headerSvgMatch?.[0]
			.replace(/<title>[\s\S]*?<\/title>/, "")
			.replace(/\s+/g, "");
		const iconInnerMarkup = iconSource.replace(/\s+/g, "");
		// Every shape drawn in the header (rects/paths) should also be present in
		// the favicon source, keeping the two symbols in sync.
		const shapeTags = headerInnerMarkup?.match(/<(rect|path|circle)[^/]*\/>/g) ?? [];
		expect(shapeTags.length).toBeGreaterThan(0);
		for (const shape of shapeTags) {
			expect(iconInnerMarkup).toContain(shape);
		}
	});
});

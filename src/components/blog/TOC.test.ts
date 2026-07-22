import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const tocSource = readFileSync(path.join(dirname, "TOC.astro"), "utf-8");

// Old sidebar treatment that turned the TOC into a sticky rail floating
// beside the article content at the `lg` breakpoint. Dropped so the TOC
// always renders above the article body instead of eating horizontal
// width next to it.
const OLD_SIDEBAR_CLASSES = ["lg:sticky", "lg:order-2", "lg:-me-32", "lg:basis-64"];

describe("TOC", () => {
	it("no longer applies the sticky sidebar treatment at lg", () => {
		for (const cls of OLD_SIDEBAR_CLASSES) {
			expect(tocSource).not.toContain(cls);
		}
	});

	it("is collapsed by default (no `open` attribute on <details>)", () => {
		const detailsMatch = tocSource.match(/<details[^>]*>/);
		expect(detailsMatch).not.toBeNull();
		expect(detailsMatch?.[0]).not.toMatch(/\bopen\b/);
	});

	it("still renders the heading list inside a details/summary disclosure", () => {
		expect(tocSource).toContain("<summary");
		expect(tocSource).toContain("Table of Contents");
		expect(tocSource).toContain("toc.map((heading)");
	});
});

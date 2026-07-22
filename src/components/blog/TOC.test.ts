import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { generateToc } from "../../utils/generateToc";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const tocSource = readFileSync(path.join(dirname, "TOC.astro"), "utf-8");

// Posts are rendered from GitHub Issue bodies, where an author's `#` becomes
// a real in-body h1. A post written entirely with `#` sections is the common
// case, not an edge case.
const ALL_H1_HEADINGS = [
	{ depth: 1, slug: "why-open-source-software-oss", text: "Why open source software (OSS)" },
	{ depth: 1, slug: "its-hard-to-pick-one", text: "It's hard to pick one" },
	{ depth: 1, slug: "lets-pick-one-randomly", text: "Let's pick one randomly" },
];

// Sidebar treatment that turned the TOC into a sticky rail floating beside
// the article at `lg`. Dropped so the TOC always renders above the article
// body instead of eating horizontal width next to it.
const SIDEBAR_CLASSES = [
	"lg:sticky",
	"lg:order-2",
	"lg:-me-32",
	"lg:basis-64",
	"lg:max-h-[calc(100vh-6rem)]",
	"lg:overflow-y-auto",
];

describe("TOC", () => {
	it("does not apply the sticky sidebar treatment at lg", () => {
		for (const cls of SIDEBAR_CLASSES) {
			expect(tocSource).not.toContain(cls);
		}
	});

	it("is collapsed by default, with no script reopening it at any width", () => {
		const detailsMatch = tocSource.match(/<details[^>]*>/s);
		expect(detailsMatch).not.toBeNull();
		expect(detailsMatch?.[0]).not.toMatch(/\bopen\b/);
		expect(tocSource).not.toContain("matchMedia");
	});

	it("lists a post whose sections are all h1 instead of rendering empty", () => {
		expect(generateToc(ALL_H1_HEADINGS, { minHeadingLevel: 1 })).toHaveLength(
			ALL_H1_HEADINGS.length,
		);
		expect(tocSource).toContain("minHeadingLevel: 1");
	});

	it("renders nothing at all when no heading falls inside the TOC's depth range", () => {
		expect(generateToc([{ depth: 6, slug: "aside", text: "Aside" }], { minHeadingLevel: 1 })).toEqual(
			[],
		);
		expect(tocSource).toContain("toc.length > 0 &&");
	});

	it("still renders the heading list inside a details/summary disclosure", () => {
		expect(tocSource).toContain("<summary");
		expect(tocSource).toContain("Table of Contents");
		expect(tocSource).toContain("toc.map((heading)");
	});
});

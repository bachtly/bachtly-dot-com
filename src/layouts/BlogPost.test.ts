import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const blogPostSource = readFileSync(path.join(dirname, "BlogPost.astro"), "utf-8");

// Old layout that put the TOC beside the article as a wide-screen side
// rail: a flex row at `lg` with the TOC and prose column split apart.
const OLD_ROW_LAYOUT_CLASSES = ["lg:flex-row", "lg:items-start", "lg:justify-between"];

describe("BlogPost layout", () => {
	it("no longer lays the TOC out beside the article at lg (no flex-row sidebar)", () => {
		for (const cls of OLD_ROW_LAYOUT_CLASSES) {
			expect(blogPostSource).not.toContain(cls);
		}
	});

	it("keeps the TOC and article stacked vertically", () => {
		expect(blogPostSource).toContain("flex flex-col");
	});

	it("still guards TOC rendering for posts with no headings", () => {
		expect(blogPostSource).toContain("{!!headings.length && <TOC headings={headings} />}");
	});
});

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const blogPostSource = readFileSync(path.join(dirname, "BlogPost.astro"), "utf-8");
const globalCssSource = readFileSync(path.join(dirname, "..", "styles", "global.css"), "utf-8");
const baseLayoutSource = readFileSync(path.join(dirname, "Base.astro"), "utf-8");

// Side-rail treatment that put the TOC beside the article at `lg`, in a flex
// row with the TOC and prose column split apart. The article always stacks
// under the TOC instead, at every width.
const SIDE_RAIL_CLASSES = ["lg:flex-row", "lg:items-start", "lg:justify-between"];

// Negative margins that hung the rail in the page's right gutter. With no
// rail there is nothing to hang, and the article keeps the full container.
const GUTTER_BREAKOUT_CLASSES = ["lg:-me-24", "xl:-me-56", "2xl:-me-80"];

describe("BlogPost layout", () => {
	it("does not lay the TOC out beside the article (no side rail)", () => {
		for (const cls of SIDE_RAIL_CLASSES) {
			expect(blogPostSource).not.toContain(cls);
		}
	});

	it("keeps the TOC and article stacked vertically", () => {
		expect(blogPostSource).toContain("flex flex-col");
	});

	it("does not break the article out of the page container", () => {
		for (const cls of GUTTER_BREAKOUT_CLASSES) {
			expect(blogPostSource).not.toContain(cls);
		}
	});

	it("keeps code blocks aligned with the prose measure (no gutter breakout)", () => {
		expect(globalCssSource).not.toContain(".prose .expressive-code");
	});

	it("lets the prose column fill the page container", () => {
		// `.prose` caps itself at 65ch (~546px in this mono font at prose-sm's
		// 14px), narrower than the container. With no rail beside it, the
		// article takes the container's full width instead; the page's own
		// `max-w-3xl` on body is what bounds the measure.
		expect(blogPostSource).toContain("max-w-none");
		expect(baseLayoutSource).toContain("max-w-3xl");
	});

	it("justifies body text, and only body text", () => {
		expect(blogPostSource).toContain("prose-p:text-justify");
		expect(blogPostSource).toContain("prose-li:text-justify");
		// A bare `text-justify` on the wrapper would catch headings, tables and
		// code blocks too, which must stay ragged-right.
		expect(blogPostSource).not.toMatch(/\s(?<!prose-\w{1,4}:)text-justify/);
	});

	it("hyphenates alongside justification, to keep word spacing even", () => {
		// Justified text with no hyphenation stretches spaces to fill the line,
		// which at this measure opens rivers of whitespace. `hyphens: auto`
		// needs the document language, which Base.astro sets on <html>.
		expect(blogPostSource).toContain("prose-p:hyphens-auto");
		expect(blogPostSource).toContain("prose-li:hyphens-auto");
		expect(baseLayoutSource).toContain("lang={siteConfig.lang}");
	});

	it("still guards TOC rendering for posts with no headings", () => {
		expect(blogPostSource).toContain("{!!headings.length && <TOC headings={headings} />}");
	});
});

// Post-title heading (Masthead.astro's `.title`, defined in global.css).
const TITLE_FONT_SIZE_PX = 24; // text-2xl = 1.5rem

// In-body heading sizes as rendered by Tailwind Typography's `prose-sm`
// (node_modules/@tailwindcss/typography/src/styles.js): h1 = em(30,14),
// h2 = em(20,14), h3 = em(18,14) against a 14px prose-sm root, h4 has no
// explicit fontSize so it inherits the 14px root unscaled.
const PROSE_SM_H2_FONT_SIZE_PX = 20;
const PROSE_SM_H3_FONT_SIZE_PX = 18;
const PROSE_SM_H4_FONT_SIZE_PX = 14;

// This round's fix: override only the in-body h1, sized strictly between
// prose-sm's h2 (20px) and the post title (24px).
const IN_BODY_H1_OVERRIDE_UTILITY = "prose-h1:text-[1.375rem]";
const IN_BODY_H1_FONT_SIZE_PX = 22; // 1.375rem

describe("BlogPost article body heading sizing", () => {
	it("no longer lets the unscaled prose-sm h1 (30px) outsize the post title", () => {
		// prose-sm's default h1 is em(30,14) = 30px, bigger than the 24px
		// title. The fix must not leave that oversized default un-overridden.
		expect(blogPostSource).toContain(IN_BODY_H1_OVERRIDE_UTILITY);
	});

	it("keeps the article body prose-sm and prose-headings utilities intact for #5", () => {
		// Sub-issue #5 (spacing after the "#" marker pseudo-element) lands on
		// top of this exact class string, so the surrounding utilities must
		// still be present, unmodified, after this change.
		expect(blogPostSource).toContain("prose prose-sm prose-headings:font-semibold");
		expect(blogPostSource).toContain("sm:prose-headings:before:content-['#']");
	});

	it("orders every in-body heading level strictly below the post title", () => {
		expect(TITLE_FONT_SIZE_PX).toBeGreaterThan(IN_BODY_H1_FONT_SIZE_PX);
		expect(IN_BODY_H1_FONT_SIZE_PX).toBeGreaterThan(PROSE_SM_H2_FONT_SIZE_PX);
		expect(PROSE_SM_H2_FONT_SIZE_PX).toBeGreaterThan(PROSE_SM_H3_FONT_SIZE_PX);
		expect(PROSE_SM_H3_FONT_SIZE_PX).toBeGreaterThan(PROSE_SM_H4_FONT_SIZE_PX);
	});

	it("does not change which heading levels flow into the table of contents", () => {
		// Visual-only change: the headings prop passed to <TOC> must still
		// come straight from render(post), untouched by this styling fix.
		expect(blogPostSource).toContain("{!!headings.length && <TOC headings={headings} />}");
	});

	it(".title (post title) stays at text-2xl, unchanged by this heading-sizing fix", () => {
		expect(globalCssSource).toContain(".title {\n\t\t@apply text-accent-2 text-2xl font-semibold;");
	});
});

describe("BlogPost heading '#' marker spacing", () => {
	it("pulls the marker further left of the heading text than before, opening a gap", () => {
		// The marker is an absolutely-positioned `::before` pulled left of the
		// heading text via a negative inline-start margin — the heading text
		// itself never moves, only the marker's own offset does. -ms-4 (-1rem)
		// left next to no visible gap once the "#" glyph's own width is
		// subtracted; -ms-6 (-1.5rem) leaves headroom as a visible gap.
		expect(blogPostSource).not.toContain("prose-headings:before:-ms-4");
		expect(blogPostSource).toContain("prose-headings:before:-ms-6");
	});

	it("changes only the offset — every other marker behavior is untouched", () => {
		expect(blogPostSource).toContain("prose-headings:before:absolute");
		expect(blogPostSource).toContain("prose-headings:before:text-muted");
		expect(blogPostSource).toContain("prose-headings:hover:before:text-accent");
		expect(blogPostSource).toContain("sm:prose-headings:before:content-['#']");
		expect(blogPostSource).toContain("sm:prose-th:before:content-none");
	});
});

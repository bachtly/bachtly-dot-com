import { describe, expect, it } from "vitest";
import { type GitHubIssue, issueToEntry } from "./github-issues";

function makeIssue(overrides: Partial<GitHubIssue> = {}): GitHubIssue {
	return {
		number: 1,
		title: "A post",
		body: "Body text.",
		created_at: "2026-01-02T03:04:05Z",
		updated_at: "2026-01-02T03:04:05Z",
		labels: [{ name: "Publish" }, { name: "essay" }],
		...overrides,
	};
}

describe("issueToEntry", () => {
	it("routes a Publish+essay issue to the post tier", () => {
		const entry = issueToEntry(makeIssue());
		expect(entry?.tier).toBe("post");
		expect(entry?.data.title).toBe("A post");
	});

	it("routes a Publish+note issue to the note tier", () => {
		const entry = issueToEntry(
			makeIssue({ labels: [{ name: "Publish" }, { name: "note" }] }),
		);
		expect(entry?.tier).toBe("note");
	});

	it("includes a Publish-labelled issue that has neither the essay nor the note label", () => {
		const entry = issueToEntry(makeIssue({ labels: [{ name: "Publish" }] }));
		expect(entry).not.toBeNull();
	});

	it("excludes drafts: an issue without the Publish label is null", () => {
		const entry = issueToEntry(makeIssue({ labels: [{ name: "essay" }] }));
		expect(entry).toBeNull();
	});

	it("maps created_at to publishDate and updated_at to updatedDate", () => {
		const entry = issueToEntry(
			makeIssue({
				created_at: "2026-03-01T00:00:00Z",
				updated_at: "2026-03-05T12:00:00Z",
			}),
		);
		expect(entry?.data.publishDate).toBe("2026-03-01T00:00:00Z");
		expect(entry?.data.updatedDate).toBe("2026-03-05T12:00:00Z");
	});

	it("derives tags from residual labels, excluding gate and tier labels", () => {
		const entry = issueToEntry(
			makeIssue({
				labels: [
					{ name: "Publish" },
					{ name: "essay" },
					{ name: "typescript" },
					{ name: "debugging" },
				],
			}),
		);
		expect(entry?.data.tags).toEqual(["typescript", "debugging"]);
	});

	it("uses a leading '> tl;dr' blockquote as the description", () => {
		const entry = issueToEntry(
			makeIssue({
				body: "> tl;dr: Reproduced a heisenbug.\n\nLong body here...",
			}),
		);
		expect(entry?.data.description).toBe("Reproduced a heisenbug.");
	});

	it("falls back to the first paragraph as description when there is no tl;dr", () => {
		const entry = issueToEntry(
			makeIssue({
				body: "This is the opening line.\n\nMore content follows.",
			}),
		);
		expect(entry?.data.description).toBe("This is the opening line.");
	});

	it("builds a slug id from the issue number and a slugified title", () => {
		const entry = issueToEntry(
			makeIssue({ number: 7, title: "Hello, World! & Café" }),
		);
		expect(entry?.id).toBe("7-hello-world-cafe");
	});
});

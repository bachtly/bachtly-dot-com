// Pure mapping from a GitHub issue (REST API shape) to a content-collection entry.
// Kept free of `astro:content` and network code so it is unit-testable in isolation;
// the Content Layer loader (content.config.ts) wraps this with fetch + markdown rendering.

export interface GitHubLabel {
	name: string;
}

export interface GitHubIssue {
	number: number;
	title: string;
	body: string | null;
	created_at: string;
	updated_at: string;
	labels: GitHubLabel[];
}

export type Tier = "post" | "note";

export interface IssueEntry {
	tier: Tier;
	id: string;
	data: Record<string, unknown>;
}

const RESERVED_LABELS = new Set<string>(["Publish", "essay", "note"]);

function extractDescription(body: string | null): string | undefined {
	if (!body) return undefined;
	const tldr = body.match(/^\s*>\s*tl;dr[:\-—]?\s*(.+?)\s*$/im);
	if (tldr) return tldr[1].trim();
	return body
		.split("\n")
		.map((line) => line.trim())
		.find((line) => line.length > 0);
}

function slugify(title: string): string {
	return title
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

export function issueToEntry(issue: GitHubIssue): IssueEntry | null {
	const labels = issue.labels.map((l) => l.name);
	if (!labels.includes("Publish")) return null;
	const tier: Tier = labels.includes("note") ? "note" : "post";
	const tags = labels.filter((name) => !RESERVED_LABELS.has(name));
	return {
		tier,
		id: `${issue.number}-${slugify(issue.title)}`,
		data: {
			title: issue.title,
			description: extractDescription(issue.body),
			publishDate: issue.created_at,
			updatedDate: issue.updated_at,
			tags,
		},
	};
}

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

export interface IssueEntry {
	id: string;
	data: Record<string, unknown>;
}

// `essay`/`note` are legacy tier-gate labels: the loader no longer branches on
// them (any `Publish`-labelled issue is the single article type), but they may
// still exist on live issues until a follow-up cleans them up, so they stay
// excluded from the derived `tags` array rather than leaking in as topics.
const RESERVED_LABELS = new Set<string>(["Publish", "essay", "note"]);

function extractDescription(body: string | null): string | undefined {
	if (!body) return undefined;
	const tldr = body.match(/^\s*>\s*tl;dr[:\-—]?\s*(.+?)\s*$/im);
	if (tldr?.[1]) return tldr[1].trim();
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
	const tags = labels.filter((name) => !RESERVED_LABELS.has(name));
	return {
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

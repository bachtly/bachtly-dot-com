import { defineCollection } from "astro:content";
import { type Loader, glob } from "astro/loaders";
import { z } from "astro/zod";
import { type GitHubIssue, issueToEntry } from "./lib/github-issues";

function removeDupsAndLowerCase(array: string[]) {
	return [...new Set(array.map((str) => str.toLowerCase()))];
}

const REPO = process.env.BLOG_REPO ?? "bachtly/bachtly-dot-com";

// Content Layer loader: fetches every `Publish`-labelled GitHub Issue and emits
// it into this collection. The issue->entry mapping is the pure, unit-tested
// `issueToEntry`; this wrapper only does fetch + markdown rendering.
function githubIssuesLoader(): Loader {
	return {
		name: "github-issues",
		async load({ store, renderMarkdown, parseData, logger }) {
			store.clear();
			const headers: Record<string, string> = {
				Accept: "application/vnd.github+json",
				"User-Agent": "bachtly-blog",
				"X-GitHub-Api-Version": "2022-11-28",
			};
			const token = process.env.GITHUB_TOKEN;
			if (token) headers.Authorization = `Bearer ${token}`;

			const res = await fetch(
				`https://api.github.com/repos/${REPO}/issues?state=open&labels=Publish&per_page=100`,
				{ headers },
			);
			if (!res.ok) {
				logger.warn(`GitHub issues fetch failed (${res.status}); collection left empty`);
				return;
			}

			const issues = (await res.json()) as (GitHubIssue & {
				pull_request?: unknown;
			})[];
			let count = 0;
			for (const issue of issues) {
				if (issue.pull_request) continue; // /issues also returns PRs
				const entry = issueToEntry(issue);
				if (!entry) continue;
				const data = await parseData({
					id: entry.id,
					data: {
						...entry.data,
						// fall back to the title so every entry has a description.
						description: entry.data.description ?? entry.data.title,
					},
				});
				const rendered = await renderMarkdown(issue.body ?? "");
				store.set({ id: entry.id, data, rendered });
				count++;
			}
			logger.info(`Loaded ${count} post(s) from GitHub Issues (${REPO})`);
		},
	};
}

const titleSchema = z.string().max(60);

const baseSchema = z.object({
	title: titleSchema,
});

// Merged schema for the single, unified article type: every field that used
// to be `note`-only-optional (i.e. not present on the `note` schema at all,
// or optional there) stays optional/defaulted here, so a lightweight
// note-like issue is just as easy to publish as a fully-dressed post.
const post = defineCollection({
	loader: githubIssuesLoader(),
	schema: ({ image }) =>
		baseSchema.extend({
			description: z.string().optional(),
			coverImage: z
				.object({
					alt: z.string(),
					src: image(),
				})
				.optional(),
			draft: z.boolean().default(false),
			ogImage: z.string().optional(),
			tags: z.array(z.string()).default([]).transform(removeDupsAndLowerCase),
			publishDate: z
				.string()
				.or(z.date())
				.transform((val) => new Date(val)),
			updatedDate: z
				.string()
				.optional()
				.transform((str) => (str ? new Date(str) : undefined)),
			pinned: z.boolean().default(false),
		}),
});

const tag = defineCollection({
	loader: glob({ base: "./src/content/tag", pattern: "**/*.{md,mdx}" }),
	schema: z.object({
		title: titleSchema.optional(),
		description: z.string().optional(),
	}),
});

export const collections = { post, tag };

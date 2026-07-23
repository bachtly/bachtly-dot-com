import { describe, expect, it } from "vitest";
import { menuLinks, siteConfig } from "./site.config";

describe("siteConfig", () => {
	it("has the site title 'Bach T. Ly', which drives the document <title>, header heading, footer credit, og:site_name and webmanifest name", () => {
		expect(siteConfig.title).toBe("Bach T. Ly");
	});
});

describe("menuLinks", () => {
	it("has no separate /notes/ entry now that notes and posts are a single article type", () => {
		expect(menuLinks.some((link) => link.path === "/notes/")).toBe(false);
	});

	it("has a single Blog entry pointing at /posts/", () => {
		const blogLinks = menuLinks.filter((link) => link.path === "/posts/");
		expect(blogLinks).toEqual([{ path: "/posts/", title: "Blog" }]);
	});
});

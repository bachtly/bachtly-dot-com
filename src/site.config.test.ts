import { describe, expect, it } from "vitest";
import { siteConfig } from "./site.config";

describe("siteConfig", () => {
	it("has the site title 'Bach T. Ly', which drives the document <title>, header heading, footer credit, og:site_name and webmanifest name", () => {
		expect(siteConfig.title).toBe("Bach T. Ly");
	});
});

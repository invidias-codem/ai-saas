import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProductHuntLaunch } from "@/components/landing/product-hunt-launch";

describe("Product Hunt launch landing experience", () => {
  it("explains the product plainly and routes visitors to real Code Builder", () => {
    const html = renderToStaticMarkup(React.createElement(ProductHuntLaunch));
    expect(html).toContain("Build software with AI.");
    expect(html).toContain("Keep it yours.");
    expect(html).toContain('href="/code/builder"');
    expect(html).toContain('href="#demo"');
    expect(html).toContain("Illustrative walkthrough");
  });
  it("offers an accessible staged demo on mobile", () => {
    const html = renderToStaticMarkup(React.createElement(ProductHuntLaunch));
    expect(html).toContain('aria-label="Choose demo step"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Try the button.");
    expect(html).toContain("sm:flex-row");
    expect(html).toContain("min-w-0");
  });
  it("is clear about what is not yet generally available", () => {
    const html = renderToStaticMarkup(React.createElement(ProductHuntLaunch));
    expect(html).toContain("Isolated preview");
    expect(html).toContain("limited beta");
    expect(html).toContain("Private publication");
    expect(html).toContain("in development");
    expect(html).not.toContain("10,000+");
  });
});

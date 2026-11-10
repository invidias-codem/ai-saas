import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Mineral/Copper public homepage routing", () => {
  const home = "app/[locale]/(home)/page.tsx";
  const oldHome = "app/[locale]/(landing)/page.tsx";
  const expert = "app/[locale]/(landing)/expert/v/[variant]/page.tsx";

  it("has one locale homepage with isolated navigation and crawlable canonical metadata", () => {
    expect(existsSync(join(process.cwd(), home))).toBe(true);
    expect(existsSync(join(process.cwd(), oldHome))).toBe(false);

    const page = source(home);
    expect(page).toContain('import { MineralLaunch }');
    expect(page).toContain('import "../(launch)/launch/launch.css"');
    expect(page).toContain("return <MineralLaunch />");
    expect(page).toContain('canonical: "/en"');
    expect(page).toContain("index: true");
    expect(page).toContain('if (locale !== "en") redirect("/en")');
  });

  it("never assigns the old A/B/C cookie or rewrites root visitors to an expert variant", () => {
    const proxy = source("proxy.ts");
    expect(proxy).not.toContain("lattice_landing_variant");
    expect(proxy).not.toContain("NextResponse.rewrite(");
    expect(proxy).not.toContain("isRootLocale");
    expect(proxy).toContain("res = intlMiddleware(req)");
    expect(proxy).toContain("'/expert(.*)'");
    expect(proxy).toContain("'/:locale(en|th|vi|es|fr|de)/expert(.*)'");
  });

  it("keeps expert variant deep links and static generation intact", () => {
    expect(existsSync(join(process.cwd(), expert))).toBe(true);
    const page = source(expert);
    expect(page).toContain('["a", "b", "c"]');
    expect(page).toContain("generateStaticParams");
    expect(page).toContain("notFound()");
  });

  it("retains the separate noindex launch preview and its shared design system", () => {
    const launch = source("app/[locale]/(launch)/launch/page.tsx");
    expect(launch).toContain("index: false");
    expect(launch).toContain("MineralLaunch");
    expect(existsSync(join(process.cwd(), "app/[locale]/(launch)/launch/launch.css"))).toBe(true);
  });
});

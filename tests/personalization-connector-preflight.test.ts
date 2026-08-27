import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { ensureChatGptPersonalizedConnectorAccess } from "../src/adapters/chatgpt-web/browser-worker";

test("already Personalized is a no-op", async () => {
  const diagnostics: string[] = [];
  const page = {
    getByRole: (_role: string, options: { name: string }) => {
      expect(options.name).toBe("Personalized");
      return { filter: () => ({ isVisible: async () => true }) };
    },
  } as any;
  await ensureChatGptPersonalizedConnectorAccess(page, async value => { diagnostics.push(value); });
  expect(diagnostics).toEqual(["personalization-already-enabled"]);
});

test("Unpersonalized is switched through its controlled menu", async () => {
  const events: string[] = [];
  const diagnostics: string[] = [];
  const personalized = {
    isVisible: async () => false,
    waitFor: async () => { events.push("verified"); },
  };
  const unpersonalized = {
    isVisible: async () => true,
    click: async () => { events.push("toggle"); },
    getAttribute: async (name: string) => {
      expect(name).toBe("aria-controls");
      return "personalization-menu";
    },
  };
  const choice = {
    waitFor: async () => { events.push("choice-visible"); },
    click: async () => { events.push("choice-clicked"); },
  };
  const menu = {
    waitFor: async () => { events.push("menu-visible"); },
    getByText: (text: string, options: { exact: boolean }) => {
      expect(text).toBe("Personalized");
      expect(options.exact).toBeTrue();
      return { last: () => choice };
    },
  };
  const page = {
    getByRole: (_role: string, options: { name: string }) => ({
      filter: () => options.name === "Personalized" ? personalized : unpersonalized,
    }),
    locator: (selector: string) => {
      expect(selector).toBe('[id="personalization-menu"]');
      return menu;
    },
  } as any;
  await ensureChatGptPersonalizedConnectorAccess(page, async value => { diagnostics.push(value); });
  expect(diagnostics).toEqual(["personalization-unpersonalized", "personalization-enabled"]);
  expect(events).toEqual(["toggle", "menu-visible", "choice-visible", "choice-clicked", "verified"]);
});

test("connector verification enables Personalized before selecting the connector", () => {
  const worker = readFileSync(new URL("../src/adapters/chatgpt-web/browser-worker.ts", import.meta.url), "utf8");
  const start = worker.indexOf("private async verifyConnectorExclusive(): Promise<string>");
  const end = worker.indexOf("private async inspectSessionExclusive", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  const verification = worker.slice(start, end);
  expect(verification).toContain("await this.prepareTemporaryChatSurface(page);");
  expect(verification).toContain("await ensureChatGptPersonalizedConnectorAccess(page);");
  expect(verification).toContain("await this.selectConnector(page);");
  expect(verification.indexOf("ensureChatGptPersonalizedConnectorAccess")).toBeLessThan(verification.indexOf("this.selectConnector(page)"));
});

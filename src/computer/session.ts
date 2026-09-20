import puppeteer, {
  type Browser,
  type Page,
  type CDPSession,
} from "puppeteer-core";
import { chromePath } from "./browser-path.js";
import { accessibilitySnapshot } from "./accessibility.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createObservation, type ScreenObservation } from "./observation.js";
export type ComputerAction = {
  operation: "click" | "type" | "select" | "scroll_down" | "scroll_up" | "wait";
  target?: string;
  text?: string;
  option?: string;
};
export class BrowserSession {
  private browser?: Browser;
  private page?: Page;
  private cdp?: CDPSession;
  private folder?: string;
  private timer?: NodeJS.Timeout;
  private allowedOrigin?: string;
  private observation?: {
    id: string;
    objectId: string;
    screen: ScreenObservation;
    domControls: ScreenObservation["controls"];
    axFingerprint?: string;
  };
  private count = 0;
  private busy = false;
  private generation = 0;
  private axEnabled = false;
  readonly history: {
    operation: string;
    target?: string;
    name?: string;
    context?: string[];
    at: string;
  }[] = [];
  constructor(
    private options: { headless?: boolean; executablePath?: string } = {},
  ) {}
  async start(url: string) {
    return this.locked(() => this.open(url));
  }
  private async open(url: string) {
    const generation = ++this.generation;
    if (this.browser) throw Error("Close the current dedicated session first.");
    const parsed = new URL(url);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password
    )
      throw Error(
        "Start with an HTTP or HTTPS URL without embedded credentials.",
      );
    const executablePath = chromePath(this.options.executablePath);
    if (!executablePath)
      throw Error(
        "Install Chrome/Chromium or set SYSONE_CHROME_PATH. No browser is downloaded.",
      );
    this.allowedOrigin = parsed.origin;
    const folder = await mkdtemp(join(tmpdir(), "sysone-computer-"));
    try {
      const launched = await puppeteer.launch({
        executablePath,
        userDataDir: folder,
        headless: this.options.headless ?? false,
        pipe: true,
        protocolTimeout: 5000,
        defaultViewport: { width: 1280, height: 800 },
        args: ["--disable-extensions", "--disable-sync", "--no-first-run"],
      });
      if (generation !== this.generation) {
        await launched.close();
        await rm(folder, { recursive: true, force: true });
        throw Error("Session startup was cancelled.");
      }
      this.browser = launched;
      this.folder = folder;
      this.page =
        (await this.browser.pages())[0] ?? (await this.browser.newPage());
      this.page.setDefaultTimeout(5000);
      this.page.setDefaultNavigationTimeout(15000);
      this.cdp = await this.page.createCDPSession();
      await this.cdp.send("Page.enable");
      this.axEnabled = await this.cdp.send("Accessibility.enable").then(
        () => true,
        () => false,
      );
      await this.cdp.send("Browser.setDownloadBehavior", { behavior: "deny" });
      await this.page.setRequestInterception(true);
      this.page.on("request", (request) => {
        if (
          request.isNavigationRequest() &&
          request.frame() === this.page?.mainFrame()
        ) {
          let allowed = false;
          try {
            allowed = new URL(request.url()).origin === parsed.origin;
          } catch {}
          if (!allowed) {
            void request.abort().catch(() => {});
            return;
          }
        }
        void request.continue().catch(() => {});
      });
      this.page.on("popup", (page) => {
        void page?.close().catch(() => {});
      });
      await this.page.goto(parsed.href, { waitUntil: "domcontentloaded" });
      if (generation !== this.generation)
        throw Error("Session startup was cancelled.");
      this.timer = setTimeout(() => {
        void this.close();
      }, 10 * 60_000);
      this.timer.unref();
      return {
        session: "dedicated-browser",
        origin: parsed.origin,
        expiresInSeconds: 600,
        limits:
          "Only this origin and this dedicated page. No existing browser profile, downloads or pop-up tabs. Actions require a fresh observation.",
      };
    } catch (error) {
      await this.close();
      await rm(folder, { recursive: true, force: true });
      throw error;
    }
  }
  private async locked<T>(fn: () => Promise<T>) {
    if (this.busy) throw Error("Another computer operation is running.");
    this.busy = true;
    try {
      return await fn();
    } finally {
      this.busy = false;
    }
  }
  async observe(screenshot = true) {
    return this.locked(async () => {
      if (!this.cdp || !this.page || this.page.isClosed())
        throw Error("Start a dedicated browser session first.");
      if (new URL(this.page.url()).origin !== this.allowedOrigin)
        throw Error(
          "The page left the allowed origin. Close this session and start again at the intended URL.",
        );
      if (++this.count > 150)
        throw Error(
          "Observation limit reached. Close and start a new session.",
        );
      await this.release();
      const tree = await this.cdp.send("Page.getFrameTree");
      const world = await this.cdp.send("Page.createIsolatedWorld", {
        frameId: tree.frameTree.frame.id,
        worldName: "sysone-observer",
        grantUniveralAccess: false,
      });
      const evaluated = await this.cdp.send("Runtime.evaluate", {
        expression: `(${createObservation.toString()})()`,
        contextId: world.executionContextId,
        returnByValue: false,
      });
      if (evaluated.exceptionDetails || !evaluated.result.objectId)
        throw Error("The page could not be observed.");
      const objectId = evaluated.result.objectId;
      const result = await this.cdp.send("Runtime.callFunctionOn", {
        objectId,
        functionDeclaration: "function(){return this.snapshot;}",
        returnByValue: true,
      });
      if (result.exceptionDetails) throw Error("The page observation failed.");
      const screen = result.result.value as ScreenObservation;
      const domControls = screen.controls;
      let axFingerprint: string | undefined;
      if (this.axEnabled) {
        try {
          const ax = await accessibilitySnapshot(
            this.cdp,
            objectId,
            domControls,
          );
          screen.controls = ax.controls;
          axFingerprint = ax.fingerprint;
          screen.accessibility = {
            status: "available",
            mappedControls: ax.controls.length,
            omittedControls: domControls.length - ax.controls.length,
          };
        } catch {
          screen.controls = domControls.map((c) => ({
            ...c,
            source: "dom-fallback",
          }));
        }
      }
      this.observation = {
        id: randomUUID(),
        objectId,
        screen,
        domControls,
        axFingerprint,
      };
      // Do not combine AX from one page revision with DOM from another.
      await this.checkDomFresh();
      const jpeg = screenshot
        ? await this.page.screenshot({ type: "jpeg", quality: 65 })
        : undefined;
      return {
        observationId: this.observation.id,
        screen,
        history: this.history.slice(-6),
        ...(jpeg ? { image: Buffer.from(jpeg).toString("base64") } : {}),
      };
    });
  }
  private async checkDomFresh() {
    if (!this.observation || !this.cdp) throw Error("Observe the page first.");
    let fresh = false;
    try {
      const r = await this.cdp.send("Runtime.callFunctionOn", {
        objectId: this.observation.objectId,
        functionDeclaration: "function(){return this.fresh();}",
        returnByValue: true,
      });
      fresh = r.result.value === true;
    } catch {}
    if (!fresh)
      throw Error(
        "The screen changed. Observe again before deciding or acting.",
      );
  }
  async current(id: string) {
    if (!this.observation || this.observation.id !== id || !this.cdp)
      throw Error("This observation is no longer current. Observe again.");
    const observation = this.observation;
    await this.checkDomFresh();
    if (observation.axFingerprint !== undefined) {
      let fingerprint: string | undefined;
      try {
        fingerprint = (
          await accessibilitySnapshot(
            this.cdp,
            observation.objectId,
            observation.domControls,
          )
        ).fingerprint;
      } catch {}
      if (fingerprint !== observation.axFingerprint)
        throw Error(
          "Accessibility state changed. Observe again before acting.",
        );
      await this.checkDomFresh();
    }
    if (this.observation !== observation)
      throw Error("This observation is no longer current. Observe again.");
    return observation.screen;
  }
  async act(id: string, action: ComputerAction) {
    return this.locked(async () => {
      const screen = await this.current(id);
      const target = screen.controls.find((c) => c.id === action.target);
      if (
        ["click", "type", "select"].includes(action.operation) &&
        (!target || target.kind !== action.operation)
      )
        throw Error(
          "Action was not admitted: incompatible or inaccessible target. Observe again.",
        );
      if (action.operation === "wait") {
        await new Promise((resolve) => setTimeout(resolve, 350));
        this.history.push({ operation: "wait", at: new Date().toISOString() });
        if (this.history.length > 12) this.history.shift();
        await this.release();
        return {
          executed: true,
          operation: "wait",
          next: "Observe again and check the result.",
        };
      }
      const r = await this.cdp!.send("Runtime.callFunctionOn", {
        objectId: this.observation!.objectId,
        functionDeclaration: "function(action){return this.act(action);}",
        arguments: [{ value: action }],
        returnByValue: true,
      });
      const result = r.result.value as
        | { ok?: boolean; reason?: string }
        | undefined;
      await this.release();
      if (r.exceptionDetails || !result?.ok)
        throw Error(
          `Action was not admitted: ${result?.reason || "screen changed"}. Observe again.`,
        );
      this.history.push({
        operation: action.operation,
        target: action.target,
        ...(target ? { name: target.name, context: target.context } : {}),
        at: new Date().toISOString(),
      });
      if (this.history.length > 12) this.history.shift();
      await new Promise((resolve) => setTimeout(resolve, 80));
      return {
        executed: true,
        operation: action.operation,
        next: "Observe again and independently verify the intended change.",
      };
    });
  }
  private async release() {
    if (this.observation && this.cdp)
      await this.cdp
        .send("Runtime.releaseObject", { objectId: this.observation.objectId })
        .catch(() => {});
    this.observation = undefined;
  }
  async close() {
    this.generation++;
    clearTimeout(this.timer);
    const browser = this.browser,
      folder = this.folder;
    this.browser = undefined;
    this.page = undefined;
    this.cdp = undefined;
    this.axEnabled = false;
    this.observation = undefined;
    this.folder = undefined;
    this.count = 0;
    this.history.length = 0;
    try {
      if (browser) {
        const timeout = setTimeout(
          () => browser.process()?.kill("SIGKILL"),
          5000,
        );
        timeout.unref();
        try {
          await browser.close();
        } finally {
          clearTimeout(timeout);
        }
      }
    } finally {
      if (folder) await rm(folder, { recursive: true, force: true });
    }
    return { closed: true };
  }
}

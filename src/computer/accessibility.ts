import type { CDPSession, Protocol } from "puppeteer-core";
import type { ScreenObservation } from "./observation.js";
type Control = ScreenObservation["controls"][number];
type AXNode = Protocol.Accessibility.AXNode;
const compact = (v: unknown, limit: number) =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, limit) : "";
const stateNames = new Set([
  "checked",
  "pressed",
  "expanded",
  "selected",
  "focused",
  "required",
  "invalid",
  "disabled",
  "readonly",
  "busy",
  "hasPopup",
]);
function describe(nodes: AXNode[]) {
  const node = nodes[0];
  if (!node) throw Error("No accessibility node returned.");
  const states: Record<string, string | boolean> = {};
  for (const p of node.properties ?? []) {
    const v = p.value.value;
    if (
      stateNames.has(p.name) &&
      (typeof v === "boolean" || typeof v === "string")
    )
      states[p.name] = typeof v === "string" ? v.slice(0, 40) : v;
  }
  const context = nodes
    .slice(1, 13)
    .filter(
      (n) =>
        !n.ignored &&
        [
          "dialog",
          "alertdialog",
          "form",
          "group",
          "region",
          "navigation",
          "menu",
          "toolbar",
          "tablist",
        ].includes(n.role?.value),
    )
    .map((n) => compact(n.name?.value, 80))
    .filter(Boolean)
    .slice(0, 2)
    .reverse();
  return {
    ignored: node.ignored,
    name: compact(node.name?.value, 80),
    role: compact(node.role?.value, 30),
    description: compact(node.description?.value, 160),
    context,
    states,
  };
}
/** Resolve retained DOM nodes, never names or model-generated selectors, through CDP. */
export async function accessibilitySnapshot(
  cdp: CDPSession,
  objectId: string,
  controls: Control[],
) {
  const remote = await cdp.send("Runtime.callFunctionOn", {
    objectId,
    functionDeclaration: "function(){return this.nodes;}",
    returnByValue: false,
  });
  const arrayId = remote.result.objectId;
  if (!arrayId) throw Error("Control bindings are unavailable.");
  const handles: string[] = [];
  try {
    const properties = await cdp.send("Runtime.getProperties", {
      objectId: arrayId,
      ownProperties: true,
    });
    for (let i = 0; i < controls.length; i++) {
      const handle = properties.result.find((p) => p.name === String(i))?.value
        ?.objectId;
      if (!handle) throw Error("A control binding is missing.");
      handles.push(handle);
    }
    const results = await Promise.all(
      handles.map(async (objectId) => {
        const { nodes } = await cdp.send(
          "Accessibility.getAXNodeAndAncestors",
          { objectId },
        );
        return describe(nodes);
      }),
    );
    const enriched: Control[] = [];
    results.forEach((ax, i) => {
      if (
        ax.ignored ||
        ax.states.disabled === true ||
        ax.states.disabled === "true" ||
        (controls[i].kind === "type" && ax.states.readonly === true)
      )
        return;
      enriched.push({
        ...controls[i],
        name: ax.name || controls[i].name,
        role: ax.role || controls[i].role,
        ...(ax.description ? { description: ax.description } : {}),
        ...(ax.context.length ? { context: ax.context } : {}),
        states: ax.states,
        source: "chrome-accessibility",
      });
    });
    return { controls: enriched, fingerprint: JSON.stringify(results) };
  } finally {
    await Promise.allSettled(
      [...handles, arrayId].map((objectId) =>
        cdp.send("Runtime.releaseObject", { objectId }),
      ),
    );
  }
}

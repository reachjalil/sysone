import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { BrowserSession } from "../dist/computer/session.js";
import {
  computerQuestions,
  adviseComputer,
} from "../dist/computer/decision.js";
import { runComputer } from "../dist/computer/run.js";
import { computerMcpServer } from "../dist/computer/mcp.js";
const html = `<!doctype html><title>Computer fixture</title><style>body{font:20px sans-serif;padding:30px}label,button,select{display:block;margin:15px}#covered{position:absolute;top:550px;left:40px}#overlay{position:absolute;top:550px;left:40px;width:200px;height:60px;background:#eee;z-index:4}</style><h1>Choose a preview</h1><label>Project name <input id="name"/></label><label>Private password <input type="password" value="private"/></label><label>Upload <input type="file"/></label><label>Mode<select id="mode"><option value="dark">Dark</option><option value="light">Light</option></select></label><button id="save">Save preview</button><button id="change">Change controls</button><a href="https://example.invalid/leave">Leave this origin</a><button id="covered">Covered target</button><div id="overlay"></div><p id="result">Not saved</p><script>document.querySelector('#save').onclick=()=>document.querySelector('#result').textContent='Saved '+document.querySelector('#name').value+' in '+document.querySelector('#mode').value;document.querySelector('#change').onclick=()=>document.querySelector('#save').textContent='Publish instead';</script>`;
async function fixture(fn) {
  const http = createServer((req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.end(html);
  });
  await new Promise((r) => http.listen(0, "127.0.0.1", r));
  const origin = `http://127.0.0.1:${http.address().port}`;
  const session = new BrowserSession({ headless: true });
  try {
    await fn(session, origin);
  } finally {
    await session.close();
    await new Promise((r) => http.close(r));
  }
}
const control = (screen, name) => screen.controls.find((c) => c.name === name);
test("dedicated browser observes images and real controls; text, choice and click take effect; old IDs expire", () =>
  fixture(async (s, url) => {
    await s.start(url);
    let o = await s.observe();
    assert.ok(Buffer.from(o.image, "base64").length > 1000);
    assert.equal(o.screen.title, "Computer fixture");
    assert.ok(
      !o.screen.controls.some((c) => /Private password|Upload/.test(c.name)),
    );
    const questions = computerQuestions(
      o.screen,
      "Save preview with project Alpha in light mode",
      [],
    );
    assert.equal(questions.questions.operation.type, "choice");
    assert.ok(questions.questions.click_target.criteria.none);
    assert.ok(!JSON.stringify(questions).includes("private"));
    await s.act(o.observationId, {
      operation: "type",
      target: control(o.screen, "Project name").id,
      text: "Alpha",
    });
    await assert.rejects(
      () => s.act(o.observationId, { operation: "click", target: "t1" }),
      /no longer current/,
    );
    o = await s.observe(false);
    assert.equal(control(o.screen, "Project name").value, "Alpha");
    const shared = JSON.parse(computerQuestions(o.screen, "Save Alpha", []).state);
    assert.equal(shared.page.controls.find(c => c.name === "Project name").value, "Alpha");
    assert.ok(shared.page.controls.find(c => c.name === "Mode").options.some(o => o.value === "light"));
    assert.equal(o.image, undefined);
    await s.act(o.observationId, {
      operation: "select",
      target: control(o.screen, "Mode").id,
      option: "light",
    });
    o = await s.observe(false);
    await s.act(o.observationId, {
      operation: "click",
      target: control(o.screen, "Save preview").id,
    });
    o = await s.observe(false);
    assert.match(o.screen.text, /Saved Alpha in light/);
  }));
test("covered and incompatible controls cannot execute; background changes invalidate the observation", () =>
  fixture(async (s, url) => {
    await s.start(url);
    let o = await s.observe(false);
    await assert.rejects(
      () =>
        s.act(o.observationId, {
          operation: "click",
          target: control(o.screen, "Covered target").id,
        }),
      /covered/,
    );
    o = await s.observe(false);
    await assert.rejects(
      () =>
        s.act(o.observationId, {
          operation: "type",
          target: control(o.screen, "Save preview").id,
          text: "No",
        }),
      /incompatible/,
    );
    o = await s.observe(false);
    await s.page.evaluate(
      () => (document.querySelector("#save").textContent = "Changed remotely"),
    );
    await assert.rejects(() => s.current(o.observationId), /screen changed/);
    o = await s.observe(false);
    await s.page.evaluate(() => {
      const old = document.querySelector("#save");
      old.replaceWith(old.cloneNode(true));
    });
    await assert.rejects(() => s.current(o.observationId), /screen changed/);
  }));
test("Jev advice uses offered targets, never executes, and rejects a stale or invented decision", () =>
  fixture(async (s, url) => {
    await s.start(url);
    const o = await s.observe(false),
      target = control(o.screen, "Save preview").id;
    let seen;
    const client = {
      run: async (_service, input) => {
        seen = input;
        return {
          result: {
            answers: {
              operation: {
                type: "choice",
                choice: "click",
                probabilities: { click: 0.9 },
              },
              click_target: { type: "choice", choice: target },
            },
          },
        };
      },
    };
    const advice = await adviseComputer(
      s,
      client,
      o.observationId,
      "Save the preview",
    );
    assert.equal(advice.status, "proposed");
    assert.equal(advice.proposal.target, target);
    assert.ok(!JSON.stringify(seen).includes("data:image"));
    assert.match((await s.current(o.observationId)).text, /Not saved/);
    const forged = {
      run: async () => ({
        result: {
          answers: {
            operation: { type: "choice", choice: "click" },
            click_target: { type: "choice", choice: "t99" },
          },
        },
      }),
    };
    await assert.rejects(
      () => adviseComputer(s, forged, o.observationId, "Save"),
      /unoffered/,
    );
    const late = {
      run: async () => {
        await s.page.evaluate(
          () => (document.querySelector("#result").textContent = "Changed"),
        );
        return {
          result: {
            answers: { operation: { type: "choice", choice: "wait" } },
          },
        };
      },
    };
    assert.equal(
      (await adviseComputer(s, late, o.observationId, "Save")).status,
      "stale",
    );
  }));
test("companion MCP exposes screenshot content and bounded actions beside existing engine tools", () =>
  fixture(async (_s, url) => {
    const { server } = computerMcpServer(
      { url: "https://engine.invalid", token: "fixture" },
      { headless: true },
    );
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "browser-test", version: "1" });
    await server.connect(a);
    await client.connect(b);
    try {
      const tools = await client.listTools();
      assert.ok(tools.tools.some((t) => t.name === "sysone_run"));
      assert.ok(tools.tools.some((t) => t.name === "sysone_computer_decide"));
      assert.ok(
        !(
          await client.callTool({
            name: "sysone_computer_start",
            arguments: { url },
          })
        ).isError,
      );
      const result = await client.callTool({
        name: "sysone_computer_observe",
        arguments: {},
      });
      assert.ok(
        result.content.some(
          (c) => c.type === "image" && c.mimeType === "image/jpeg",
        ),
      );
      assert.ok(result.structuredContent.observationId);
      const bad = await client.callTool({
        name: "sysone_computer_act",
        arguments: {
          observationId: result.structuredContent.observationId,
          operation: "click",
          target: "t99",
        },
      });
      assert.equal(bad.isError, true);
      await client.callTool({ name: "sysone_computer_close", arguments: {} });
    } finally {
      await client.close();
      await server.close();
    }
  }));
test("dedicated session blocks navigation outside its initial origin", () =>
  fixture(async (s, url) => {
    await s.start(url);
    const o = await s.observe(false);
    await s.act(o.observationId, {
      operation: "click",
      target: control(o.screen, "Leave this origin").id,
    });
    await new Promise((r) => setTimeout(r, 100));
    assert.notEqual(s.page.url(), "https://example.invalid/leave");
  }));

const runOptions = {
  goal: "Save the preview as Alpha in light mode",
  maxSteps: 6,
  minimumProbability: 0.8,
  allowedOperations: ["type", "select", "click", "wait"],
  fields: [{ name: "Project name", text: "Alpha" }],
  selections: [{ name: "Mode", option: "light" }],
};
function scripted(choices) {
  let i = 0;
  return {
    run: async (_service, input) => {
      const [operation, name, p = 0.99] =
        choices[Math.min(i++, choices.length - 1)];
      const target = name
        ? Object.entries(input.questions[operation + "_target"].criteria).find(
            ([, v]) => v.includes(": " + name + ";"),
          )?.[0]
        : undefined;
      return {
        requestId: "fixture-" + i,
        meta: { calls: 1 },
        result: {
          answers: {
            operation: {
              type: "choice",
              choice: operation,
              probabilities: { [operation]: p },
            },
            ...(target
              ? {
                  [operation + "_target"]: {
                    type: "choice",
                    choice: target,
                    probabilities: { [target]: p },
                  },
                }
              : {}),
          },
        },
      };
    },
  };
}
test("bounded loop executes a caller-supplied form sequence and returns a final screenshot for independent verification", () =>
  fixture(async (s, url) => {
    await s.start(url);
    const result = await runComputer(
      s,
      scripted([
        ["type", "Project name"],
        ["select", "Mode"],
        ["click", "Save preview"],
        ["done"],
      ]),
      runOptions,
    );
    assert.equal(result.stop, "verify_completion");
    assert.equal(result.verified, false);
    assert.equal(result.actionsExecuted, 3);
    assert.equal(result.decisionRequests, 4);
    assert.match(result.final.screen.text, /Saved Alpha in light/);
    assert.ok(result.final.image);
  }));
test("loop stops on uncertainty, missing text, disallowed actions and repeated unchanged screens", () =>
  fixture(async (s, url) => {
    await s.start(url);
    let result = await runComputer(
      s,
      scripted([["click", "Save preview", 0.6]]),
      runOptions,
    );
    assert.equal(result.stop, "uncertain");
    assert.equal(result.actionsExecuted, 0);
    result = await runComputer(s, scripted([["type", "Project name"]]), {
      ...runOptions,
      fields: [],
    });
    assert.equal(result.stop, "needs_field_text");
    assert.equal(result.actionsExecuted, 0);
    result = await runComputer(s, scripted([["click", "Save preview"]]), {
      ...runOptions,
      allowedOperations: ["wait"],
    });
    assert.equal(result.stop, "operation_not_allowed");
    result = await runComputer(s, scripted([["wait"]]), runOptions);
    assert.equal(result.stop, "no_visible_progress");
    assert.equal(result.actionsExecuted, 2);
  }));
test("cancellation after inference cannot execute the returned action", () =>
  fixture(async (s, url) => {
    await s.start(url);
    const controller = new AbortController();
    const base = scripted([["click", "Save preview"]]);
    const client = {
      run: async (...args) => {
        const result = await base.run(...args);
        controller.abort();
        return result;
      },
    };
    const result = await runComputer(s, client, runOptions, controller.signal);
    assert.equal(result.stop, "cancelled");
    assert.equal(result.actionsExecuted, 0);
    assert.match(result.final.screen.text, /Not saved/);
  }));
test("changing a link destination or hidden form value invalidates the observation", () =>
  fixture(async (s, url) => {
    await s.start(url);
    let o = await s.observe(false);
    await s.page.evaluate(
      () => (document.querySelector("a").href = "/changed"),
    );
    await assert.rejects(() => s.current(o.observationId), /screen changed/);
    await s.page.evaluate(() => {
      const form = document.createElement("form");
      form.innerHTML =
        '<input name="scope" type="hidden" value="one"><button>Submit scope</button>';
      document.body.prepend(form);
    });
    o = await s.observe(false);
    await s.page.evaluate(
      () => (document.querySelector('input[name="scope"]').value = "two"),
    );
    await assert.rejects(() => s.current(o.observationId), /screen changed/);
  }));

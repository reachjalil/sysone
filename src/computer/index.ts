/** Dedicated-browser companion. Provider credentials and the engine stay separate. */
export { BrowserSession, type ComputerAction } from "./session.js";
export { computerQuestions, adviseComputer } from "./decision.js";
export { runComputer, type RunOptions } from "./run.js";
export type { ScreenObservation } from "./observation.js";

export { computerDoctor } from "./doctor.js";
export { desktopDoctor, observeDesktop } from "./desktop.js";

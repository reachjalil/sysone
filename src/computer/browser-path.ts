import { existsSync } from "node:fs";
import { join } from "node:path";
export function chromePath(explicit?: string) {
  return (
    explicit ||
    process.env.SYSONE_CHROME_PATH ||
    [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/usr/bin/google-chrome",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      join(
        process.env.PROGRAMFILES || "C:\\Program Files",
        "Google",
        "Chrome",
        "Application",
        "chrome.exe",
      ),
    ].find(existsSync)
  );
}

import { spawn } from "node:child_process";

export const openBrowser = async (url: string): Promise<void> => {
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return;
  }

  const platform = process.platform;

  if (platform === "darwin") {
    spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    return;
  }

  if (platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    return;
  }

  spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
};

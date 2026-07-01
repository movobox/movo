import { notarize } from "@electron/notarize";
import { execFileSync } from "node:child_process";

export default async function notarizing(context) {
  if (process.platform !== "darwin") return;

  const { APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID, CSC_LINK, CSC_KEY_PASSWORD } = process.env;
  if (!APPLE_ID || !APPLE_APP_SPECIFIC_PASSWORD || !APPLE_TEAM_ID) {
    console.warn("[notarize] Skipping macOS notarization because Apple credentials are not configured.");
    return;
  }
  if (!CSC_LINK || !CSC_KEY_PASSWORD) {
    console.warn("[notarize] Skipping macOS notarization because signing certificate secrets are not configured.");
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${context.appOutDir}/${appName}.app`;
  try {
    execFileSync("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath], { stdio: "pipe" });
  } catch {
    console.warn("[notarize] Skipping macOS notarization because the app bundle is not signed correctly.");
    return;
  }

  console.log(`[notarize] Submitting ${appPath} to Apple notarization.`);

  await notarize({
    appBundleId: context.packager.appInfo.appId,
    appPath,
    appleId: APPLE_ID,
    appleIdPassword: APPLE_APP_SPECIFIC_PASSWORD,
    teamId: APPLE_TEAM_ID
  });
}

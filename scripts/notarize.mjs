import { notarize } from "@electron/notarize";

export default async function notarizing(context) {
  if (process.platform !== "darwin") return;

  const { APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID } = process.env;
  if (!APPLE_ID || !APPLE_APP_SPECIFIC_PASSWORD || !APPLE_TEAM_ID) {
    console.warn("[notarize] Skipping macOS notarization because Apple credentials are not configured.");
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${context.appOutDir}/${appName}.app`;
  console.log(`[notarize] Submitting ${appPath} to Apple notarization.`);

  await notarize({
    appBundleId: context.packager.appInfo.appId,
    appPath,
    appleId: APPLE_ID,
    appleIdPassword: APPLE_APP_SPECIFIC_PASSWORD,
    teamId: APPLE_TEAM_ID
  });
}

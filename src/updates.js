export const UPDATE_REPOSITORY = "chungcy00/SQLIsland";
export async function fetchLatestUpdate(fetcher = fetch) {
  const response = await fetcher(
    `https://api.github.com/repos/${UPDATE_REPOSITORY}/releases/latest`,
  );
  if (response.status === 404) return null;
  if (!response.ok)
    throw new Error(`更新服务器返回 ${response.status}，请稍后重试。`);
  const data = await response.json();
  const asset = data.assets?.find((asset) => asset.name === "update.json");
  if (!asset) throw new Error("该版本缺少 update.json 更新清单。");
  const manifestResponse = await fetcher(asset.browser_download_url);
  if (!manifestResponse.ok) throw new Error("无法读取更新清单，请稍后重试。");
  const manifest = await manifestResponse.json();
  if (
    !Number.isSafeInteger(manifest.versionCode) ||
    manifest.versionCode < 1 ||
    typeof manifest.versionName !== "string" ||
    !manifest.versionName.trim()
  )
    throw new Error("版本信息不完整。");
  if (!/^[a-f0-9]{64}$/i.test(manifest.sha256 || ""))
    throw new Error("更新清单缺少有效的 SHA-256。");
  if (new URL(manifest.apkUrl).protocol !== "https:")
    throw new Error("更新地址需要使用 HTTPS。");
  return manifest;
}

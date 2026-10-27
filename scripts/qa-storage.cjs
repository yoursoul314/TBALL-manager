// Decode storage in isolated QA only; never intercept application storage APIs.
async function installStorageReader(page) {
  await page.addInitScript({ path: require.resolve('lz-string') });
  await page.addInitScript(() => {
    window.__qaDecodeWorkspace = raw => {
      const parsed = JSON.parse(raw);
      return parsed?.format === 'tb-manager-compressed-json'
        ? JSON.parse(window.LZString.decompressFromUTF16(parsed.payload)) : parsed;
    };
  });
}
module.exports = { installStorageReader };

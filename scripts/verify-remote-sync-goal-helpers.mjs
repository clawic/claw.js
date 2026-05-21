export function createRemoteSyncVerifierHelpers({ fs, path, rootDir, failures }) {
  function fail(message) {
    failures.push(message);
  }

  function readRequired(relativePath) {
    const fullPath = path.join(rootDir, relativePath);
    if (!fs.existsSync(fullPath)) {
      fail(`missing required file ${relativePath}`);
      return "";
    }
    return fs.readFileSync(fullPath, "utf8");
  }

  function readRequiredJson(relativePath) {
    const text = readRequired(relativePath);
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      fail(`${relativePath} must be valid JSON`);
      return {};
    }
  }

  function requireText(label, text, needle) {
    if (!text.includes(needle)) fail(`${label} must include ${needle}`);
  }

  function requireSameOrderedList(label, actual, expected) {
    const actualList = Array.isArray(actual) ? actual : [];
    if (actualList.join(",") !== expected.join(",")) {
      fail(`${label} must be ${expected.join(",")} but was ${actualList.join(",")}`);
    }
  }

  function extractTableIds(text, prefix) {
    return new Set([...text.matchAll(new RegExp(`\\|\\s*(${prefix}-\\d{3})\\s*\\|`, "g"))].map((match) => match[1]));
  }

  return { fail, readRequired, readRequiredJson, requireText, requireSameOrderedList, extractTableIds };
}

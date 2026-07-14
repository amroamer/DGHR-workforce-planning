// Reset the canonical demo scenario before the suite (clean start) and again after
// (wipe any data the tests mutated), so the app is left in the pristine §7 state.
async function reset() {
  try {
    await fetch("http://localhost:8010/api/demo/reset", { method: "POST" });
    // eslint-disable-next-line no-console
    console.log("[e2e] demo data reset");
  } catch {
    // eslint-disable-next-line no-console
    console.log("[e2e] WARN: could not reach reset endpoint");
  }
}

export default reset;
export const teardown = reset;

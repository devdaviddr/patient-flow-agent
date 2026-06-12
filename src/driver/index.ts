// Public surface of the driver. Note: the SDK adapter is intentionally NOT
// re-exported here — it is loaded lazily by the Driver, so importing this barrel
// (e.g. in tests) never pulls in the OpenCode SDK.

export * from "./types"
export { Driver, type DriverDeps } from "./driver"
export { parsePlan, extractJson } from "./plan"
export { DecisionLog } from "./records"
export { getDriver, resetDriver } from "./instance"

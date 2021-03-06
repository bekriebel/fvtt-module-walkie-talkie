import { MODULE_NAME } from "./constants.js";
import * as helpers from "./helpers.js";
import * as log from "./logging.js";

export default function registerModuleSettings() {
  helpers.registerModuleSetting({
    name: "toggleBroadcast",
    scope: "client",
    config: true,
    default: false,
    type: Boolean,
    onChange: () => window.location.reload(),
  });

  helpers.registerModuleSetting({
    name: "disableAvClient",
    scope: "client",
    config: !game.settings.get(MODULE_NAME, "toggleBroadcast"),
    default: true,
    type: Boolean,
    onChange: () => {},
  });

  // Register debug logging setting
  helpers.registerModuleSetting({
    name: "debug",
    scope: "world",
    config: true,
    default: false,
    type: Boolean,
    onChange: (value) => log.setDebug(value),
  });

  // Set the initial debug level
  log.setDebug(game.settings.get(MODULE_NAME, "debug"));
}

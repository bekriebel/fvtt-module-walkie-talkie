import { MODULE_NAME } from "./constants.js";
import registerModuleSettings from "./registerModuleSettings.js";
import * as log from "./logging.js";

/* -------------------------------------------- */
/*  Hook calls                                  */
/* -------------------------------------------- */

Hooks.once("init", () => {
  // Register module settings
  registerModuleSettings();

  Hooks.on("renderPlayerList", globalThis.walkieTalkie._onRenderPlayerList.bind(globalThis.walkieTalkie));

  Hooks.on("rtcSettingsChanged", globalThis.walkieTalkie._onRtcSettingsChanged.bind(globalThis.walkieTalkie));
});

Hooks.on("ready", () => {
  // Set up socket listeners
  game.socket.on(`module.${MODULE_NAME}`, (request, userId) => {
    log.debug("Socket event:", request, "from:", userId);
    switch (request.action) {
      case "peer-signal":
        // Ignore requests that aren't for us.
        if (request.userId === game.user.id) {
          globalThis.walkieTalkie.signal(userId, request.data);
        }
        break;
      case "peer-close":
        // Ignore requests that aren't for us.
        if (request.userId === game.user.id) {
          globalThis.walkieTalkie.closePeer(userId);
        }
        break;
      case "peer-broadcasting":
        // Ignore requests that aren't for us.
        if (request.userId === game.user.id) {
          globalThis.walkieTalkie._remoteBroadcasting(userId, request.broadcasting);
        }
        break;
      default:
        log.warn("Unknown socket event:", request);
    }
  });

  // Break down peer when the window is closed
  window.addEventListener("beforeunload", globalThis.walkieTalkie.closeAllPeers.bind(globalThis.walkieTalkie));

  // Request media access up front
  navigator.mediaDevices.getUserMedia({
    video: false,
    audio: true,
  }).then(() => {
    log.debug("Audio stream request succeeded");
  }).catch((err) => {
    log.error("Error getting audio device:", err);
  });
});

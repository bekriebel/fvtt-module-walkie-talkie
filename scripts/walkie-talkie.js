let walkieTalkie = null;

class WalkieTalkie {
  constructor() {
    this.peers = new Map();
    this.audioElements = new Map();
    this.remoteStreams = new Map();
    this.localStreams = new Map();
    this.talkieButtons = new Map();
    this.savedAvEnabledState = false;
  }

  // Module Code
  setupPeer(userId, isInitiator = false) {
    this.peers.set(userId, new SimplePeer({
      initiator: isInitiator,
      stream: false,
    }));

    this.peers.get(userId).on("signal", (data) => {
      this.debug("SimplePeer signal (", userId, "):", data);
      game.socket.emit("module.walkie-talkie", {
        action: "peer-signal",
        userId,
        data,
      });
    });

    this.peers.get(userId).on("connect", () => {
      this.debug("SimplePeer connect (", userId, ")");
      this.talkieButtons.get(userId).addClass("walkie-talkie-peer-connected");
      this._createUserAudio(userId);
    });

    this.peers.get(userId).on("data", (data) => {
      this.info("SimplePeer data (", userId, "):", data.toString());
    });

    this.peers.get(userId).on("stream", (stream) => {
      // got remote video stream, now let's show it in a video tag
      this.debug("SimplePeer stream (", userId, "):", stream);

      this.remoteStreams.set(userId, stream);
      this._setAudioElementStream(userId);
    });

    this.peers.get(userId).on("close", () => {
      this.debug("SimplePeer close (", userId, ")");
      this.closePeer(userId);
    });

    this.peers.get(userId).on("error", (err) => {
      if (err.code === "ERR_DATA_CHANNEL") {
        this.warn("Peer connection closed (", userId, ")");
      } else {
        this.onError("SimplePeer error (", userId, "):", err);
      }

      if (!this.peers.get(userId).connected) {
        this.closePeer(userId);
      }
    });

    ui.players.render();
  }

  signal(userId, data) {
    // If a peered connection isn't established yet, create one
    if (!this.peers.has(userId)) {
      this.setupPeer(userId, false);
    }
    this.peers.get(userId).signal(data);
  }

  initPeer(userId) {
    if (!this.peers.has(userId) || !this.peers.get(userId).connected) {
      this.setupPeer(userId, true);
    } else {
      this.warn("initPeer: Peer already exists for", userId);
    }
  }

  send(userId, data) {
    if (this.peers.has(userId) && this.peers.get(userId).connected) {
      this.peers.get(userId).send(data);
    }
  }

  closePeer(userId) {
    this.audioElements.delete(userId);

    if (this.remoteStreams.has(userId)) {
      this.remoteStreams.get(userId).getTracks().forEach((remoteStream) => {
        remoteStream.stop();
      });
    }
    this.remoteStreams.delete(userId);

    if (this.localStreams.has(userId)) {
      this.localStreams.get(userId).getTracks().forEach((localStream) => {
        localStream.stop();
      });
    }
    this.talkieButtons.get(userId).removeClass("walkie-talkie-stream-broadcasting");
    this.talkieButtons.get(userId).removeClass("walkie-talkie-stream-connected");
    this.localStreams.delete(userId);

    if (this.peers.has(userId)) {
      this.peers.get(userId).destroy();
    }
    this.talkieButtons.get(userId).removeClass("walkie-talkie-peer-connected");
    this.peers.delete(userId);
  }

  isLocalStreamEnabled(userId) {
    // If we don't have a local stream, return false
    if (!this.localStreams.has(userId)) {
      return false;
    }

    const localTracks = this.localStreams.get(userId).getTracks();
    return localTracks.some((localTrack) => localTrack.enabled === true);
  }

  enableLocalStream(userId, enable = false) {
    // The peers & streams aren't connected, skip managing them
    if (!this.peers.has(userId) || !this.localStreams.has(userId)) {
      if (this.peers.has(userId) && enable) {
        this.warn(game.i18n.localize("WALKIE-TALKIE.captureErrorAudio"));
        ui.notifications.warn(game.i18n.localize("WALKIE-TALKIE.captureErrorAudio"));
      }

      return;
    }

    // Get all local tracks
    const localTracks = this.localStreams.get(userId).getTracks();

    // Only act if any of the tracks need to be enabled/disabled
    if (this.isLocalStreamEnabled(userId) !== enable) {
      // Enable/disable each of the tracks
      localTracks.forEach((localStream) => {
        localStream.enabled = enable;
      });

      // Send a signal to the remote client
      game.socket.emit("module.walkie-talkie", {
        action: "peer-broadcasting",
        userId,
        broadcasting: enable,
      });

      // Disable/Enable other AV client
      this._disableAvClient(enable);
    }

    // Set the button class for coloration
    if (enable) {
      this.talkieButtons.get(userId).addClass("walkie-talkie-stream-broadcasting");
    } else {
      this.talkieButtons.get(userId).removeClass("walkie-talkie-stream-broadcasting");
    }
  }

  toggleLocalStream(userId) {
    this.enableLocalStream(userId, !this.isLocalStreamEnabled(userId));
  }

  closeAllPeers() {
    if (this.peers) {
      this.peers.forEach((peer, userId) => {
        this.debug("Closing peer (", userId, ")");
        // Send signal to remotes
        game.socket.emit("module.walkie-talkie", {
          action: "peer-close",
          userId,
        });
        // Close our local peer
        this.closePeer(userId);
      });
    }
  }

  _onRenderPlayerList(playerList, html, players) {
    html.find("#player-list").children().each((index, playerHtml) => {
      const user = players.users[index];
      if (!user.isSelf && user.active) {
        const playerActiveIcon = $(playerHtml).children(".player-active");
        this._addTalkieButton(playerActiveIcon, user.id);
      }
    });
  }

  _addTalkieButton(playerActiveIcon, userId) {
    // Create the button if it doesn't exist
    if (!this.talkieButtons.has(userId)) {
      const talkieButton = $('<a class="walkie-talkie-button" title="Walkie-Talkie"><i class="fas fa-microphone-alt"></i></a>');
      this.talkieButtons.set(userId, talkieButton);
    }

    if (!game.settings.get("walkie-talkie", "toggleBroadcast")) {
      this.talkieButtons.get(userId).on("mousedown", () => {
        this.enableLocalStream(userId, true);
      });

      this.talkieButtons.get(userId).on("mouseup", () => {
        this.enableLocalStream(userId, false);
      });

      this.talkieButtons.get(userId).on("mouseleave", () => {
        this.enableLocalStream(userId, false);
      });
    }

    this.talkieButtons.get(userId).on("click", () => {
      if (!this.peers.has(userId) || !this.peers.get(userId).connected) {
        this.initPeer(userId);
      } else if (game.settings.get("walkie-talkie", "toggleBroadcast")) {
        this.toggleLocalStream(userId);
      }
    });

    playerActiveIcon.after(this.talkieButtons.get(userId));
    this._addUserAudioElement(userId, this.talkieButtons.get(userId));
  }

  _remoteBroadcasting(userId, broadcasting) {
    if (broadcasting) {
      this.talkieButtons.get(userId).addClass("walkie-talkie-stream-receiving");
    } else {
      this.talkieButtons.get(userId).removeClass("walkie-talkie-stream-receiving");
    }
  }

  /**
   * Obtain a reference to the video.user-audio which plays the audio channel for a requested
   * Foundry User.
   * If the element doesn't exist, but a video element does, it will create it.
   * @param {string} userId                   The ID of the User entity
   * @param {HTMLVideoElement} videoElement   The HTMLVideoElement of the user
   * @return {HTMLVideoElement|null}
   */
  _addUserAudioElement(userId, buttonElement = null) {
    let audioElement = null;
    const audioSink = game.webrtc.settings.get("client", "audioSink");

    // If one doesn't exist, create it
    if (buttonElement) {
      // Configure audio element
      audioElement = document.createElement("audio");
      audioElement.className = "player-walkie-talkie-audio";
      audioElement.autoplay = true;
      if (typeof audioElement.sinkId !== "undefined") {
        audioElement.setSinkId(audioSink).then(() => {
          this.debug("Audio output set:", audioSink);
        }).catch((err) => {
          this.onError("Error setting audio output device:", err);
        });
      } else {
        this.debug("Browser does not support output device selection");
      }
      // Place the audio element after the button
      buttonElement.after(audioElement);
    }

    if (audioElement) {
      this.audioElements.set(userId, audioElement);
      if (this.remoteStreams.has(userId)) {
        this._setAudioElementStream(userId);
      }
    }
  }

  _createUserAudio(userId) {
    // Get configured audio source
    const audioSrc = game.webrtc.settings.get("client", "audioSrc");

    if (!audioSrc) {
      this.warn("Audio input source disabled");
      return;
    }

    if (this.localStreams.has(userId)) {
      this.debug("Adding user audio to stream (", userId, ")");
      this.peers.get(userId).addStream(this.localStreams.get(userId));
      this.savedAvEnabledState = !game.webrtc.settings.get("client", `users.${game.user.id}.muted`);
      this.enableLocalStream(userId, false);
    } else {
      navigator.mediaDevices.getUserMedia({
        video: false,
        audio: { deviceId: game.webrtc.settings.get("client", "audioSrc") },
      }).then((localStream) => {
        this.debug("Got user audio:", localStream);
        this.localStreams.set(userId, localStream);

        this.debug("Adding user audio to stream (", userId, ")");
        this.peers.get(userId).addStream(this.localStreams.get(userId));
        this.savedAvEnabledState = !game.webrtc.settings.get("client", `users.${game.user.id}.muted`);
        this.enableLocalStream(userId, false);
        this.talkieButtons.get(userId).addClass("walkie-talkie-stream-connected");
      }).catch((err) => {
        this.onError("Error getting audio device:", err);
      });
    }
  }

  _setAudioElementStream(userId) {
    const audioElement = this.audioElements.get(userId);
    const stream = this.remoteStreams.get(userId);
    if ("srcObject" in audioElement) {
      audioElement.srcObject = stream;
    } else {
      audioElement.src = window.URL.createObjectURL(stream); // for older browsers
    }

    audioElement.play();
  }

  _disableAvClient(disable) {
    // Don't disable the AV client if the setting is off or the toggleBroadcast option is on
    if (!game.settings.get("walkie-talkie", "disableAvClient") || game.settings.get("walkie-talkie", "toggleBroadcast")) {
      return;
    }

    // Get state of webrtc audio
    const isAudioEnabled = !game.webrtc.settings.get("client", `users.${game.user.id}.muted`);

    if (disable) {
      this.savedAvEnabledState = isAudioEnabled;
      if (this.savedAvEnabledState) {
        this.debug("Disabling AV client audio");
        game.webrtc.settings.set("client", `users.${game.user.id}.muted`, true);
        // TODO: trigger refresh view for webrtc video window for mute icon
      }
    } else if (this.savedAvEnabledState !== isAudioEnabled) {
      this.debug("Enabling AV client audio");
      game.webrtc.settings.set("client", `users.${game.user.id}.muted`, !this.savedAvEnabledState);
      // TODO: trigger refresh view for webrtc video window for mute icon
    }
  }

  _onRtcSettingsChanged(rtcSettings, changed) {
    const keys = Object.keys(flattenObject(changed));

    // Change audio source or sink
    if (keys.some((k) => ["client.audioSink", "client.audioSrc"].includes(k))) {
      this.debug("Audio device changed, closing existing connections", changed);
      this.closeAllPeers();
    }
  }

  /* -------------------------------------------- */
  /*  Logging Methods                             */
  /* -------------------------------------------- */

  /**
   * Display debug messages on the console if debugging is enabled
   * @param {...*} args      Arguments to console.debug
   */
  debug(...args) {
    if (game.settings.get("walkie-talkie", "debug")) console.debug("Walkie-Talkie | ", ...args);
  }

  /**
   * Display info messages on the console if debugging is enabled
   * @param {...*} args      Arguments to console.info
   */
  info(...args) {
    if (game.settings.get("walkie-talkie", "debug")) console.info("Walkie-Talkie | ", ...args);
  }

  /**
   * Display warning messages on the console
   * @param {...*} args      Arguments to console.warn
   */
  warn(...args) {
    console.warn("Walkie-Talkie | ", ...args);
  }

  /**
   * Display error messages on the console
   * @param {...*} args      Arguments to console.error
   */
  onError(...args) {
    console.error("Walkie-Talkie | ", ...args);
  }
}

/* -------------------------------------------- */
/*  Hook calls                                  */
/* -------------------------------------------- */

Hooks.on("init", () => {
  game.settings.register("walkie-talkie", "toggleBroadcast", {
    name: "WALKIE-TALKIE.toggleBroadcast",
    hint: "WALKIE-TALKIE.toggleBroadcastHint",
    scope: "client",
    config: true,
    default: false,
    type: Boolean,
    onChange: () => window.location.reload(),
  });
  game.settings.register("walkie-talkie", "disableAvClient", {
    name: "WALKIE-TALKIE.disableAvClient",
    hint: "WALKIE-TALKIE.disableAvClientHint",
    scope: "client",
    config: !game.settings.get("walkie-talkie", "toggleBroadcast"),
    default: true,
    type: Boolean,
    onChange: () => {},
  });
  game.settings.register("walkie-talkie", "debug", {
    name: "WALKIE-TALKIE.debug",
    hint: "WALKIE-TALKIE.debugHint",
    scope: "world",
    config: true,
    default: false,
    type: Boolean,
    onChange: () => {},
  });

  walkieTalkie = new WalkieTalkie();

  Hooks.on("renderPlayerList", walkieTalkie._onRenderPlayerList.bind(walkieTalkie));

  Hooks.on("rtcSettingsChanged", walkieTalkie._onRtcSettingsChanged.bind(walkieTalkie));
});

Hooks.on("ready", () => {
  // Set up socket listeners
  game.socket.on("module.walkie-talkie", (request, userId) => {
    walkieTalkie.debug("Socket event:", request, "from:", userId);
    switch (request.action) {
      case "peer-signal":
        // Ignore requests that aren't for us.
        if (request.userId === game.user.id) {
          walkieTalkie.signal(userId, request.data);
        }
        break;
      case "peer-close":
        // Ignore requests that aren't for us.
        if (request.userId === game.user.id) {
          walkieTalkie.closePeer(userId);
        }
        break;
      case "peer-broadcasting":
        // Ignore requests that aren't for us.
        if (request.userId === game.user.id) {
          walkieTalkie._remoteBroadcasting(userId, request.broadcasting);
        }
        break;
      default:
        walkieTalkie.warn("Unknown socket event:", request);
    }
  });

  // Break down peer when the window is closed
  window.addEventListener("beforeunload", walkieTalkie.closeAllPeers.bind(walkieTalkie));

  // Request media access up front
  navigator.mediaDevices.getUserMedia({
    video: false,
    audio: true,
  }).then(() => {
    walkieTalkie.debug("Audio stream request succeeded");
  }).catch((err) => {
    walkieTalkie.onError("Error getting audio device:", err);
  });
});

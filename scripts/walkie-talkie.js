let walkieTalkie = null;

class WalkieTalkie {
  constructor() {
    this.peers = new Map();
    this.audioElements = new Map();
    this.remoteStreams = new Map();
    this.localStreams = new Map();
    this.talkieButtons = new Map();
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

  enableLocalStream(userId, enable = false) {
    if (this.peers.has(userId) && this.localStreams.has(userId)) {
      // Enable each of the tracks
      this.localStreams.get(userId).getTracks().forEach((localStream) => {
        if (localStream.enabled !== enable) {
          localStream.enabled = enable;
          game.socket.emit("module.walkie-talkie", {
            action: "peer-broadcasting",
            userId,
            broadcasting: enable,
          });
        }
      });

      // Set the button class for colouration
      if (enable) {
        this.talkieButtons.get(userId).addClass("walkie-talkie-stream-broadcasting");
      } else {
        this.talkieButtons.get(userId).removeClass("walkie-talkie-stream-broadcasting");
      }
    }
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
      this.debug("talkieButton", talkieButton);
    }

    this.talkieButtons.get(userId).on("mousedown", () => {
      this.enableLocalStream(userId, true);
    });

    this.talkieButtons.get(userId).on("mouseup", () => {
      this.enableLocalStream(userId, false);
    });

    this.talkieButtons.get(userId).on("mouseleave", () => {
      this.enableLocalStream(userId, false);
    });

    this.talkieButtons.get(userId).on("click", () => {
      if (!this.peers.has(userId) || !this.peers.get(userId).connected) {
        this.initPeer(userId);
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

    // If one doesn't exist, create it
    if (buttonElement) {
      audioElement = document.createElement("audio");
      audioElement.className = "player-walkie-talkie-audio";
      audioElement.autoplay = true;
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
    if (this.localStreams.has(userId)) {
      this.debug("Adding user audio to stream (", userId, ")");
      this.peers.get(userId).addStream(this.localStreams.get(userId));
      this.enableLocalStream(userId, false);
    } else {
      navigator.mediaDevices.getUserMedia({
        video: false,
        audio: true,
      }).then((localStream) => {
        this.debug("Got user audio:", localStream);
        this.localStreams.set(userId, localStream);

        this.debug("Adding user audio to stream (", userId, ")");
        this.peers.get(userId).addStream(this.localStreams.get(userId));
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
});

// Hooks.on("renderPlayerList", (playerList, $playerList, players) => {
//   console.log("renderPlayerList:", playerList, $playerList, players);
//   //$playerList.find('ol').children().each(handle(players));
// });

Hooks.on("ready", () => {
  game.socket.on("module.walkie-talkie", (request, userId) => {
    game.webrtc.client.debug("Socket event:", request, "from:", userId);
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
        game.webrtc.client.warn("Unknown socket event:", request);
    }
  });

  // Break down peer when the window is closed
  window.addEventListener("beforeunload", walkieTalkie.closeAllPeers.bind(walkieTalkie));
});

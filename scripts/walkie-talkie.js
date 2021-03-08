class WalkieTalkie {
  // Module Code


  /* -------------------------------------------- */
  /*  Logging Methods                             */
  /* -------------------------------------------- */

  /**
   * Display debug messages on the console if debugging is enabled
   * @param {...*} args      Arguments to console.debug
   */
  static debug(...args) {
    if (game.settings.get("walkie-talkie", "debug")) console.debug("Walkie-Talkie | ", ...args);
  }

  /**
   * Display info messages on the console if debugging is enabled
   * @param {...*} args      Arguments to console.info
   */
  static info(...args) {
    if (game.settings.get("walkie-talkie", "debug")) console.info("Walkie-Talkie | ", ...args);
  }

  /**
   * Display warning messages on the console
   * @param {...*} args      Arguments to console.warn
   */
  static warn(...args) {
    console.warn("Walkie-Talkie | ", ...args);
  }

  /**
   * Display error messages on the console
   * @param {...*} args      Arguments to console.error
   */
  static onError(...args) {
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
});

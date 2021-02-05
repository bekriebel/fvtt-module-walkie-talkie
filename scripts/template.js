class Template {
  // Module Code


  /* -------------------------------------------- */
  /*  Logging Methods                             */
  /* -------------------------------------------- */

  /**
   * Display debug messages on the console if debugging is enabled
   * @param {...*} args      Arguments to console.debug
   */
  static debug(...args) {
    if (game.settings.get("template", "debug")) console.debug("Template | ", ...args);
  }

  /**
   * Display info messages on the console if debugging is enabled
   * @param {...*} args      Arguments to console.info
   */
  static info(...args) {
    if (game.settings.get("template", "debug")) console.info("Template | ", ...args);
  }

  /**
   * Display warning messages on the console
   * @param {...*} args      Arguments to console.warn
   */
  static warn(...args) {
    console.warn("Template | ", ...args);
  }

  /**
   * Display error messages on the console
   * @param {...*} args      Arguments to console.error
   */
  static onError(...args) {
    console.error("Template | ", ...args);
  }
}

/* -------------------------------------------- */
/*  Hook calls                                  */
/* -------------------------------------------- */

Hooks.on("init", () => {
  game.settings.register("template", "debug", {
    name: "TEMPLATE.debug",
    hint: "TEMPLATE.debugHint",
    scope: "world",
    config: true,
    default: false,
    type: Boolean,
    onChange: () => {},
  });
});

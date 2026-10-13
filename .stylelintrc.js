module.exports = {
  extends: [
    "stylelint-config-standard",
    "stylelint-config-recess-order"
  ],
  ignoreFiles: ["node_modules", "test", "dist", "**/*.js"],
  rules: {
    "no-descending-specificity": null,
    "color-hex-case": "lower",
    "color-hex-length": "short",
    "at-rule-no-unknown": null,
    "block-no-empty": null,
    "selector-pseudo-class-no-unknown": [
      true,
      {
        ignorePseudoClasses: ["blur"]
      }
    ],
    "property-no-unknown": [
      true,
      {
        ignoreProperties: [
          "placeholder-color",
          "gradient-start",
          "gradient-center",
          "gradient-end",
          "caret-color",
          "selected-color",
          "block-color"
        ]
      }
    ],
    "max-line-length": null,
    "selector-type-no-unknown": [
      true,
      {
        ignoreTypes: ["selected-color", "block-color"]
      }
    ]
  }
}

/** @type {import('vitest').Config'} */
import config from "../../vitest.config.ts";

export default {
  ...config,
  test: {
    ...config.test,
    environment: "jsdom",
  },
};

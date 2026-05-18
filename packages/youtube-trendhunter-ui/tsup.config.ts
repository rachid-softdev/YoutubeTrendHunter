import { type Config } from "tsup";

export default {
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
} satisfies Config;
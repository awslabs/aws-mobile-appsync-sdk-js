import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  clean: true,
  outDir: "lib",
  external: [
    "@apollo/client",
    "@redux-offline/redux-offline",
    "aws-appsync-auth-link",
    "debug",
    "rxjs",
    "url",
    "zen-observable-ts",
    "graphql",
  ],
  onSuccess: "cp -r src/vendor lib/vendor",
});

import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  outDir: 'lib',
  external: [
    '@apollo/client',
    '@aws-crypto/sha256-js',
    '@aws-sdk/types',
    '@aws-sdk/util-hex-encoding',
    'debug',
    'rxjs',
    'graphql'
  ]
})
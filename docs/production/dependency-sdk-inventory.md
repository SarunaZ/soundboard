# Offline Play dependency and SDK inventory — pre-audit host baseline

**Baseline captured from local files on 25 Oct 2026 before dependency audit/remediation lock changes:** `app-play/package.json`, the then-installed package metadata in host `node_modules`, the then-current `yarn.lock`, the Expo Android autolinking graph, and native Gradle manifests. The host `node_modules` tree was deliberately left untouched; its versions below do not represent the post-remediation lock graph. No npm/Gradle registry, network service, or vulnerability scanner was contacted for this inventory.

This inventory records baseline versions and declared license metadata; it is not a legal opinion, a CVE scan, an SBOM attestation, or proof that every package is present in the final AAB. The installed-version tables below remain the pre-audit host baseline; use the final r3 graph delta below for current production dependency evidence. Missing or ambiguous license metadata remains a third-party notice/rights blocker.

## Scope and resolution method

- The direct dependency table mirrors `app-play/package.json` production `dependencies`. The transitive graph follows installed `dependencies` and `optionalDependencies` from those roots; because `expo` itself includes CLI/build packages, this graph includes build-time packages and is not a claim that all 424 entries ship in the AAB. `devDependencies` are listed separately.
- Exact JS versions below come from installed package `version` fields and are checked against the Yarn v4 lock descriptors/resolutions. License identifiers come from installed `package.json`; license/notice file paths are listed if such files exist beside that package.
- Android Maven entries are declared in the installed native module Gradle files. Variables/dynamic plugin-resolved versions are labeled accordingly; exact Gradle resolution must be recorded from the successful build dependency report.
- Workspaces `service`, `worker`, `app-client` server, and root-only dependencies are excluded unless a package is independently in the Play dependency closure. Development packages are separated below.

## Direct Play production dependencies

| Package | Requested range | Installed exact version | Declared license | Existing license/notice files | Lock comparison |
|---|---|---:|---|---|---|
| `@expo/metro-runtime` | `^57.0.12` | 57.0.12 | MIT | `node_modules/@expo/metro-runtime/LICENSE` | matches (57.0.12) |
| `@react-native-community/netinfo` | `12.0.1` | 12.0.1 | MIT | `node_modules/@react-native-community/netinfo/LICENSE` | matches (12.0.1) |
| `expo` | `~57.0.13` | 57.0.13 | MIT | `node_modules/expo/LICENSE` | matches (57.0.13) |
| `expo-asset` | `~57.0.19` | 57.0.19 | MIT | `node_modules/expo-asset/LICENSE` | matches (57.0.19) |
| `expo-audio` | `~57.0.5` | 57.0.5 | MIT | `node_modules/expo-audio/LICENSE` | matches (57.0.5) |
| `expo-document-picker` | `~57.0.1` | 57.0.3 | MIT | `node_modules/expo-document-picker/LICENSE` | matches (57.0.3) |
| `expo-file-system` | `~57.0.4` | 57.0.4 | MIT | `node_modules/expo-file-system/LICENSE` | matches (57.0.4) |
| `expo-image-manipulator` | `~57.0.10` | 57.0.21 | MIT | `node_modules/expo-image-manipulator/LICENSE` | matches (57.0.21) |
| `expo-image-picker` | `~57.0.10` | 57.0.20 | MIT | `node_modules/expo-image-picker/LICENSE` | matches (57.0.20) |
| `expo-status-bar` | `~57.0.1` | 57.0.1 | MIT | `node_modules/expo-status-bar/LICENSE` | matches (57.0.1) |
| `react` | `19.2.3` | 19.2.3 | MIT | `node_modules/react/LICENSE` | matches (19.2.3) |
| `react-dom` | `19.2.3` | 19.2.3 | MIT | `node_modules/react-dom/LICENSE` | matches (19.2.3) |
| `react-native` | `0.86.2` | 0.86.2 | MIT | `node_modules/react-native/LICENSE` | matches (0.86.2) |
| `react-native-audio-api` | `^0.13.2` | 0.13.2 | MIT | none found | matches (0.13.2) |
| `react-native-safe-area-context` | `~5.7.0` | 5.7.0 | MIT | `node_modules/react-native-safe-area-context/LICENSE` | matches (5.7.0) |
| `react-native-web` | `^0.21.2` | 0.21.2 | MIT | `node_modules/react-native-web/LICENSE` | matches (0.21.2) |

## Installed Play dependency/build-tool transitive closure

Resolved installed package count: **424**; lockfile-only optional platform variants not installed on this Windows host: **10**; package selectors with no local lock record: **0**. This is the installed JS dependency/build-tool closure of the Play dependency roots, not the final APK/AAB runtime payload. Platform variants/build tools must be reconciled with the successful AAB before release.

| Package | Exact installed version | Depth | Declared license | Existing license/notice files | Lock status |
|---|---:|---:|---|---|---|
| `@babel/code-frame` | 7.29.7 | 2 | MIT | `node_modules/@babel/code-frame/LICENSE` | matches |
| `@babel/compat-data` | 7.29.7 | 4 | MIT | `node_modules/@babel/compat-data/LICENSE` | matches |
| `@babel/core` | 7.29.7 | 2 | MIT | `node_modules/@babel/core/LICENSE` | matches |
| `@babel/generator` | 7.29.8 | 2 | MIT | `node_modules/@babel/generator/LICENSE` | matches |
| `@babel/helper-annotate-as-pure` | 7.29.7 | 3 | MIT | `node_modules/@babel/helper-annotate-as-pure/LICENSE` | matches |
| `@babel/helper-compilation-targets` | 7.29.7 | 3 | MIT | `node_modules/@babel/helper-compilation-targets/LICENSE` | matches |
| `@babel/helper-create-class-features-plugin` | 7.29.7 | 3 | MIT | `node_modules/@babel/helper-create-class-features-plugin/LICENSE` | matches |
| `@babel/helper-create-regexp-features-plugin` | 7.29.7 | 3 | MIT | `node_modules/@babel/helper-create-regexp-features-plugin/LICENSE` | matches |
| `@babel/helper-define-polyfill-provider` | 0.6.8 | 4 | MIT | `node_modules/@babel/helper-define-polyfill-provider/LICENSE` | matches |
| `@babel/helper-globals` | 7.29.7 | 3 | MIT | `node_modules/@babel/helper-globals/LICENSE` | matches |
| `@babel/helper-member-expression-to-functions` | 7.29.7 | 4 | MIT | `node_modules/@babel/helper-member-expression-to-functions/LICENSE` | matches |
| `@babel/helper-module-imports` | 7.29.7 | 2 | MIT | `node_modules/@babel/helper-module-imports/LICENSE` | matches |
| `@babel/helper-module-transforms` | 7.29.7 | 3 | MIT | `node_modules/@babel/helper-module-transforms/LICENSE` | matches |
| `@babel/helper-optimise-call-expression` | 7.29.7 | 4 | MIT | `node_modules/@babel/helper-optimise-call-expression/LICENSE` | matches |
| `@babel/helper-plugin-utils` | 7.29.7 | 3 | MIT | `node_modules/@babel/helper-plugin-utils/LICENSE` | matches |
| `@babel/helper-remap-async-to-generator` | 7.29.7 | 3 | MIT | `node_modules/@babel/helper-remap-async-to-generator/LICENSE` | matches |
| `@babel/helper-replace-supers` | 7.29.7 | 3 | MIT | `node_modules/@babel/helper-replace-supers/LICENSE` | matches |
| `@babel/helper-skip-transparent-expression-wrappers` | 7.29.7 | 3 | MIT | `node_modules/@babel/helper-skip-transparent-expression-wrappers/LICENSE` | matches |
| `@babel/helper-string-parser` | 7.29.7 | 3 | MIT | `node_modules/@babel/helper-string-parser/LICENSE` | matches |
| `@babel/helper-validator-identifier` | 7.29.7 | 3 | MIT | `node_modules/@babel/helper-validator-identifier/LICENSE` | matches |
| `@babel/helper-validator-option` | 7.29.7 | 3 | MIT | `node_modules/@babel/helper-validator-option/LICENSE` | matches |
| `@babel/helper-wrap-function` | 7.29.7 | 4 | MIT | `node_modules/@babel/helper-wrap-function/LICENSE` | matches |
| `@babel/helpers` | 7.29.7 | 3 | MIT | `node_modules/@babel/helpers/LICENSE` | matches |
| `@babel/parser` | 7.29.8 | 2 | MIT | `node_modules/@babel/parser/LICENSE` | matches |
| `@babel/plugin-proposal-decorators` | 7.29.7 | 2 | MIT | `node_modules/@babel/plugin-proposal-decorators/LICENSE` | matches |
| `@babel/plugin-proposal-export-default-from` | 7.29.7 | 2 | MIT | `node_modules/@babel/plugin-proposal-export-default-from/LICENSE` | matches |
| `@babel/plugin-syntax-decorators` | 7.29.7 | 3 | MIT | `node_modules/@babel/plugin-syntax-decorators/LICENSE` | matches |
| `@babel/plugin-syntax-dynamic-import` | 7.8.3 | 2 | MIT | `node_modules/@babel/plugin-syntax-dynamic-import/LICENSE` | matches |
| `@babel/plugin-syntax-export-default-from` | 7.29.7 | 2 | MIT | `node_modules/@babel/plugin-syntax-export-default-from/LICENSE` | matches |
| `@babel/plugin-syntax-flow` | 7.29.7 | 3 | MIT | `node_modules/@babel/plugin-syntax-flow/LICENSE` | matches |
| `@babel/plugin-syntax-jsx` | 7.29.7 | 3 | MIT | `node_modules/@babel/plugin-syntax-jsx/LICENSE` | matches |
| `@babel/plugin-syntax-nullish-coalescing-operator` | 7.8.3 | 2 | MIT | `node_modules/@babel/plugin-syntax-nullish-coalescing-operator/LICENSE` | matches |
| `@babel/plugin-syntax-optional-chaining` | 7.8.3 | 2 | MIT | `node_modules/@babel/plugin-syntax-optional-chaining/LICENSE` | matches |
| `@babel/plugin-syntax-typescript` | 7.29.7 | 3 | MIT | `node_modules/@babel/plugin-syntax-typescript/LICENSE` | matches |
| `@babel/plugin-transform-async-generator-functions` | 7.29.7 | 2 | MIT | `node_modules/@babel/plugin-transform-async-generator-functions/LICENSE` | matches |
| `@babel/plugin-transform-async-to-generator` | 7.29.7 | 2 | MIT | `node_modules/@babel/plugin-transform-async-to-generator/LICENSE` | matches |
| `@babel/plugin-transform-block-scoping` | 7.29.7 | 2 | MIT | `node_modules/@babel/plugin-transform-block-scoping/LICENSE` | matches |
| `@babel/plugin-transform-class-properties` | 7.29.7 | 2 | MIT | `node_modules/@babel/plugin-transform-class-properties/LICENSE` | matches |
| `@babel/plugin-transform-class-static-block` | 7.29.7 | 2 | MIT | `node_modules/@babel/plugin-transform-class-static-block/LICENSE` | matches |
| `@babel/plugin-transform-classes` | 7.29.7 | 2 | MIT | `node_modules/@babel/plugin-transform-classes/LICENSE` | matches |
| `@babel/plugin-transform-destructuring` | 7.29.7 | 2 | MIT | `node_modules/@babel/plugin-transform-destructuring/LICENSE` | matches |
| `@babel/plugin-transform-export-namespace-from` | 7.29.7 | 2 | MIT | `node_modules/@babel/plugin-transform-export-namespace-from/LICENSE` | matches |
| `@babel/plugin-transform-flow-strip-types` | 7.29.7 | 2 | MIT | `node_modules/@babel/plugin-transform-flow-strip-types/LICENSE` | matches |
| `@babel/plugin-transform-for-of` | 7.29.7 | 2 | MIT | `node_modules/@babel/plugin-transform-for-of/LICENSE` | matches |
| `@babel/plugin-transform-logical-assignment-operators` | 7.29.7 | 2 | MIT | `node_modules/@babel/plugin-transform-logical-assignment-operators/LICENSE` | matches |
| `@babel/plugin-transform-modules-commonjs` | 7.29.7 | 2 | MIT | `node_modules/@babel/plugin-transform-modules-commonjs/LICENSE` | matches |
| `@babel/plugin-transform-named-capturing-groups-regex` | 7.29.7 | 2 | MIT | `node_modules/@babel/plugin-transform-named-capturing-groups-regex/LICENSE` | matches |
| `@babel/plugin-transform-nullish-coalescing-operator` | 7.29.7 | 2 | MIT | `node_modules/@babel/plugin-transform-nullish-coalescing-operator/LICENSE` | matches |
| `@babel/plugin-transform-object-rest-spread` | 7.29.7 | 2 | MIT | `node_modules/@babel/plugin-transform-object-rest-spread/LICENSE` | matches |
| `@babel/plugin-transform-optional-catch-binding` | 7.29.7 | 2 | MIT | `node_modules/@babel/plugin-transform-optional-catch-binding/LICENSE` | matches |
| `@babel/plugin-transform-optional-chaining` | 7.29.7 | 2 | MIT | `node_modules/@babel/plugin-transform-optional-chaining/LICENSE` | matches |
| `@babel/plugin-transform-parameters` | 7.29.7 | 2 | MIT | `node_modules/@babel/plugin-transform-parameters/LICENSE` | matches |
| `@babel/plugin-transform-private-methods` | 7.29.7 | 2 | MIT | `node_modules/@babel/plugin-transform-private-methods/LICENSE` | matches |
| `@babel/plugin-transform-private-property-in-object` | 7.29.7 | 2 | MIT | `node_modules/@babel/plugin-transform-private-property-in-object/LICENSE` | matches |
| `@babel/plugin-transform-react-display-name` | 7.29.7 | 2 | MIT | `node_modules/@babel/plugin-transform-react-display-name/LICENSE` | matches |
| `@babel/plugin-transform-react-jsx` | 7.29.7 | 2 | MIT | `node_modules/@babel/plugin-transform-react-jsx/LICENSE` | matches |
| `@babel/plugin-transform-react-jsx-development` | 7.29.7 | 2 | MIT | `node_modules/@babel/plugin-transform-react-jsx-development/LICENSE` | matches |
| `@babel/plugin-transform-react-pure-annotations` | 7.29.7 | 2 | MIT | `node_modules/@babel/plugin-transform-react-pure-annotations/LICENSE` | matches |
| `@babel/plugin-transform-runtime` | 7.29.7 | 2 | MIT | `node_modules/@babel/plugin-transform-runtime/LICENSE` | matches |
| `@babel/plugin-transform-typescript` | 7.29.7 | 2 | MIT | `node_modules/@babel/plugin-transform-typescript/LICENSE` | matches |
| `@babel/plugin-transform-unicode-regex` | 7.29.7 | 2 | MIT | `node_modules/@babel/plugin-transform-unicode-regex/LICENSE` | matches |
| `@babel/preset-typescript` | 7.29.7 | 2 | MIT | `node_modules/@babel/preset-typescript/LICENSE` | matches |
| `@babel/runtime` | 7.29.7 | 1 | MIT | `node_modules/@babel/runtime/LICENSE` | matches |
| `@babel/template` | 7.29.7 | 3 | MIT | `node_modules/@babel/template/LICENSE` | matches |
| `@babel/traverse` | 7.29.8 | 2 | MIT | `node_modules/@babel/traverse/LICENSE` | matches |
| `@babel/types` | 7.29.8 | 2 | MIT | `node_modules/@babel/types/LICENSE` | matches |
| `@expo/cli` | 57.0.15 | 1 | MIT | `node_modules/@expo/cli/LICENSE` | matches |
| `@expo/code-signing-certificates` | 0.0.6 | 2 | MIT | `node_modules/@expo/code-signing-certificates/LICENSE` | matches |
| `@expo/config` | 57.0.7 | 1 | MIT | `node_modules/@expo/config/LICENSE` | matches |
| `@expo/config-plugins` | 57.0.8 | 1 | MIT | `node_modules/@expo/config-plugins/LICENSE` | matches |
| `@expo/config-types` | 57.0.2 | 2 | MIT | `node_modules/@expo/config-types/LICENSE` | matches |
| `@expo/devcert` | 1.2.1 | 2 | MIT | none in local package tree | matches |
| `@expo/devtools` | 57.0.1 | 1 | MIT | `node_modules/@expo/devtools/LICENSE` | matches |
| `@expo/dom-webview` | 57.0.1 | 1 | MIT | `node_modules/@expo/dom-webview/LICENSE` | matches |
| `@expo/env` | 2.4.2 | 2 | MIT | `node_modules/@expo/env/LICENSE` | matches |
| `@expo/expo-modules-macros-plugin` | 0.6.1 | 2 | MIT | `node_modules/@expo/expo-modules-macros-plugin/LICENSE` | matches |
| `@expo/fingerprint` | 0.20.7 | 1 | MIT | `node_modules/@expo/fingerprint/LICENSE` | matches |
| `@expo/image-utils` | 0.11.6 | 1 | MIT | `node_modules/expo-asset/node_modules/@expo/image-utils/LICENSE` | matches |
| `@expo/inline-modules` | 0.1.5 | 2 | MIT | `node_modules/@expo/inline-modules/LICENSE` | matches |
| `@expo/json-file` | 11.0.1 | 2 | MIT | `node_modules/@expo/json-file/LICENSE` | matches |
| `@expo/local-build-cache-provider` | 57.0.6 | 1 | MIT | `node_modules/@expo/local-build-cache-provider/LICENSE` | matches |
| `@expo/log-box` | 57.0.3 | 1 | MIT | `node_modules/@expo/metro-runtime/node_modules/@expo/log-box/LICENSE` | matches |
| `@expo/metro` | 56.0.0 | 1 | MIT | `node_modules/@expo/metro/LICENSE` | matches |
| `@expo/metro-config` | 57.0.8 | 1 | MIT | `node_modules/@expo/metro-config/LICENSE` | matches |
| `@expo/metro-file-map` | 57.0.1 | 2 | MIT | `node_modules/@expo/metro-file-map/LICENSE` | matches |
| `@expo/metro-runtime` | 57.0.12 | 0 | MIT | `node_modules/@expo/metro-runtime/LICENSE` | matches |
| `@expo/osascript` | 2.7.1 | 2 | MIT | `node_modules/@expo/osascript/LICENSE` | matches |
| `@expo/package-manager` | 1.13.1 | 2 | MIT | `node_modules/@expo/package-manager/LICENSE` | matches |
| `@expo/plist` | 0.8.1 | 2 | MIT | `node_modules/@expo/plist/LICENSE` | matches |
| `@expo/prebuild-config` | 57.0.12 | 2 | MIT | `node_modules/@expo/prebuild-config/LICENSE` | matches |
| `@expo/require-utils` | 57.0.4 | 2 | MIT | `node_modules/@expo/require-utils/LICENSE` | matches |
| `@expo/router-server` | 57.0.6 | 2 | MIT | `node_modules/@expo/router-server/LICENSE` | matches |
| `@expo/schema-utils` | 57.0.2 | 2 | MIT | `node_modules/@expo/schema-utils/LICENSE` | matches |
| `@expo/sdk-runtime-versions` | 1.0.0 | 2 | MIT | none in local package tree | matches |
| `@expo/spawn-async` | 1.8.0 | 2 | MIT | `node_modules/@expo/spawn-async/LICENSE` | matches |
| `@expo/sudo-prompt` | 9.3.2 | 3 | MIT | `node_modules/@expo/sudo-prompt/LICENSE` | matches |
| `@expo/ws-tunnel` | 2.0.0 | 2 | MIT | none in local package tree | matches |
| `@expo/xcpretty` | 4.4.4 | 2 | BSD-3-Clause | none in local package tree | matches |
| `@isaacs/ttlcache` | 1.4.1 | 3 | ISC | `node_modules/@isaacs/ttlcache/LICENSE` | matches |
| `@jest/schemas` | 29.6.3 | 2 | MIT | `node_modules/@jest/schemas/LICENSE` | matches |
| `@jest/types` | 29.6.3 | 4 | MIT | `node_modules/@jest/types/LICENSE` | matches |
| `@jridgewell/gen-mapping` | 0.3.13 | 2 | MIT | `node_modules/@jridgewell/gen-mapping/LICENSE` | matches |
| `@jridgewell/remapping` | 2.3.5 | 2 | MIT | `node_modules/@jridgewell/remapping/LICENSE` | matches |
| `@jridgewell/resolve-uri` | 3.1.2 | 4 | MIT | `node_modules/@jridgewell/resolve-uri/LICENSE` | matches |
| `@jridgewell/source-map` | 0.3.11 | 4 | MIT | `node_modules/@jridgewell/source-map/LICENSE` | matches |
| `@jridgewell/sourcemap-codec` | 1.5.5 | 2 | MIT | `node_modules/@jridgewell/sourcemap-codec/LICENSE` | matches |
| `@jridgewell/trace-mapping` | 0.3.31 | 3 | MIT | `node_modules/@jridgewell/trace-mapping/LICENSE` | matches |
| `@react-native-community/netinfo` | 12.0.1 | 0 | MIT | `node_modules/@react-native-community/netinfo/LICENSE` | matches |
| `@react-native/assets-registry` | 0.86.2 | 1 | MIT | none in local package tree | matches |
| `@react-native/babel-plugin-codegen` | 0.86.2 | 2 | MIT | none in local package tree | matches |
| `@react-native/codegen` | 0.86.2 | 1 | MIT | none in local package tree | matches |
| `@react-native/community-cli-plugin` | 0.86.2 | 1 | MIT | none in local package tree | matches |
| `@react-native/debugger-frontend` | 0.86.2 | 3 | BSD-3-Clause | none in local package tree | matches |
| `@react-native/debugger-shell` | 0.86.2 | 3 | MIT | none in local package tree | matches |
| `@react-native/dev-middleware` | 0.86.2 | 2 | MIT | none in local package tree | matches |
| `@react-native/gradle-plugin` | 0.86.2 | 1 | MIT | none in local package tree | matches |
| `@react-native/js-polyfills` | 0.86.2 | 1 | MIT | none in local package tree | matches |
| `@react-native/normalize-colors` | 0.86.2 | 1 | MIT | none in local package tree | matches |
| `@react-native/virtualized-lists` | 0.86.2 | 1 | MIT | none in local package tree | matches |
| `@sinclair/typebox` | 0.27.12 | 3 | MIT | `node_modules/@sinclair/typebox/license` | matches |
| `@types/istanbul-lib-coverage` | 2.0.6 | 5 | MIT | `node_modules/@types/istanbul-lib-coverage/LICENSE` | matches |
| `@types/istanbul-lib-report` | 3.0.3 | 6 | MIT | `node_modules/@types/istanbul-lib-report/LICENSE` | matches |
| `@types/istanbul-reports` | 3.0.4 | 5 | MIT | `node_modules/@types/istanbul-reports/LICENSE` | matches |
| `@types/node` | 26.2.0 | 4 | MIT | `node_modules/@types/node/LICENSE` | matches |
| `@types/yargs` | 17.0.35 | 5 | MIT | `node_modules/@types/yargs/LICENSE` | matches |
| `@types/yargs-parser` | 21.0.3 | 6 | MIT | `node_modules/@types/yargs-parser/LICENSE` | matches |
| `@ungap/structured-clone` | 1.3.3 | 1 | ISC | `node_modules/@ungap/structured-clone/LICENSE` | matches |
| `@xmldom/xmldom` | 0.8.14 | 3 | MIT | `node_modules/@xmldom/xmldom/LICENSE` | matches |
| `abort-controller` | 3.0.0 | 1 | MIT | `node_modules/abort-controller/LICENSE` | matches |
| `accepts` | 1.3.8 | 2 | MIT | `node_modules/@expo/cli/node_modules/accepts/LICENSE` | matches |
| `acorn` | 8.18.0 | 4 | MIT | `node_modules/acorn/LICENSE` | matches |
| `agent-base` | 7.1.4 | 4 | MIT | `node_modules/agent-base/LICENSE` | matches |
| `agent-cli-detector` | 0.1.5 | 2 | MIT | `node_modules/agent-cli-detector/LICENSE` | matches |
| `anser` | 1.4.10 | 1 | MIT | `node_modules/anser/LICENSE` | matches |
| `ansi-escapes` | 4.3.2 | 3 | MIT | `node_modules/ansi-escapes/license` | matches |
| `ansi-regex` | 5.0.1 | 1 | MIT | `node_modules/ansi-regex/license` | matches |
| `ansi-styles` | 5.2.0 | 2 | MIT | `node_modules/pretty-format/node_modules/ansi-styles/license` | matches |
| `arg` | 5.0.2 | 2 | MIT | `node_modules/arg/LICENSE.md` | matches |
| `argparse` | 2.0.1 | 4 | Python-2.0 | `node_modules/argparse/LICENSE` | matches |
| `asap` | 2.0.6 | 2 | MIT | `node_modules/asap/LICENSE.md` | matches |
| `babel-plugin-polyfill-corejs2` | 0.4.17 | 3 | MIT | `node_modules/babel-plugin-polyfill-corejs2/LICENSE` | matches |
| `babel-plugin-polyfill-corejs3` | 0.13.0 | 3 | MIT | `node_modules/babel-plugin-polyfill-corejs3/LICENSE` | matches |
| `babel-plugin-polyfill-regenerator` | 0.6.8 | 3 | MIT | `node_modules/babel-plugin-polyfill-regenerator/LICENSE` | matches |
| `babel-plugin-react-compiler` | 1.0.0 | 2 | MIT | none in local package tree | matches |
| `babel-plugin-react-native-web` | 0.21.2 | 2 | MIT | `node_modules/babel-plugin-react-native-web/LICENSE` | matches |
| `babel-plugin-syntax-hermes-parser` | 0.36.0 | 1 | MIT | `node_modules/react-native/node_modules/babel-plugin-syntax-hermes-parser/LICENSE` | matches |
| `babel-plugin-transform-flow-enums` | 0.0.2 | 2 | MIT | `node_modules/babel-plugin-transform-flow-enums/LICENSE` | matches |
| `babel-preset-expo` | 57.0.7 | 1 | MIT | `node_modules/babel-preset-expo/LICENSE` | matches |
| `balanced-match` | 4.0.4 | 4 | MIT | `node_modules/balanced-match/LICENSE.md` | matches |
| `base64-js` | 1.5.1 | 1 | MIT | `node_modules/base64-js/LICENSE` | matches |
| `baseline-browser-mapping` | 2.11.14 | 3 | Apache-2.0 | `node_modules/baseline-browser-mapping/LICENSE.txt` | matches |
| `big-integer` | 1.6.52 | 3 | Unlicense | `node_modules/big-integer/LICENSE` | matches |
| `bplist-creator` | 0.1.0 | 2 | MIT | `node_modules/@expo/cli/node_modules/bplist-creator/LICENSE` | matches |
| `bplist-parser` | 0.3.2 | 2 | MIT | none in local package tree | matches |
| `brace-expansion` | 5.0.9 | 3 | MIT | `node_modules/brace-expansion/LICENSE` | matches |
| `braces` | 3.0.3 | 4 | MIT | `node_modules/braces/LICENSE` | matches |
| `browserslist` | 4.28.8 | 2 | MIT | `node_modules/browserslist/LICENSE` | matches |
| `bser` | 2.1.1 | 4 | Apache-2.0 | none in local package tree | matches |
| `buffer-from` | 1.1.2 | 5 | MIT | `node_modules/buffer-from/LICENSE` | matches |
| `bytes` | 3.1.2 | 3 | MIT | `node_modules/bytes/LICENSE` | matches |
| `camelcase` | 6.3.0 | 4 | MIT | `node_modules/camelcase/license` | matches |
| `caniuse-lite` | 1.0.30001809 | 3 | CC-BY-4.0 | `node_modules/caniuse-lite/LICENSE` | matches |
| `chalk` | 4.1.2 | 2 | MIT | `node_modules/chalk/license` | matches |
| `chrome-launcher` | 0.15.2 | 3 | Apache-2.0 | `node_modules/chrome-launcher/LICENSE` | matches |
| `chromium-edge-launcher` | 0.3.0 | 3 | Apache-2.0 | `node_modules/chromium-edge-launcher/LICENSE` | matches |
| `ci-info` | 3.9.0 | 2 | MIT | `node_modules/@expo/cli/node_modules/ci-info/LICENSE` | matches |
| `cli-cursor` | 2.1.0 | 3 | MIT | `node_modules/cli-cursor/license` | matches |
| `cli-spinners` | 2.9.2 | 3 | MIT | `node_modules/cli-spinners/license` | matches |
| `cliui` | 8.0.1 | 2 | ISC | `node_modules/cliui/LICENSE.txt` | matches |
| `clone` | 1.0.4 | 5 | MIT | `node_modules/clone/LICENSE` | matches |
| `commander` | 12.1.0 | 1 | MIT | `node_modules/commander/LICENSE` | matches |
| `compressible` | 2.0.18 | 3 | MIT | `node_modules/compressible/LICENSE` | matches |
| `compression` | 1.8.1 | 2 | MIT | `node_modules/compression/LICENSE` | matches |
| `connect` | 3.7.0 | 2 | MIT | `node_modules/connect/LICENSE` | matches |
| `convert-source-map` | 2.0.0 | 3 | MIT | `node_modules/convert-source-map/LICENSE` | matches |
| `core-js-compat` | 3.50.0 | 4 | MIT | `node_modules/core-js-compat/LICENSE` | matches |
| `cross-fetch` | 3.2.0 | 2 | MIT | `node_modules/cross-fetch/LICENSE` | matches |
| `cross-spawn` | 7.0.6 | 3 | MIT | `node_modules/cross-spawn/LICENSE` | matches |
| `css-in-js-utils` | 3.1.0 | 2 | MIT | `node_modules/css-in-js-utils/LICENSE` | matches |
| `debug` | 4.4.3 | 2 | MIT | `node_modules/debug/LICENSE` | matches |
| `deepmerge` | 4.3.1 | 2 | MIT | `node_modules/deepmerge/license.txt` | matches |
| `defaults` | 1.0.4 | 4 | MIT | `node_modules/defaults/LICENSE` | matches |
| `depd` | 2.0.0 | 3 | MIT | `node_modules/depd/LICENSE` | matches |
| `destroy` | 1.2.0 | 3 | MIT | `node_modules/destroy/LICENSE` | matches |
| `detect-libc` | 2.1.2 | 3 | Apache-2.0 | `node_modules/detect-libc/LICENSE` | matches |
| `dnssd-advertise` | 1.1.6 | 2 | MIT | `node_modules/dnssd-advertise/LICENSE.md` | matches |
| `ee-first` | 1.1.1 | 4 | MIT | `node_modules/ee-first/LICENSE` | matches |
| `electron-to-chromium` | 1.5.406 | 3 | ISC | `node_modules/electron-to-chromium/LICENSE` | matches |
| `emoji-regex` | 8.0.0 | 3 | MIT | `node_modules/emoji-regex/LICENSE-MIT.txt` | matches |
| `encodeurl` | 2.0.0 | 3 | MIT | `node_modules/encodeurl/LICENSE` | matches |
| `error-stack-parser` | 2.1.4 | 3 | MIT | `node_modules/error-stack-parser/LICENSE` | matches |
| `es-errors` | 1.3.0 | 6 | MIT | `node_modules/es-errors/LICENSE` | matches |
| `escalade` | 3.2.0 | 2 | MIT | `node_modules/escalade/license` | matches |
| `escape-html` | 1.0.3 | 3 | MIT | `node_modules/escape-html/LICENSE` | matches |
| `escape-string-regexp` | 4.0.0 | 4 | MIT | `node_modules/escape-string-regexp/license` | matches |
| `etag` | 1.8.1 | 3 | MIT | `node_modules/etag/LICENSE` | matches |
| `event-target-shim` | 5.0.1 | 2 | MIT | `node_modules/event-target-shim/LICENSE` | matches |
| `expo` | 57.0.13 | 0 | MIT | `node_modules/expo/LICENSE` | matches |
| `expo-asset` | 57.0.19 | 0 | MIT | `node_modules/expo-asset/LICENSE` | matches |
| `expo-audio` | 57.0.5 | 0 | MIT | `node_modules/expo-audio/LICENSE` | matches |
| `expo-constants` | 57.0.11 | 1 | MIT | `node_modules/expo-constants/LICENSE` | matches |
| `expo-document-picker` | 57.0.3 | 0 | MIT | `node_modules/expo-document-picker/LICENSE` | matches |
| `expo-file-system` | 57.0.4 | 0 | MIT | `node_modules/expo-file-system/LICENSE` | matches |
| `expo-font` | 57.0.1 | 1 | MIT | `node_modules/expo-font/LICENSE` | matches |
| `expo-image-loader` | 57.0.1 | 1 | MIT | `node_modules/expo-image-loader/LICENSE` | matches |
| `expo-image-manipulator` | 57.0.21 | 0 | MIT | `node_modules/expo-image-manipulator/LICENSE` | matches |
| `expo-image-picker` | 57.0.20 | 0 | MIT | `node_modules/expo-image-picker/LICENSE` | matches |
| `expo-keep-awake` | 57.0.1 | 1 | MIT | `node_modules/expo-keep-awake/LICENSE` | matches |
| `expo-modules-autolinking` | 57.0.10 | 1 | MIT | `node_modules/expo-modules-autolinking/LICENSE` | matches |
| `expo-modules-core` | 57.0.11 | 1 | MIT | `node_modules/expo-modules-core/LICENSE` | matches |
| `expo-modules-jsi` | 57.0.4 | 2 | MIT | `node_modules/expo-modules-jsi/LICENSE` | matches |
| `expo-server` | 57.0.3 | 2 | MIT | `node_modules/expo-server/LICENSE` | matches |
| `expo-status-bar` | 57.0.1 | 0 | MIT | `node_modules/expo-status-bar/LICENSE` | matches |
| `exponential-backoff` | 3.1.3 | 3 | Apache-2.0 | `node_modules/exponential-backoff/LICENSE` | matches |
| `fb-dotslash` | 0.5.8 | 4 | (MIT OR Apache-2.0) | none in local package tree | matches |
| `fb-watchman` | 2.0.2 | 3 | Apache-2.0 | none in local package tree | matches |
| `fbjs` | 3.0.5 | 1 | MIT | `node_modules/fbjs/LICENSE` | matches |
| `fbjs-css-vars` | 1.0.2 | 2 | MIT | `node_modules/fbjs-css-vars/LICENSE` | matches |
| `fdir` | 6.5.0 | 2 | MIT | `node_modules/fdir/LICENSE` | matches |
| `fetch-nodeshim` | 0.4.10 | 2 | MIT | `node_modules/fetch-nodeshim/LICENSE.md` | matches |
| `fill-range` | 7.1.1 | 5 | MIT | `node_modules/fill-range/LICENSE` | matches |
| `finalhandler` | 1.1.2 | 3 | MIT | `node_modules/finalhandler/LICENSE` | matches |
| `flow-enums-runtime` | 0.0.6 | 1 | MIT | `node_modules/flow-enums-runtime/LICENSE` | matches |
| `fontfaceobserver` | 2.3.0 | 2 | BSD-2-Clause | `node_modules/fontfaceobserver/LICENSE` | matches |
| `fresh` | 0.5.2 | 3 | MIT | `node_modules/send/node_modules/fresh/LICENSE` | matches |
| `function-bind` | 1.1.2 | 8 | MIT | `node_modules/function-bind/LICENSE` | matches |
| `gensync` | 1.0.0-beta.2 | 3 | MIT | `node_modules/gensync/LICENSE` | matches |
| `get-caller-file` | 2.0.5 | 2 | ISC | `node_modules/get-caller-file/LICENSE.md` | matches |
| `getenv` | 2.0.0 | 2 | MIT | `node_modules/getenv/LICENSE.md` | matches |
| `glob` | 13.0.6 | 2 | BlueOak-1.0.0 | `node_modules/glob/LICENSE.md` | matches |
| `graceful-fs` | 4.2.11 | 3 | ISC | `node_modules/graceful-fs/LICENSE` | matches |
| `has-flag` | 4.0.0 | 4 | MIT | `node_modules/has-flag/license` | matches |
| `hasown` | 2.0.4 | 7 | MIT | `node_modules/hasown/LICENSE` | matches |
| `hermes-compiler` | 250829098.0.16 | 1 | MIT | none in local package tree | matches |
| `hermes-estree` | 0.36.1 | 3 | MIT | `node_modules/hermes-estree/LICENSE` | matches |
| `hermes-parser` | 0.36.1 | 2 | MIT | `node_modules/hermes-parser/LICENSE` | matches |
| `hosted-git-info` | 7.0.2 | 3 | ISC | `node_modules/hosted-git-info/LICENSE` | matches |
| `http-errors` | 2.0.1 | 3 | MIT | `node_modules/http-errors/LICENSE` | matches |
| `https-proxy-agent` | 7.0.6 | 3 | MIT | `node_modules/https-proxy-agent/LICENSE` | matches |
| `hyphenate-style-name` | 1.1.0 | 3 | BSD-3-Clause | `node_modules/hyphenate-style-name/LICENSE` | matches |
| `ignore` | 5.3.2 | 2 | MIT | `node_modules/ignore/LICENSE-MIT` | matches |
| `image-size` | 1.2.1 | 3 | MIT | `node_modules/image-size/LICENSE` | matches |
| `inherits` | 2.0.4 | 4 | ISC | `node_modules/inherits/LICENSE` | matches |
| `inline-style-prefixer` | 7.0.1 | 1 | MIT | `node_modules/inline-style-prefixer/LICENSE` | matches |
| `invariant` | 2.2.4 | 1 | MIT | `node_modules/invariant/LICENSE` | matches |
| `is-core-module` | 2.16.2 | 6 | MIT | `node_modules/is-core-module/LICENSE` | matches |
| `is-docker` | 2.2.1 | 4 | MIT | `node_modules/is-docker/license` | matches |
| `is-fullwidth-code-point` | 3.0.0 | 3 | MIT | `node_modules/is-fullwidth-code-point/license` | matches |
| `is-number` | 7.0.0 | 7 | MIT | `node_modules/is-number/LICENSE` | matches |
| `is-wsl` | 2.2.0 | 4 | MIT | `node_modules/is-wsl/license` | matches |
| `isexe` | 2.0.0 | 5 | ISC | `node_modules/isexe/LICENSE` | matches |
| `jest-get-type` | 29.6.3 | 4 | MIT | `node_modules/jest-get-type/LICENSE` | matches |
| `jest-util` | 29.7.0 | 4 | MIT | `node_modules/jest-util/LICENSE` | matches |
| `jest-validate` | 29.7.0 | 3 | MIT | `node_modules/jest-validate/LICENSE` | matches |
| `jest-worker` | 29.7.0 | 3 | MIT | `node_modules/jest-worker/LICENSE` | matches |
| `jimp-compact` | 0.16.1 | 2 | MIT | none in local package tree | matches |
| `js-tokens` | 4.0.0 | 3 | MIT | `node_modules/js-tokens/LICENSE` | matches |
| `js-yaml` | 4.3.1 | 3 | MIT | `node_modules/js-yaml/LICENSE` | matches |
| `jsc-safe-url` | 0.2.4 | 2 | 0BSD | `node_modules/jsc-safe-url/LICENSE` | matches |
| `jsesc` | 3.1.0 | 3 | MIT | `node_modules/jsesc/LICENSE-MIT.txt` | matches |
| `json5` | 2.2.3 | 3 | MIT | `node_modules/json5/LICENSE.md` | matches |
| `kleur` | 3.0.3 | 3 | MIT | `node_modules/kleur/license` | matches |
| `lan-network` | 0.2.1 | 2 | MIT | `node_modules/lan-network/LICENSE.md` | matches |
| `leven` | 3.1.0 | 4 | MIT | `node_modules/leven/license` | matches |
| `lighthouse-logger` | 1.4.2 | 4 | Apache-2.0 | `node_modules/lighthouse-logger/LICENSE` | matches |
| `lightningcss` | 1.33.0 | 2 | MPL-2.0 | `node_modules/lightningcss/LICENSE` | matches |
| `lightningcss-android-arm64` | not installed; 1.33.0 locked | 3 | metadata unavailable in this installation | none in local package tree | locked optional platform variant; not installed on this Windows host |
| `lightningcss-darwin-arm64` | not installed; 1.33.0 locked | 3 | metadata unavailable in this installation | none in local package tree | locked optional platform variant; not installed on this Windows host |
| `lightningcss-darwin-x64` | not installed; 1.33.0 locked | 3 | metadata unavailable in this installation | none in local package tree | locked optional platform variant; not installed on this Windows host |
| `lightningcss-freebsd-x64` | not installed; 1.33.0 locked | 3 | metadata unavailable in this installation | none in local package tree | locked optional platform variant; not installed on this Windows host |
| `lightningcss-linux-arm-gnueabihf` | not installed; 1.33.0 locked | 3 | metadata unavailable in this installation | none in local package tree | locked optional platform variant; not installed on this Windows host |
| `lightningcss-linux-arm64-gnu` | not installed; 1.33.0 locked | 3 | metadata unavailable in this installation | none in local package tree | locked optional platform variant; not installed on this Windows host |
| `lightningcss-linux-arm64-musl` | not installed; 1.33.0 locked | 3 | metadata unavailable in this installation | none in local package tree | locked optional platform variant; not installed on this Windows host |
| `lightningcss-linux-x64-gnu` | 1.33.0 | 3 | MPL-2.0 | `node_modules/lightningcss-linux-x64-gnu/LICENSE` | matches |
| `lightningcss-linux-x64-musl` | not installed; 1.33.0 locked | 3 | metadata unavailable in this installation | none in local package tree | locked optional platform variant; not installed on this Windows host |
| `lightningcss-win32-arm64-msvc` | not installed; 1.33.0 locked | 3 | metadata unavailable in this installation | none in local package tree | locked optional platform variant; not installed on this Windows host |
| `lightningcss-win32-x64-msvc` | not installed; 1.33.0 locked | 3 | metadata unavailable in this installation | none in local package tree | locked optional platform variant; not installed on this Windows host |
| `lodash.debounce` | 4.0.8 | 5 | MIT | `node_modules/lodash.debounce/LICENSE` | matches |
| `lodash.throttle` | 4.1.1 | 3 | MIT | `node_modules/lodash.throttle/LICENSE` | matches |
| `log-symbols` | 2.2.0 | 3 | MIT | `node_modules/log-symbols/license` | matches |
| `loose-envify` | 1.4.0 | 2 | MIT | `node_modules/loose-envify/LICENSE` | matches |
| `lru-cache` | 11.5.2 | 4 | BlueOak-1.0.0 | `node_modules/path-scurry/node_modules/lru-cache/LICENSE.md` | matches |
| `makeerror` | 1.0.12 | 4 | BSD-3-Clause | `node_modules/makeerror/license` | matches |
| `marky` | 1.3.0 | 5 | Apache-2.0 | `node_modules/marky/LICENSE` | matches |
| `memoize-one` | 5.2.1 | 1 | MIT | `node_modules/memoize-one/LICENSE` | matches |
| `merge-stream` | 2.0.0 | 4 | MIT | `node_modules/merge-stream/LICENSE` | matches |
| `metro` | 0.84.4 | 2 | MIT | none in local package tree | matches |
| `metro-babel-transformer` | 0.84.4 | 2 | MIT | none in local package tree | matches |
| `metro-cache` | 0.84.4 | 2 | MIT | none in local package tree | matches |
| `metro-cache-key` | 0.84.4 | 2 | MIT | none in local package tree | matches |
| `metro-config` | 0.84.4 | 2 | MIT | none in local package tree | matches |
| `metro-core` | 0.84.4 | 2 | MIT | none in local package tree | matches |
| `metro-file-map` | 0.84.4 | 2 | MIT | none in local package tree | matches |
| `metro-minify-terser` | 0.84.4 | 2 | MIT | none in local package tree | matches |
| `metro-resolver` | 0.84.4 | 2 | MIT | none in local package tree | matches |
| `metro-runtime` | 0.84.4 | 1 | MIT | none in local package tree | matches |
| `metro-source-map` | 0.84.4 | 1 | MIT | none in local package tree | matches |
| `metro-symbolicate` | 0.84.4 | 2 | MIT | none in local package tree | matches |
| `metro-transform-plugins` | 0.84.4 | 2 | MIT | none in local package tree | matches |
| `metro-transform-worker` | 0.84.4 | 2 | MIT | none in local package tree | matches |
| `micromatch` | 4.0.8 | 3 | MIT | `node_modules/micromatch/LICENSE` | matches |
| `mime` | 1.6.0 | 3 | MIT | `node_modules/mime/LICENSE` | matches |
| `mime-db` | 1.52.0 | 4 | MIT | `node_modules/@expo/cli/node_modules/mime-db/LICENSE` | matches |
| `mime-types` | 2.1.35 | 3 | MIT | `node_modules/@expo/cli/node_modules/mime-types/LICENSE` | matches |
| `mimic-fn` | 1.2.0 | 6 | MIT | `node_modules/mimic-fn/license` | matches |
| `minimatch` | 10.2.6 | 2 | BlueOak-1.0.0 | `node_modules/minimatch/LICENSE.md` | matches |
| `minipass` | 7.1.3 | 3 | BlueOak-1.0.0 | `node_modules/minipass/LICENSE.md` | matches |
| `mkdirp` | 1.0.4 | 4 | MIT | `node_modules/mkdirp/LICENSE` | matches |
| `ms` | 2.1.3 | 3 | MIT | `node_modules/ms/license.md` | matches |
| `multitars` | 1.0.2 | 2 | MIT | `node_modules/multitars/LICENSE.md` | matches |
| `nanoid` | 3.3.18 | 3 | MIT | `node_modules/nanoid/LICENSE` | matches |
| `negotiator` | 0.6.3 | 3 | MIT | `node_modules/@expo/cli/node_modules/negotiator/LICENSE` | matches |
| `node-fetch` | 2.7.0 | 3 | MIT | `node_modules/node-fetch/LICENSE.md` | matches |
| `node-forge` | 1.4.0 | 2 | (BSD-3-Clause OR GPL-2.0) | `node_modules/node-forge/LICENSE` | matches |
| `node-int64` | 0.4.0 | 5 | MIT | `node_modules/node-int64/LICENSE` | matches |
| `node-releases` | 2.0.53 | 3 | MIT | `node_modules/node-releases/LICENSE` | matches |
| `npm-package-arg` | 11.0.3 | 2 | ISC | `node_modules/npm-package-arg/LICENSE` | matches |
| `nullthrows` | 1.1.1 | 1 | MIT | `node_modules/nullthrows/LICENSE` | matches |
| `ob1` | 0.84.4 | 2 | MIT | none in local package tree | matches |
| `object-assign` | 4.1.1 | 2 | MIT | `node_modules/object-assign/license` | matches |
| `on-finished` | 2.4.1 | 3 | MIT | `node_modules/on-finished/LICENSE` | matches |
| `on-headers` | 1.1.0 | 3 | MIT | `node_modules/on-headers/LICENSE` | matches |
| `onetime` | 2.0.1 | 5 | MIT | `node_modules/onetime/license` | matches |
| `open` | 7.4.2 | 3 | MIT | `node_modules/open/license` | matches |
| `ora` | 3.4.0 | 2 | MIT | `node_modules/ora/license` | matches |
| `parse-png` | 2.1.0 | 2 | MIT | `node_modules/parse-png/license` | matches |
| `parseurl` | 1.3.3 | 3 | MIT | `node_modules/parseurl/LICENSE` | matches |
| `path-key` | 3.1.1 | 4 | MIT | `node_modules/path-key/license` | matches |
| `path-parse` | 1.0.7 | 6 | MIT | `node_modules/path-parse/LICENSE` | matches |
| `path-scurry` | 2.0.2 | 3 | BlueOak-1.0.0 | `node_modules/path-scurry/LICENSE.md` | matches |
| `picocolors` | 1.1.1 | 3 | ISC | `node_modules/picocolors/LICENSE` | matches |
| `picomatch` | 4.0.5 | 2 | MIT | `node_modules/picomatch/LICENSE` | matches |
| `plist` | 3.1.1 | 4 | MIT | `node_modules/plist/LICENSE` | matches |
| `pngjs` | 3.4.0 | 3 | MIT | `node_modules/pngjs/LICENSE` | matches |
| `postcss` | 8.5.26 | 2 | MIT | `node_modules/postcss/LICENSE` | matches |
| `postcss-value-parser` | 4.2.0 | 1 | MIT | `node_modules/postcss-value-parser/LICENSE` | matches |
| `pretty-format` | 29.7.0 | 1 | MIT | `node_modules/pretty-format/LICENSE` | matches |
| `proc-log` | 4.2.0 | 3 | ISC | `node_modules/proc-log/LICENSE` | matches |
| `progress` | 2.0.3 | 2 | MIT | `node_modules/progress/LICENSE` | matches |
| `promise` | 8.3.0 | 1 | MIT | `node_modules/promise/LICENSE` | matches |
| `prompts` | 2.4.2 | 2 | MIT | `node_modules/prompts/license` | matches |
| `queue` | 6.0.2 | 4 | MIT | `node_modules/queue/LICENSE` | matches |
| `range-parser` | 1.2.1 | 3 | MIT | `node_modules/send/node_modules/range-parser/LICENSE` | matches |
| `react` | 19.2.3 | 0 | MIT | `node_modules/react/LICENSE` | matches |
| `react-devtools-core` | 6.1.5 | 1 | MIT | none in local package tree | matches |
| `react-dom` | 19.2.3 | 0 | MIT | `node_modules/react-dom/LICENSE` | matches |
| `react-is` | 18.3.1 | 2 | MIT | `node_modules/react-is/LICENSE` | matches |
| `react-native` | 0.86.2 | 0 | MIT | `node_modules/react-native/LICENSE` | matches |
| `react-native-audio-api` | 0.13.2 | 0 | MIT | none in local package tree | matches |
| `react-native-safe-area-context` | 5.7.0 | 0 | MIT | `node_modules/react-native-safe-area-context/LICENSE` | matches |
| `react-native-web` | 0.21.2 | 0 | MIT | `node_modules/react-native-web/LICENSE` | matches |
| `react-refresh` | 0.14.2 | 1 | MIT | `node_modules/react-refresh/LICENSE` | matches |
| `regenerate` | 1.4.2 | 5 | MIT | `node_modules/regenerate/LICENSE-MIT.txt` | matches |
| `regenerate-unicode-properties` | 10.2.2 | 5 | MIT | `node_modules/regenerate-unicode-properties/LICENSE-MIT.txt` | matches |
| `regenerator-runtime` | 0.13.11 | 1 | MIT | `node_modules/regenerator-runtime/LICENSE` | matches |
| `regexpu-core` | 6.4.0 | 4 | MIT | `node_modules/regexpu-core/LICENSE-MIT.txt` | matches |
| `regjsgen` | 0.8.0 | 5 | MIT | `node_modules/regjsgen/LICENSE-MIT.txt` | matches |
| `regjsparser` | 0.13.2 | 5 | BSD-2-Clause | `node_modules/regjsparser/LICENSE.BSD` | matches |
| `require-directory` | 2.1.1 | 2 | MIT | `node_modules/require-directory/LICENSE` | matches |
| `resolve` | 1.22.12 | 5 | MIT | `node_modules/resolve/LICENSE` | matches |
| `resolve-from` | 5.0.0 | 2 | MIT | `node_modules/resolve-from/license` | matches |
| `resolve-workspace-root` | 2.0.1 | 2 | MIT | `node_modules/resolve-workspace-root/LICENSE.md` | matches |
| `restore-cursor` | 2.0.0 | 4 | MIT | `node_modules/restore-cursor/license` | matches |
| `safe-buffer` | 5.2.1 | 3 | MIT | `node_modules/safe-buffer/LICENSE` | matches |
| `sandbox-cli-detector` | 0.2.0 | 2 | MIT | `node_modules/sandbox-cli-detector/LICENSE` | matches |
| `sax` | 1.6.1 | 3 | BlueOak-1.0.0 | `node_modules/sax/LICENSE.md` | matches |
| `scheduler` | 0.27.0 | 1 | MIT | `node_modules/scheduler/LICENSE` | matches |
| `semver` | 7.8.5 | 1 | ISC | `node_modules/semver/LICENSE` | matches |
| `send` | 0.19.2 | 2 | MIT | `node_modules/send/LICENSE` | matches |
| `serialize-error` | 2.1.0 | 3 | MIT | `node_modules/serialize-error/license` | matches |
| `serve-static` | 1.16.3 | 3 | MIT | `node_modules/serve-static/LICENSE` | matches |
| `setimmediate` | 1.0.5 | 2 | MIT | `node_modules/setimmediate/LICENSE.txt` | matches |
| `setprototypeof` | 1.2.0 | 4 | ISC | `node_modules/setprototypeof/LICENSE` | matches |
| `shebang-command` | 2.0.0 | 4 | MIT | `node_modules/shebang-command/license` | matches |
| `shebang-regex` | 3.0.0 | 5 | MIT | `node_modules/shebang-regex/license` | matches |
| `shell-quote` | 1.10.0 | 2 | MIT | `node_modules/shell-quote/LICENSE` | matches |
| `signal-exit` | 3.0.7 | 5 | ISC | `node_modules/signal-exit/LICENSE.txt` | matches |
| `simple-plist` | 1.4.0 | 3 | MIT | `node_modules/simple-plist/LICENSE` | matches |
| `sisteransi` | 1.0.5 | 3 | MIT | `node_modules/sisteransi/license` | matches |
| `slugify` | 1.6.9 | 2 | MIT | `node_modules/slugify/LICENSE` | matches |
| `source-map` | 0.5.7 | 2 | BSD-3-Clause | `node_modules/source-map/LICENSE` | matches |
| `source-map-js` | 1.2.1 | 3 | BSD-3-Clause | `node_modules/source-map-js/LICENSE` | matches |
| `source-map-support` | 0.5.21 | 4 | MIT | `node_modules/source-map-support/LICENSE.md` | matches |
| `stackframe` | 1.3.4 | 4 | MIT | `node_modules/stackframe/LICENSE` | matches |
| `stacktrace-parser` | 0.1.11 | 1 | MIT | `node_modules/stacktrace-parser/LICENSE` | matches |
| `statuses` | 2.0.2 | 3 | MIT | `node_modules/statuses/LICENSE` | matches |
| `stream-buffers` | 2.2.0 | 3 | Unlicense | none in local package tree | matches |
| `string-width` | 4.2.3 | 2 | MIT | `node_modules/string-width/license` | matches |
| `strip-ansi` | 5.2.0 | 3 | MIT | `node_modules/ora/node_modules/strip-ansi/license` | matches |
| `structured-headers` | 0.4.1 | 2 | MIT | none in local package tree | matches |
| `styleq` | 0.1.3 | 1 | MIT | `node_modules/styleq/LICENSE` | matches |
| `supports-color` | 7.2.0 | 3 | MIT | `node_modules/supports-color/license` | matches |
| `supports-hyperlinks` | 2.3.0 | 3 | MIT | `node_modules/supports-hyperlinks/license` | matches |
| `supports-preserve-symlinks-flag` | 1.0.0 | 6 | MIT | `node_modules/supports-preserve-symlinks-flag/LICENSE` | matches |
| `terminal-link` | 2.1.1 | 2 | MIT | `node_modules/terminal-link/license` | matches |
| `terser` | 5.50.0 | 3 | BSD-2-Clause | `node_modules/terser/LICENSE` | matches |
| `throat` | 5.0.0 | 3 | MIT | `node_modules/throat/LICENSE` | matches |
| `tinyglobby` | 0.2.17 | 1 | MIT | `node_modules/tinyglobby/LICENSE` | matches |
| `tmpl` | 1.0.5 | 5 | BSD-3-Clause | `node_modules/tmpl/license` | matches |
| `to-regex-range` | 5.0.1 | 6 | MIT | `node_modules/to-regex-range/LICENSE` | matches |
| `toidentifier` | 1.0.1 | 4 | MIT | `node_modules/toidentifier/LICENSE` | matches |
| `toqr` | 0.1.1 | 2 | MIT | `node_modules/toqr/LICENSE.md` | matches |
| `tr46` | 0.0.3 | 5 | MIT | none in local package tree | matches |
| `type-fest` | 0.7.1 | 2 | (MIT OR CC0-1.0) | `node_modules/type-fest/license` | matches |
| `ua-parser-js` | 1.0.41 | 2 | MIT | `node_modules/ua-parser-js/license.md` | matches |
| `undici-types` | 8.3.0 | 5 | MIT | `node_modules/undici-types/LICENSE` | matches |
| `unicode-canonical-property-names-ecmascript` | 2.0.1 | 6 | MIT | `node_modules/unicode-canonical-property-names-ecmascript/LICENSE-MIT.txt` | matches |
| `unicode-match-property-ecmascript` | 2.0.0 | 5 | MIT | `node_modules/unicode-match-property-ecmascript/LICENSE-MIT.txt` | matches |
| `unicode-match-property-value-ecmascript` | 2.2.1 | 5 | MIT | `node_modules/unicode-match-property-value-ecmascript/LICENSE-MIT.txt` | matches |
| `unicode-property-aliases-ecmascript` | 2.2.0 | 6 | MIT | `node_modules/unicode-property-aliases-ecmascript/LICENSE-MIT.txt` | matches |
| `unpipe` | 1.0.0 | 4 | MIT | `node_modules/unpipe/LICENSE` | matches |
| `update-browserslist-db` | 1.3.1 | 3 | MIT | `node_modules/update-browserslist-db/LICENSE` | matches |
| `utils-merge` | 1.0.1 | 3 | MIT | `node_modules/utils-merge/LICENSE` | matches |
| `uuid` | 7.0.3 | 3 | MIT | `node_modules/uuid/LICENSE.md` | matches |
| `validate-npm-package-name` | 5.0.1 | 3 | ISC | `node_modules/validate-npm-package-name/LICENSE` | matches |
| `vary` | 1.1.2 | 3 | MIT | `node_modules/vary/LICENSE` | matches |
| `vlq` | 1.0.1 | 2 | MIT | `node_modules/vlq/LICENSE` | matches |
| `walker` | 1.0.8 | 3 | Apache-2.0 | `node_modules/walker/LICENSE` | matches |
| `wcwidth` | 1.0.1 | 3 | MIT | `node_modules/wcwidth/LICENSE` | matches |
| `webidl-conversions` | 3.0.1 | 5 | BSD-2-Clause | `node_modules/webidl-conversions/LICENSE.md` | matches |
| `whatwg-fetch` | 3.6.20 | 1 | MIT | `node_modules/whatwg-fetch/LICENSE` | matches |
| `whatwg-url` | 5.0.0 | 4 | MIT | `node_modules/whatwg-url/LICENSE.txt` | matches |
| `whatwg-url-minimum` | 0.1.2 | 1 | MIT | `node_modules/whatwg-url-minimum/LICENSE.md` | matches |
| `which` | 2.0.2 | 4 | ISC | `node_modules/which/LICENSE` | matches |
| `wrap-ansi` | 7.0.0 | 2 | MIT | `node_modules/wrap-ansi/license` | matches |
| `ws` | 7.5.13 | 1 | MIT | `node_modules/ws/LICENSE` | matches |
| `xcode` | 3.0.1 | 2 | Apache-2.0 | `node_modules/xcode/LICENSE`<br>`node_modules/xcode/NOTICE` | matches |
| `xml2js` | 0.6.0 | 2 | MIT | `node_modules/xml2js/LICENSE` | matches |
| `xmlbuilder` | 15.1.1 | 3 | MIT | `node_modules/xmlbuilder/LICENSE` | matches |
| `y18n` | 5.0.8 | 2 | ISC | `node_modules/y18n/LICENSE` | matches |
| `yaml` | 2.9.0 | 3 | ISC | `node_modules/yaml/LICENSE` | matches |
| `yargs` | 17.7.3 | 1 | MIT | `node_modules/yargs/LICENSE` | matches |
| `yargs-parser` | 21.1.1 | 2 | ISC | `node_modules/yargs-parser/LICENSE.txt` | matches |
| `zod` | 3.25.76 | 2 | MIT | `node_modules/zod/LICENSE` | matches |

## Development/build-only direct dependencies

| Package | Requested range | Installed exact version | Declared license | Existing license/notice files |
|---|---|---:|---|---|
| `@types/react` | `~19.2.2` | 19.2.18 | MIT | `node_modules/@types/react/LICENSE` |
| `@types/react-dom` | `^19` | 19.2.4 | MIT | `node_modules/@types/react-dom/LICENSE` |
| `@types/react-native-web` | `^0` | 0.19.2 | MIT | `node_modules/@types/react-native-web/LICENSE` |
| `typescript` | `~6.0.3` | 6.0.3 | Apache-2.0 | `node_modules/typescript/LICENSE.txt` |

## Expo Android autolinked native packages

Resolved offline with `expo-modules-autolinking resolve --platform android --project-root app-play --json`; this resolves package sources without fetching. The explicit device-audio module is local source, not an external package.

| Package | Installed exact version | Declared license | Existing license/notice files | Native role / source evidence |
|---|---:|---|---|---|
| `@expo/dom-webview` | 57.0.1 | MIT | `node_modules/@expo/dom-webview/LICENSE` | expo-dom-webview; expo.modules.webview.DomWebViewModule |
| `@expo/log-box` | 57.0.2 | MIT | `node_modules/@expo/metro-runtime/node_modules/@expo/log-box/LICENSE` | expo-log-box; package/service registration |
| `expo` | 57.0.13 | MIT | `node_modules/expo/LICENSE` | expo; expo.modules.fetch.ExpoFetchModule |
| `expo-asset` | 57.0.19 | MIT | `node_modules/expo-asset/LICENSE` | expo-asset; expo.modules.asset.AssetModule |
| `expo-audio` | 57.0.5 | MIT | `node_modules/expo-audio/LICENSE` | expo-audio; expo.modules.audio.AudioModule |
| `expo-constants` | 57.0.11 | MIT | `node_modules/expo-constants/LICENSE` | expo-constants; expo.modules.constants.ConstantsModule |
| `expo-document-picker` | 57.0.3 | MIT | `node_modules/expo-document-picker/LICENSE` | expo-document-picker; expo.modules.documentpicker.DocumentPickerModule |
| `expo-file-system` | 57.0.4 | MIT | `node_modules/expo-file-system/LICENSE` | expo-file-system; expo.modules.filesystem.FileSystemModule, expo.modules.filesystem.legacy.FileSystemLegacyModule |
| `expo-font` | 57.0.1 | MIT | `node_modules/expo-font/LICENSE` | expo-font; expo.modules.font.FontLoaderModule, expo.modules.font.FontUtilsModule |
| `expo-image-loader` | 57.0.1 | MIT | `node_modules/expo-image-loader/LICENSE` | expo-image-loader; package/service registration |
| `expo-image-manipulator` | 57.0.21 | MIT | `node_modules/expo-image-manipulator/LICENSE` | expo-image-manipulator; expo.modules.imagemanipulator.ImageManipulatorModule |
| `expo-image-picker` | 57.0.20 | MIT | `node_modules/expo-image-picker/LICENSE` | expo-image-picker; expo.modules.imagepicker.ImagePickerModule |
| `expo-keep-awake` | 57.0.1 | MIT | `node_modules/expo-keep-awake/LICENSE` | expo-keep-awake; expo.modules.keepawake.KeepAwakeModule |
| `expo-modules-core` | 57.0.11 | MIT | `node_modules/expo-modules-core/LICENSE` | expo-modules-core; package/service registration |
| `expo-status-bar` | 57.0.1 | MIT | `node_modules/expo-status-bar/LICENSE` | expo-status-bar; package/service registration |
| `soundboard-device-audio` | 1.0.0 | not declared in installed package.json | none found | Local `app-play/play-native-modules/soundboard-device-audio` (DSP and capture bridge) |

## Native dependency versions declared by installed Gradle manifests


## React Native native packages outside Expo module autolinking

| Package | Exact installed version | Declared package license | Existing license/notice file | Native role/source |
|---|---:|---|---|---|
| `react-native` | 0.86.2 | MIT | `node_modules/react-native/LICENSE` | React Android runtime, Hermes/JSI and Gradle plugin |
| `react-native-audio-api` | 0.13.2 baseline package | MIT | no conventional license file in the untouched baseline host package; an exact upstream MIT license text is now embedded in the Play notices dataset with source provenance | Native C++ audio engine/DSP, CMake and AudioTrack/Oboe integration |
| `@react-native-community/netinfo` | 12.0.1 | MIT | `node_modules/@react-native-community/netinfo/LICENSE` | Android network-state bridge (confirm used runtime feature) |
| `react-native-safe-area-context` | 5.7.0 | MIT | `node_modules/react-native-safe-area-context/LICENSE` | Safe-area native view/bridge |

## Native dependency versions declared by installed Gradle manifests

| Artifact / module | Declared version or range | Gradle source | License / NOTICE metadata status |
|---|---|---|---|
| `androidx.media3:media3-*` (session, UI, ExoPlayer, DASH, HLS, SmoothStreaming, data sources) | `1.9.0` | `node_modules/expo-audio/android/build.gradle` | Maven POM license/NOTICE was not inspected locally; collect from resolved Gradle graph. |
| `androidx.appcompat:appcompat` | `1.7.1` | `node_modules/expo-audio/android/build.gradle` | Maven POM license/NOTICE not inspected locally. |
| `androidx.core:core-ktx` | `1.15.0` in expo-audio; `1.17.0` in Expo modules core | respective installed Gradle manifests | Gradle conflict resolution selects final version; Maven POM license/NOTICE not inspected. |
| `androidx.activity:activity-ktx` | `1.11.0` | `node_modules/expo-image-picker/android/build.gradle` | System picker integration; Maven POM license/NOTICE not inspected. |
| `androidx.exifinterface:exifinterface` | `1.4.1` | `node_modules/expo-image-picker/android/build.gradle` | Gallery/image metadata. |
| `com.vanniktech:android-image-cropper` | `4.7.0` | `node_modules/expo-image-picker/android/build.gradle` | Native image picker crop module. |
| `org.jetbrains.kotlinx:kotlinx-coroutines-{android,core}` | `1.10.2` | `node_modules/expo-image-picker/android/build.gradle` | Concurrent picker operations. |
| `commons-io:commons-io` | `2.6` document picker; `1.4` file system | respective installed Gradle manifests | Final Gradle resolution/duplicate reconciliation pending. |
| `commons-codec:commons-codec` | `1.10` | `node_modules/expo-file-system/android/build.gradle` | File-system module dependency. |
| `com.squareup.okhttp3:okhttp`, `okhttp-urlconnection` | `4.9.2` | `node_modules/expo-file-system/android/build.gradle` | Used by FileSystem module; verify app behavior/network inspection independently. |
| `com.squareup.okio:okio` | `2.9.0` | `node_modules/expo-file-system/android/build.gradle` | File-system transitive. |
| `androidx.documentfile:documentfile` | `1.1.0` | `node_modules/expo-file-system/android/build.gradle` | SAF/document provider support. |
| `com.google.oboe:oboe` | `1.9.3` | `node_modules/react-native-audio-api/android/build.gradle` | Native audio engine. |
| `androidx.media:media` | `1.7.0` | `node_modules/react-native-audio-api/android/build.gradle` | Native audio API dependency. |
| `androidx.core:core-ktx` | `1.13.1` | `node_modules/react-native-audio-api/android/build.gradle` | Gradle selects a single resolved version across modules. |
| `com.facebook.fbjni:fbjni` | `0.6.0` (audio API); `0.5.1` compileOnly (Expo core) | respective installed Gradle manifests | Record resolved version from Android build report. |
| `com.facebook.react:react-android` | `0.86.2` (from installed React Native) | Expo/RN Gradle plugin | Native React runtime; exact Maven coordinate/report should be attached from build. |
| `org.jetbrains.kotlin:kotlin-stdlib*`, `kotlin-reflect` | Kotlin plugin/template selected | Expo modules core and Android template | Exact resolved Kotlin/plugin versions remain build-report evidence. |
| `androidx.annotation:annotation` | `1.9.1` | `node_modules/expo-modules-core/android/build.gradle` | Expo module core. |
| `org.jetbrains.kotlinx:kotlinx-coroutines-{android,core}` | `1.10.2` | `node_modules/expo-modules-core/android/build.gradle` | Expo module core; resolved versions in Gradle report. |
| `androidx.tracing:tracing-ktx` | `1.2.0` | `node_modules/expo-modules-core/android/build.gradle` | Native trace integration. |
| `io.github.lukmccall.pika:pika-api` | `0.3.2` | `node_modules/expo-modules-core/android/build.gradle` | Expo modules core dependency; notice inventory still required. |
| `junit:junit` | `4.13.2` | Expo/native module `testImplementation` | Test-only; not app runtime payload. |
| Android Gradle Plugin / Kotlin Gradle Plugin | Expo template/toolchain | `app-client/android/build.gradle` and Expo template | Host template declares classpaths without local versions; exact build image and resolved Gradle report must be recorded. |

## Local module and native toolchain

- `soundboard-device-audio@1.0.0` is a private local Play module and contributes the native playback DSP bridge; its local capture classes remain in the source module. `app.config.js` omits the projection manifest plugin by default. The local module still has no license declaration or LICENSE/NOTICE file found; owner attribution and license treatment remain open.
- `react-native-audio-api@0.13.2` builds C++ with the installed Android NDK; module Gradle sets `ANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON` and `useLegacyPackaging=false`. The untouched baseline package's download task targets the upstream FFmpeg bundle, but the coordinator has separately built FFmpeg 8.0.3 from source; see [the native dependency audit](NATIVE_DEPENDENCY_AUDIT-2026-10-25.md). Do not treat baseline package metadata as provenance for the separately built libraries or final APK.
- Toolchain source currently requests JDK 21, Node major 24, Android platform/build tools 36/36.0.0, NDK 27.1.12297006 and CMake 3.22.1. Dockerfile base images and apt repository state remain mutable; release-info records the built image ID but this is not bit-for-bit reproducibility.

## Final r3 resolved graph delta — 25 Oct 2026

The baseline columns above are not the final graph. The production r3 APK/AAB build resolved and recorded the following dependency versions in [`releaseRuntimeClasspath`](../../data/play-readiness-security-20261025-r3/artifacts/gradle-release-runtime-dependencies.txt):

| Component | Final r3 selected version / provenance |
| --- | --- |
| `commons-io:commons-io` | 2.22.0 (mediates Expo file-picker and file-system requests) |
| `com.google.code.gson:gson` | 2.14.0 |
| `com.squareup.okhttp3:okhttp` | 4.12.0; `okhttp-urlconnection` 4.9.2 |
| `com.squareup.okio:okio` | 3.16.0 |
| `com.google.oboe:oboe` | 1.9.3 |
| AndroidX Media3 | 1.9.0 modules |
| FFmpeg native libraries | Locally built FFmpeg 8.0.3 for arm64-v8a/x86_64; all 16 packaged FFmpeg library instances matched validated outputs. See [native audit](NATIVE_DEPENDENCY_AUDIT-2026-10-25.md). |

An OSV batch over all 160 selected Maven coordinates returned zero affected-version results; see the [query](../../data/native-maven-osv-query-final-20261025.json), [result](../../data/native-maven-osv-result-final-20261025.json), and [summary](../../data/native-maven-osv-final-summary-20261025.log). This scan does not close Maven license attribution or legal review.

The final isolated JavaScript graph is separate from the untouched host `node_modules` baseline. It resolves `image-size@2.0.3`, `zod@4.6.6`, and `uuid@11.1.1`; Metro's image-size API compatibility and the Expo/Xcode callsites were covered by the final checks. It uses a local `node-forge@1.4.0` patch whose raw high advisory remains in npm audit and is classified only through exact patch/installed-file/regression evidence. See [the JavaScript dependency audit](DEPENDENCY_AUDIT-2026-10-25.md) and the isolated [`yarn.lock`](../../data/audit-final-output/yarn.lock).

The unsigned production r3 APK/AAB and hashes are recorded in [verification](VERIFICATION-2026-10-25.md) and [artifact SHA256SUMS](../../data/play-readiness-security-20261025-r3/artifacts/SHA256SUMS). The source/build report does not substitute for signed Play delivery or runtime/device QA.

## Excluded workspaces and conditional packages

- Root Yarn workspaces also install `app-client`, `service`, `worker`, `shared` and their dependency graphs for monorepo development. They are not Play runtime dependencies unless brought into `app-play` through the explicit stage allowlist. The Play stage uses only selected shared source leaves and excludes YouTube modules.
- Root/service dependencies such as `better-sqlite3`, Cloudflare/Worker libraries, server media tools and Dev app YouTube packages are not included in this Play production closure.
- Play `devDependencies` (`@types/*`, TypeScript) are build/test-only. The local Yarn install may contain workspace-wide unrelated dev packages; the Play stage does not stage their code.

## Notice bundle implemented; attribution review remains open

- Play now embeds a searchable [`openSourceNotices.json`](../../app-play/src/data/openSourceNotices.json) dataset of 479 records (801,284 bytes), including direct `react-native-audio-api@0.13.2` MIT text with upstream provenance and FFmpeg 8.0.3 LGPL-2.1-or-later text, source URL and source SHA-256. The dataset records the separate native FFmpeg runtime and identifies the local build as modified; it is not a legal-compliance guarantee or source-distribution statement.
- Settings exposes the searchable notices list. The dataset still has 43 package records whose license text is unavailable locally and falls back to license metadata; those entries need notice-file/provenance review. The separate native Maven attribution inventory is not complete, and the local `soundboard-device-audio` license treatment remains open.
- The r3 APK/AAB build has completed, but Maven POM/NOTICE texts, multi-license terms and native library attribution still need reconciliation with the recorded runtime graph before release.
- This offline inventory did not perform its own vulnerability scan. Owner-approved npm scans, including the post-patch reports and remaining findings, are recorded in [the dependency audit report](DEPENDENCY_AUDIT-2026-10-25.md). This inventory does not clear CVEs or assess native Android library vulnerabilities.

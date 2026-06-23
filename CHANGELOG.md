## [0.13.2](https://github.com/murongg/markra/compare/v0.13.1...v0.13.2) (2026-06-22)

### Features

* **app:** add file tree multi-selection ([#371](https://github.com/murongg/markra/issues/371)) ([92b1850](https://github.com/murongg/markra/commit/92b18502743324b29d5103e701ff959bd5edcd8f)), closes [#364](https://github.com/murongg/markra/issues/364)
* **app:** add local image import workflows ([#375](https://github.com/murongg/markra/issues/375)) ([2f3e79d](https://github.com/murongg/markra/commit/2f3e79d8e68403773f5ee84d293430ac4d29ed34))

### Bug Fixes

* **app:** swap conflicting keyboard shortcuts ([#376](https://github.com/murongg/markra/issues/376)) ([9da2746](https://github.com/murongg/markra/commit/9da27462179b04100c77a90b356fcbee57a10ba7))
* **editor:** restore horizontal rule selection ([#374](https://github.com/murongg/markra/issues/374)) ([5477360](https://github.com/murongg/markra/commit/547736024dca93110da2e29dbb68efa3ecc2d147))

## [0.13.1](https://github.com/murongg/markra/compare/v0.13.0...v0.13.1) (2026-06-21)

### Bug Fixes

* **app:** ignore stale visual editor state after saves ([#367](https://github.com/murongg/markra/issues/367)) ([2859509](https://github.com/murongg/markra/commit/2859509669614979f480a3f67b521d79f9024e7b))
* **app:** restore tabs from current workspace state ([#370](https://github.com/murongg/markra/issues/370)) ([96d33d1](https://github.com/murongg/markra/commit/96d33d1c7f3bb3be134c680dfba7f15d4d53aca6))
* **editor:** correct split pane tabs and file reveal ([#362](https://github.com/murongg/markra/issues/362)) ([1eb96d4](https://github.com/murongg/markra/commit/1eb96d4bb43e963dbb7628bb74909516b124cf07))
* **editor:** stabilize image block interactions ([#369](https://github.com/murongg/markra/issues/369)) ([5121ca9](https://github.com/murongg/markra/commit/5121ca96902f268ebe72e3d5ec1eca5b030bb9a5))
* improve linux window controls ([#368](https://github.com/murongg/markra/issues/368)) ([ede9ac0](https://github.com/murongg/markra/commit/ede9ac03262b97bb0eb94cdafabdaefef5c50095))

## [0.13.0](https://github.com/murongg/markra/compare/v0.12.8...v0.13.0) (2026-06-20)

### Features

* **app:** add automatic Markdown saves ([#357](https://github.com/murongg/markra/issues/357)) ([17dd2eb](https://github.com/murongg/markra/commit/17dd2ebb0c1031a4e175843087971fbcde353fb6)), closes [#356](https://github.com/murongg/markra/issues/356)
* **app:** improve side-by-side document tabs ([#359](https://github.com/murongg/markra/issues/359)) ([eaf7b2c](https://github.com/murongg/markra/commit/eaf7b2ceb63ffe94e693ec7e7525a02b2c67c0a0))
* **app:** reveal active file in file tree ([#358](https://github.com/murongg/markra/issues/358)) ([bfc0aab](https://github.com/murongg/markra/commit/bfc0aabe48a105127dbf46851dcb1980a8df2ffb))

### Bug Fixes

* **editor:** ignore horizontal rule surrounding clicks ([#354](https://github.com/murongg/markra/issues/354)) ([ebfc6ad](https://github.com/murongg/markra/commit/ebfc6ad1a6fa46974d912696ef68d6d9930b4483))

## [0.12.8](https://github.com/murongg/markra/compare/v0.12.7...v0.12.8) (2026-06-19)

### Bug Fixes

* **app:** preserve undo history after save ([#352](https://github.com/murongg/markra/issues/352)) ([aa6a57b](https://github.com/murongg/markra/commit/aa6a57b1cf9946ea84cd4bfb4aa2b5570b5c7195))
* **app:** prevent compact text clipping ([#353](https://github.com/murongg/markra/issues/353)) ([37aa6c8](https://github.com/murongg/markra/commit/37aa6c80f3443fe0731e8e304cf3b8d9dc38fed0))
* **editor:** ignore math delimiters in inline code ([#351](https://github.com/murongg/markra/issues/351)) ([cd62408](https://github.com/murongg/markra/commit/cd624081b56f08064672a4f6de3ff26ac3dd29a0))

## [0.12.7](https://github.com/murongg/markra/compare/v0.12.6...v0.12.7) (2026-06-19)

### Features

* **app:** remember file tree sort by workspace ([#346](https://github.com/murongg/markra/issues/346)) ([6f7f1e1](https://github.com/murongg/markra/commit/6f7f1e198610daafef4f6bb5868666f034255099)), closes [#299](https://github.com/murongg/markra/issues/299)
* **app:** show selected word count in status ([#344](https://github.com/murongg/markra/issues/344)) ([48b6414](https://github.com/murongg/markra/commit/48b6414b161088312edaab0d9534ec8444e7ffc2)), closes [#340](https://github.com/murongg/markra/issues/340)

### Bug Fixes

* **app:** polish Windows titlebar borders ([#345](https://github.com/murongg/markra/issues/345)) ([bfbbd09](https://github.com/murongg/markra/commit/bfbbd09de2a9558b6cb54e7fc67a64742720f6da))
* **app:** restore persisted settings state ([#348](https://github.com/murongg/markra/issues/348)) ([13d5cbb](https://github.com/murongg/markra/commit/13d5cbbd3381f0bb161e6c712f1fd6a2a901a675))
* **desktop:** add macOS 27 WebKit scroll workaround ([#343](https://github.com/murongg/markra/issues/343)) ([07fc409](https://github.com/murongg/markra/commit/07fc40952c8eee92df8f410cd2fdc99ba6bfb46d))
* **desktop:** restore Windows titlebar double-click toggle ([#342](https://github.com/murongg/markra/issues/342)) ([27e6433](https://github.com/murongg/markra/commit/27e6433fe34d68699c6cfc4dc7658bc91c33ec11))
* **editor:** reduce horizontal rule click dead zone ([#341](https://github.com/murongg/markra/issues/341)) ([a28f59e](https://github.com/murongg/markra/commit/a28f59e98a85bb921957376bc0f6f1ec37bd9b09))

## [0.12.6](https://github.com/murongg/markra/compare/v0.12.5...v0.12.6) (2026-06-19)

### Features

* **app:** remember recent folder section state ([#336](https://github.com/murongg/markra/issues/336)) ([8f82c6e](https://github.com/murongg/markra/commit/8f82c6e6615712ea4fffbc7b0658f5ffc78627c3))

### Bug Fixes

* **app:** clarify duplicate recent folders ([#335](https://github.com/murongg/markra/issues/335)) ([75b1e3c](https://github.com/murongg/markra/commit/75b1e3cff6f30682d5813845caf953fb7f096f0f))
* **app:** sync sidebar collapse animation ([#339](https://github.com/murongg/markra/issues/339)) ([ada2ab9](https://github.com/murongg/markra/commit/ada2ab98b1bdcf2b931a1fc5bccdfec055ef8a1b))

## [0.12.5](https://github.com/murongg/markra/compare/v0.12.4...v0.12.5) (2026-06-18)

### Features

* **app:** add containing folder action ([#333](https://github.com/murongg/markra/issues/333)) ([ad63aac](https://github.com/murongg/markra/commit/ad63aac5c220bf2712ce1fc4e019568b9edf7d4d))

### Bug Fixes

* **app:** restore file tree input editing commands ([#329](https://github.com/murongg/markra/issues/329)) ([46bfbd8](https://github.com/murongg/markra/commit/46bfbd8dccad46727b4ebc853df3c446578106bd))
* **app:** restore visual editor after hidden tab opens ([#332](https://github.com/murongg/markra/issues/332)) ([fd64f1f](https://github.com/murongg/markra/commit/fd64f1f3b45a6340e3f7530e6814a6826b05c533)), closes [#324](https://github.com/murongg/markra/issues/324)

## [0.12.4](https://github.com/murongg/markra/compare/v0.12.3...v0.12.4) (2026-06-18)

### Features

* **editor:** add system font selection ([#328](https://github.com/murongg/markra/issues/328)) ([acad7ea](https://github.com/murongg/markra/commit/acad7ea3d5814247f5db742340c969c274f07629))

### Bug Fixes

* **editor:** ignore horizontal rule margin clicks ([#327](https://github.com/murongg/markra/issues/327)) ([51ae2ff](https://github.com/murongg/markra/commit/51ae2ff52ad58eefdefadbc307957b74f4bbfc31))

## [0.12.3](https://github.com/murongg/markra/compare/v0.12.2...v0.12.3) (2026-06-18)

### Features

* **editor:** add paragraph option to heading controls ([#322](https://github.com/murongg/markra/issues/322)) ([e7d6400](https://github.com/murongg/markra/commit/e7d6400b43b0c94e263c5b8a062991b51a21cda8)), closes [#284](https://github.com/murongg/markra/issues/284)

### Bug Fixes

* **desktop:** isolate editor window state ([#325](https://github.com/murongg/markra/issues/325)) ([2d235c9](https://github.com/murongg/markra/commit/2d235c9ab7fb201f2ed37031b1417e2984619dad))
* **markdown:** preserve leading marker prefixes in heading outline ([#315](https://github.com/murongg/markra/issues/315)) ([#316](https://github.com/murongg/markra/issues/316)) ([cdc38cd](https://github.com/murongg/markra/commit/cdc38cdb893d58cff394af1311fb70761e0d9104))

## [0.12.2](https://github.com/murongg/markra/compare/v0.12.0...v0.12.2) (2026-06-17)

### Features

* **app:** split appearance mode and theme palettes ([#319](https://github.com/murongg/markra/issues/319)) ([cc078f8](https://github.com/murongg/markra/commit/cc078f8adbace1f4590673536fdbc940c9b564c9)), closes [#314](https://github.com/murongg/markra/issues/314)

### Bug Fixes

* **app:** prevent stale save prompts after visual saves ([#312](https://github.com/murongg/markra/issues/312)) ([60eee57](https://github.com/murongg/markra/commit/60eee5725824c735dc4cfc16da3717dc2f3aa222))
* **app:** reset settings scroll on category changes ([#317](https://github.com/murongg/markra/issues/317)) ([da2bbcb](https://github.com/murongg/markra/commit/da2bbcb4aafcf7c63220a7118bbd24914d560a94))

## [0.12.0](https://github.com/murongg/markra/compare/v0.11.12...v0.12.0) (2026-06-17)

### Features

* **desktop:** add Windows self-drawn chrome ([#310](https://github.com/murongg/markra/issues/310)) ([5c9b821](https://github.com/murongg/markra/commit/5c9b821ba3497a9290a27ef4a1484e5b734fca8e))

## [0.11.12](https://github.com/murongg/markra/compare/v0.11.11...v0.11.12) (2026-06-17)

### Features

* **desktop:** add markra shell command installer ([#309](https://github.com/murongg/markra/issues/309)) ([722ad87](https://github.com/murongg/markra/commit/722ad8790420479f52535b8de12b2bcd13b6adc6)), closes [#291](https://github.com/murongg/markra/issues/291)

### Bug Fixes

* **editor:** hide pane-level horizontal scrollbars ([#307](https://github.com/murongg/markra/issues/307)) ([398b775](https://github.com/murongg/markra/commit/398b7752549037d91ab4c71b2caa549a663b606c))

## [0.11.11](https://github.com/murongg/markra/compare/v0.11.10...v0.11.11) (2026-06-16)

### Bug Fixes

* **editor:** avoid highlights across inline code ([#305](https://github.com/murongg/markra/issues/305)) ([6231c26](https://github.com/murongg/markra/commit/6231c267ec84a3d8f530e5d96fb1aeac82a7137e)), closes [#303](https://github.com/murongg/markra/issues/303)
* **editor:** prevent blank clicks from jumping to document end ([#304](https://github.com/murongg/markra/issues/304)) ([bcb9d65](https://github.com/murongg/markra/commit/bcb9d6553015be6c114ccd21ddb84b0a76825384)), closes [#294](https://github.com/murongg/markra/issues/294)

## [0.11.10](https://github.com/murongg/markra/compare/v0.11.9...v0.11.10) (2026-06-16)

### Bug Fixes

* **desktop:** restore Windows context menu paste ([#302](https://github.com/murongg/markra/issues/302)) ([93a8b16](https://github.com/murongg/markra/commit/93a8b16dc63553e13315a3c8fb42a60101d80a6a)), closes [#300](https://github.com/murongg/markra/issues/300)

## [0.11.9](https://github.com/murongg/markra/compare/v0.11.8...v0.11.9) (2026-06-15)

### Bug Fixes

* **app:** ignore stale visual editor changes after save ([#297](https://github.com/murongg/markra/issues/297)) ([a15640d](https://github.com/murongg/markra/commit/a15640d71b061baf75c2a264224c028344b3c89e)), closes [#293](https://github.com/murongg/markra/issues/293)
* **desktop:** reveal startup window after UI is ready ([#298](https://github.com/murongg/markra/issues/298)) ([39b9a00](https://github.com/murongg/markra/commit/39b9a00c69e2fe5205adf26ccfc7ba6b2ebf79d8))

## [0.11.8](https://github.com/murongg/markra/compare/v0.11.7...v0.11.8) (2026-06-15)

### Features

* **app:** improve editor source and outline behavior ([#296](https://github.com/murongg/markra/issues/296)) ([7b78143](https://github.com/murongg/markra/commit/7b78143fd7fa13108a9be1a2fe6dcfd342e1473a))

### Bug Fixes

* **outline:** render formatted heading titles ([#295](https://github.com/murongg/markra/issues/295)) ([78065f9](https://github.com/murongg/markra/commit/78065f91b62bf9d862d5d90f09d95062dda09674)), closes [#285](https://github.com/murongg/markra/issues/285)

## [0.11.7](https://github.com/murongg/markra/compare/v0.11.5...v0.11.7) (2026-06-15)

### Features

* **desktop:** route OS-opened Markdown files to tabs ([#286](https://github.com/murongg/markra/issues/286)) ([ebb252e](https://github.com/murongg/markra/commit/ebb252efa07397619b9395bf5f5396a9de5bc53f)), closes [#282](https://github.com/murongg/markra/issues/282)

### Bug Fixes

* **app:** commit file tree rename on outside click ([#289](https://github.com/murongg/markra/issues/289)) ([832afaa](https://github.com/murongg/markra/commit/832afaa9e33c5f05aa62479ca1fefd6d36c850bc)), closes [#275](https://github.com/murongg/markra/issues/275)
* **app:** reuse Windows file tree tabs by path equivalence ([#290](https://github.com/murongg/markra/issues/290)) ([6d437fb](https://github.com/murongg/markra/commit/6d437fb1ebfcb9fe4dff1cb298761bab4f016171)), closes [#262](https://github.com/murongg/markra/issues/262)
* **editor:** create trailing paragraphs after body and math ([#292](https://github.com/murongg/markra/issues/292)) ([1dd8168](https://github.com/murongg/markra/commit/1dd8168081ac2d58f516307fa068df371c9dd814)), closes [#283](https://github.com/murongg/markra/issues/283)
* **sync:** default remote folder to markra ([#288](https://github.com/murongg/markra/issues/288)) ([69e858f](https://github.com/murongg/markra/commit/69e858f63569a2d9cbbfe80a1b1d4920220519d0))

## [0.11.5](https://github.com/murongg/markra/compare/v0.11.4...v0.11.5) (2026-06-15)

## [0.11.4](https://github.com/murongg/markra/compare/v0.11.3...v0.11.4) (2026-06-14)

### Bug Fixes

* **editor:** indent adjacent mixed-marker list items ([#277](https://github.com/murongg/markra/issues/277)) ([488ed79](https://github.com/murongg/markra/commit/488ed79da23e5cd21ca1381b9917e0519e2d9d29)), closes [#261](https://github.com/murongg/markra/issues/261)

## [0.11.3](https://github.com/murongg/markra/compare/v0.11.1...v0.11.3) (2026-06-14)

### Bug Fixes

* **desktop:** avoid redundant native menu refreshes ([b67a56b](https://github.com/murongg/markra/commit/b67a56be6634a88c1f8a21518535ab28513a27ab)), closes [#257](https://github.com/murongg/markra/issues/257)
* **desktop:** repair fullscreen window controls ([#271](https://github.com/murongg/markra/issues/271)) ([5ad40a1](https://github.com/murongg/markra/commit/5ad40a1606969be6634ebc05ce8dc1ca24a24c82)), closes [#258](https://github.com/murongg/markra/issues/258)
* **editor:** add trailing lines after terminal blocks ([#270](https://github.com/murongg/markra/issues/270)) ([976b896](https://github.com/murongg/markra/commit/976b896fc415f74405de336d5147d62c0d3f3a53))
* **editor:** stabilize source mode scroll and rules ([#272](https://github.com/murongg/markra/issues/272)) ([e04e5ba](https://github.com/murongg/markra/commit/e04e5ba601818ae35c5cf29dd62663ddc318c4a3))

## [0.11.1](https://github.com/murongg/markra/compare/v0.11.0...v0.11.1) (2026-06-14)

### Bug Fixes

* **editor:** allow right arrow past inline code delimiters ([#268](https://github.com/murongg/markra/issues/268)) ([66b8f0f](https://github.com/murongg/markra/commit/66b8f0f225d97ef7803f31fe35840dd1eca5f86c)), closes [#260](https://github.com/murongg/markra/issues/260)
* **editor:** sync link and format toolbar state ([#269](https://github.com/murongg/markra/issues/269)) ([2738746](https://github.com/murongg/markra/commit/2738746ee297174c08f932bf6c114a2d0729a03c)), closes [#259](https://github.com/murongg/markra/issues/259)

## [0.11.0](https://github.com/murongg/markra/compare/v0.10.2...v0.11.0) (2026-06-12)

### Features

* **app:** use CodeMirror for markdown source mode ([#256](https://github.com/murongg/markra/issues/256)) ([ba7d965](https://github.com/murongg/markra/commit/ba7d9658fddd94f18366213036baadd7d6d64995))

## [0.10.2](https://github.com/murongg/markra/compare/v0.10.1...v0.10.2) (2026-06-12)

### Bug Fixes

* **editor:** preserve escaped markdown literals ([#255](https://github.com/murongg/markra/issues/255)) ([9814aa4](https://github.com/murongg/markra/commit/9814aa41d430a0c3009a3d0489de8a3b775dad3f))

## [0.10.1](https://github.com/murongg/markra/compare/v0.10.0...v0.10.1) (2026-06-12)

### Features

* **editor:** add clear formatting toolbar action ([#253](https://github.com/murongg/markra/issues/253)) ([164f58f](https://github.com/murongg/markra/commit/164f58f26ddc2771b7dc054951e7fd5783ffdd43)), closes [#250](https://github.com/murongg/markra/issues/250)

## [0.10.0](https://github.com/murongg/markra/compare/v0.9.8...v0.10.0) (2026-06-12)

### Features

* **network:** add app proxy settings ([#251](https://github.com/murongg/markra/issues/251)) ([4d5cf2d](https://github.com/murongg/markra/commit/4d5cf2d9738d6d5f0ffb58b8b9f9d9ef922a23d6))

### Bug Fixes

* **editor:** stabilize quote and callout list editing ([#252](https://github.com/murongg/markra/issues/252)) ([30e269a](https://github.com/murongg/markra/commit/30e269aa1b432160237854213f947dbb4a206a9c)), closes [#224](https://github.com/murongg/markra/issues/224)

## [0.9.8](https://github.com/murongg/markra/compare/v0.9.7...v0.9.8) (2026-06-11)

### Bug Fixes

* **app:** keep collapsed file tree root on restore ([#249](https://github.com/murongg/markra/issues/249)) ([886a9cb](https://github.com/murongg/markra/commit/886a9cb93283a9bd25a1dac8339b5636b214c2fb))

## [0.9.7](https://github.com/murongg/markra/compare/v0.9.6...v0.9.7) (2026-06-11)

### Bug Fixes

* **editor:** stabilize quote list editing ([#248](https://github.com/murongg/markra/issues/248)) ([1a129a8](https://github.com/murongg/markra/commit/1a129a8838d87684789aab138b185ec495282e6c)), closes [#224](https://github.com/murongg/markra/issues/224)

## [0.9.6](https://github.com/murongg/markra/compare/v0.9.5...v0.9.6) (2026-06-11)

### Features

* **app:** support md5 image naming token ([#245](https://github.com/murongg/markra/issues/245)) ([7334fe1](https://github.com/murongg/markra/commit/7334fe17cff292190b34d34cb0936e48e2e78844)), closes [#236](https://github.com/murongg/markra/issues/236)
* **editor:** add code block line wrapping setting ([#246](https://github.com/murongg/markra/issues/246)) ([d766c7a](https://github.com/murongg/markra/commit/d766c7a65e24e0535da29558ba2d1817e1fbec96))

## [0.9.5](https://github.com/murongg/markra/compare/v0.9.4...v0.9.5) (2026-06-11)

### Bug Fixes

* **app:** stabilize untitled markdown saves ([#243](https://github.com/murongg/markra/issues/243)) ([48783eb](https://github.com/murongg/markra/commit/48783eb75d0448a9495acbe3d3d157e061189d83)), closes [#238](https://github.com/murongg/markra/issues/238)
* **editor:** stabilize callout list deletion ([#244](https://github.com/murongg/markra/issues/244)) ([e72af9c](https://github.com/murongg/markra/commit/e72af9c6a0a785f3f7d561b02dcb658b2a6777bc)), closes [#224](https://github.com/murongg/markra/issues/224)
* **editor:** support horizontal rule block dragging ([#241](https://github.com/murongg/markra/issues/241)) ([0c40012](https://github.com/murongg/markra/commit/0c40012a134c8e99a19e17b02661ceaf7ec7c764))

## [0.9.4](https://github.com/murongg/markra/compare/v0.9.3...v0.9.4) (2026-06-10)

### Bug Fixes

* **editor:** add trailing line after terminal blocks ([#233](https://github.com/murongg/markra/issues/233)) ([d114836](https://github.com/murongg/markra/commit/d114836b535adb00d548969cf8ed8ca2c2f66e15))
* **editor:** scope Shift+Tab list lifting ([#239](https://github.com/murongg/markra/issues/239)) ([2337a4d](https://github.com/murongg/markra/commit/2337a4d7fb162c34d32d736531293c1c04141db3)), closes [#224](https://github.com/murongg/markra/issues/224)
* **editor:** stabilize callout deletion and edit history ([#237](https://github.com/murongg/markra/issues/237)) ([e87a445](https://github.com/murongg/markra/commit/e87a4457d1c268fb58d4c06938cd1d58c1cb16b3)), closes [#224](https://github.com/murongg/markra/issues/224)

## [0.9.3](https://github.com/murongg/markra/compare/v0.9.2...v0.9.3) (2026-06-10)

### Bug Fixes

* **app:** distinguish nested unordered list markers ([#230](https://github.com/murongg/markra/issues/230)) ([2d1a2da](https://github.com/murongg/markra/commit/2d1a2dae949de5be8476f484af4166652b8747d2))

## [0.9.2](https://github.com/murongg/markra/compare/v0.9.1...v0.9.2) (2026-06-10)

### Bug Fixes

* **editor:** improve callout and table editing ([#228](https://github.com/murongg/markra/issues/228)) ([ca97b77](https://github.com/murongg/markra/commit/ca97b771735c4f68215d3c111fcefa1179839758))

## [0.9.1](https://github.com/murongg/markra/compare/v0.9.0...v0.9.1) (2026-06-09)

### Bug Fixes

* **editor:** stabilize callout enter handling ([#225](https://github.com/murongg/markra/issues/225)) ([5f847d4](https://github.com/murongg/markra/commit/5f847d45dfbebc7046bf341a635f9975307f5b6f))
* preserve scroll progress across editor modes ([#227](https://github.com/murongg/markra/issues/227)) ([d1ed2aa](https://github.com/murongg/markra/commit/d1ed2aacb47f63bf9da94e02f0ab12717560e44f)), closes [#226](https://github.com/murongg/markra/issues/226)

## [0.9.0](https://github.com/murongg/markra/compare/v0.8.1...v0.9.0) (2026-06-08)

### Features

* **backup:** add local folder backups ([#222](https://github.com/murongg/markra/issues/222)) ([3f0fcb3](https://github.com/murongg/markra/commit/3f0fcb3007e736979e6705ad855f4483aa8af223))
* **sync:** add WebDAV remote sync ([#223](https://github.com/murongg/markra/issues/223)) ([075e3a5](https://github.com/murongg/markra/commit/075e3a5563d18aed7ea6327af2759b08bef2149f))

## [0.8.1](https://github.com/murongg/markra/compare/v0.8.0...v0.8.1) (2026-06-06)

### Features

* **editor:** add all-folds shortcut ([#221](https://github.com/murongg/markra/issues/221)) ([243c3d1](https://github.com/murongg/markra/commit/243c3d16f2e3497e3eb70f6cb286aec89339c09f))

## [0.8.0](https://github.com/murongg/markra/compare/v0.7.6...v0.8.0) (2026-06-06)

### Features

* **app:** add quick open file picker ([#217](https://github.com/murongg/markra/issues/217)) ([3c5bf4a](https://github.com/murongg/markra/commit/3c5bf4a3c5b2b7ebd7fb4f6eb16ab5e427c1e3d1)), closes [#201](https://github.com/murongg/markra/issues/201)

## [0.7.6](https://github.com/murongg/markra/compare/v0.7.5...v0.7.6) (2026-06-05)

### Bug Fixes

* **app:** fix file tree context menu rename ([#216](https://github.com/murongg/markra/issues/216)) ([57f3ba9](https://github.com/murongg/markra/commit/57f3ba990c75365bbcec2f17bc0434aef384d204))

### Performance Improvements

* **app:** guard visual rendering for large markdown files ([#214](https://github.com/murongg/markra/issues/214)) ([41d854c](https://github.com/murongg/markra/commit/41d854cfe935639e03c516a6bca37ba6e9d3ac49))

## [0.7.5](https://github.com/murongg/markra/compare/v0.7.4...v0.7.5) (2026-06-05)

### Features

* **app:** add platform-native document replace shortcut ([#213](https://github.com/murongg/markra/issues/213)) ([2646ca9](https://github.com/murongg/markra/commit/2646ca9f5a69a3ac9fae8afa05a1ea6273e90c63))

## [0.7.4](https://github.com/murongg/markra/compare/v0.7.3...v0.7.4) (2026-06-05)

### Features

* **editor:** add Mermaid diagram zoom ([#206](https://github.com/murongg/markra/issues/206)) ([6ee04e0](https://github.com/murongg/markra/commit/6ee04e0b2145695cdffba3ec0f28c4d6063c1cc0))

### Bug Fixes

* **app:** keep floating menus visible and dismissible ([#212](https://github.com/murongg/markra/issues/212)) ([75fdca9](https://github.com/murongg/markra/commit/75fdca961101906770b7de9eb9e508a83f00aedc)), closes [#207](https://github.com/murongg/markra/issues/207)
* **app:** position context submenus within viewport ([#211](https://github.com/murongg/markra/issues/211)) ([6d803ac](https://github.com/murongg/markra/commit/6d803acc3492f81b55822def55f8fa66ca22a452))
* **desktop:** use supported Pandoc GFM reader ([#210](https://github.com/murongg/markra/issues/210)) ([fe8da29](https://github.com/murongg/markra/commit/fe8da29422591efad243f0769006b814e3d2657b)), closes [#209](https://github.com/murongg/markra/issues/209)

## [0.7.3](https://github.com/murongg/markra/compare/v0.7.2...v0.7.3) (2026-06-05)

### Performance Improvements

* **search:** optimize native workspace search ([#204](https://github.com/murongg/markra/issues/204)) ([0583d30](https://github.com/murongg/markra/commit/0583d309d15ee9af724f108a190c335ec53fdd01))

## [0.7.2](https://github.com/murongg/markra/compare/v0.7.1...v0.7.2) (2026-06-05)

### Features

* **search:** add workspace content search ([#199](https://github.com/murongg/markra/issues/199)) ([a72a00a](https://github.com/murongg/markra/commit/a72a00a0db7c677e6155a0242c8f1b1d001e085f)), closes [#194](https://github.com/murongg/markra/issues/194)

### Bug Fixes

* **titlebar:** keep Windows document tabs clickable ([#198](https://github.com/murongg/markra/issues/198)) ([5482f66](https://github.com/murongg/markra/commit/5482f66d0fe5cf6f0c011d8956f42092d9025964))

## [0.7.1](https://github.com/murongg/markra/compare/v0.6.10...v0.7.1) (2026-06-04)

### Features

* **editor:** add document history versions ([#192](https://github.com/murongg/markra/issues/192)) ([0a6bfdf](https://github.com/murongg/markra/commit/0a6bfdf6784dd88ed35f6d638e52af3964c6c299))
* **menu:** add recent file submenu ([#197](https://github.com/murongg/markra/issues/197)) ([34121a6](https://github.com/murongg/markra/commit/34121a697f54614c9c65bd1ccaad3f460ec378c9))
* **settings:** add sidebar tab layout ([#195](https://github.com/murongg/markra/issues/195)) ([ac7f65d](https://github.com/murongg/markra/commit/ac7f65d49e461af51d58f0518371df54d29ce741)), closes [#193](https://github.com/murongg/markra/issues/193)

## [0.6.10](https://github.com/murongg/markra/compare/v0.6.9...v0.6.10) (2026-06-04)

### Features

* **themes:** add GitHub Dark and One themes ([#191](https://github.com/murongg/markra/issues/191)) ([347f7bb](https://github.com/murongg/markra/commit/347f7bb06ed2a49c500773701c6bb292b28677dc))

### Bug Fixes

* **desktop:** restore window state and titlebar dragging ([#190](https://github.com/murongg/markra/issues/190)) ([c463b2c](https://github.com/murongg/markra/commit/c463b2cda66b5098f4ba90aab5ca3739cb9ea75f))

## [0.6.9](https://github.com/murongg/markra/compare/v0.6.8...v0.6.9) (2026-06-04)

### Bug Fixes

* **editor:** exit blockquotes on Enter ([#187](https://github.com/murongg/markra/issues/187)) ([94c59de](https://github.com/murongg/markra/commit/94c59de97cc7e25e95541599392f2f59279b93b1)), closes [#182](https://github.com/murongg/markra/issues/182)

## [0.6.8](https://github.com/murongg/markra/compare/v0.6.7...v0.6.8) (2026-06-04)

### Bug Fixes

* **desktop:** allow confirmed window destroy ([#186](https://github.com/murongg/markra/issues/186)) ([787398a](https://github.com/murongg/markra/commit/787398a49be13114940d499761ed8cefc5725e2f))

## [0.6.7](https://github.com/murongg/markra/compare/v0.6.6...v0.6.7) (2026-06-03)

### Features

* **menu:** add self-drawn context menus ([#183](https://github.com/murongg/markra/issues/183)) ([f906304](https://github.com/murongg/markra/commit/f906304ac7b4f88ae919cfeeab00efac61085605))

## [0.6.6](https://github.com/murongg/markra/compare/v0.6.5...v0.6.6) (2026-06-03)

### Features

* **app:** add outline folding controls ([#177](https://github.com/murongg/markra/issues/177)) ([48e5332](https://github.com/murongg/markra/commit/48e5332b87cca75e7aa89f62102c27abcfb23e24))
* **editor:** add highlight to selection toolbar ([#180](https://github.com/murongg/markra/issues/180)) ([de7e1f5](https://github.com/murongg/markra/commit/de7e1f56aa54723afdc2ba5e9b4e989f8a1cf20e)), closes [#173](https://github.com/murongg/markra/issues/173)

### Bug Fixes

* **app:** protect unsaved markdown on close ([#181](https://github.com/murongg/markra/issues/181)) ([3c9799d](https://github.com/murongg/markra/commit/3c9799d9ea869d0ff9e50dbc5cc08d348449831e))

## [0.6.5](https://github.com/murongg/markra/compare/v0.6.4...v0.6.5) (2026-06-03)

### Bug Fixes

* **app:** improve overflowing document tab scrolling ([#174](https://github.com/murongg/markra/issues/174)) ([5489f39](https://github.com/murongg/markra/commit/5489f391db0b64b5d0ef1bdb3e65fb1bda447e0a))
* **app:** improve web file creation and tab scrolling ([#175](https://github.com/murongg/markra/issues/175)) ([61a07e8](https://github.com/murongg/markra/commit/61a07e89a8a3672ca9e50a8a829b48dcce639083))
* **editor:** keep collapsed heading enter visible ([#176](https://github.com/murongg/markra/issues/176)) ([af2c1c4](https://github.com/murongg/markra/commit/af2c1c4f1c8dc63a3fcd8027466a645229385c77))

## [0.6.4](https://github.com/murongg/markra/compare/v0.6.3...v0.6.4) (2026-06-02)

### Bug Fixes

* **titlebar:** align web with Windows layout ([#170](https://github.com/murongg/markra/issues/170)) ([318dea6](https://github.com/murongg/markra/commit/318dea63b4b36d31386147e1c373b77c8a6039ef))

## [0.6.3](https://github.com/murongg/markra/compare/v0.6.2...v0.6.3) (2026-06-02)

### Bug Fixes

* **app:** keep Windows titlebar actions clear of AI panel ([#167](https://github.com/murongg/markra/issues/167)) ([0e4fed3](https://github.com/murongg/markra/commit/0e4fed36faf6a1203c17f5769391d45b0a401bce))
* **app:** preserve template blanks and root creates ([#166](https://github.com/murongg/markra/issues/166)) ([87650e3](https://github.com/murongg/markra/commit/87650e3546de08ad384b359c500094a5bf1e1e6a))

## [0.6.2](https://github.com/murongg/markra/compare/v0.6.1...v0.6.2) (2026-06-01)

### Features

* **editor:** add heading level toolbar controls ([#164](https://github.com/murongg/markra/issues/164)) ([b2b1d91](https://github.com/murongg/markra/commit/b2b1d914d15a472a0f6522763669b09c18d41c2d)), closes [#155](https://github.com/murongg/markra/issues/155)
* **editor:** split and extend selection tools ([#162](https://github.com/murongg/markra/issues/162)) ([761e7f6](https://github.com/murongg/markra/commit/761e7f64cf9e955ff2561f84df17e42b8e2a3d87)), closes [#155](https://github.com/murongg/markra/issues/155)

### Bug Fixes

* **editor:** improve inserted table display ([#165](https://github.com/murongg/markra/issues/165)) ([90eb581](https://github.com/murongg/markra/commit/90eb5810dc7c4d12876930bc01dd072bb9fb85ea)), closes [#161](https://github.com/murongg/markra/issues/161)

## [0.6.1](https://github.com/murongg/markra/compare/v0.6.0...v0.6.1) (2026-05-31)

### Features

* **images:** add PicGo and PicList uploads ([#152](https://github.com/murongg/markra/issues/152)) ([cc76974](https://github.com/murongg/markra/commit/cc7697481b4873eac3b5a3be1f71d5314610c511)), closes [#147](https://github.com/murongg/markra/issues/147)

## [0.6.0](https://github.com/murongg/markra/compare/v0.6.0-beta.1...v0.6.0) (2026-05-30)

### Bug Fixes

* **editor:** keep intraword underscores literal ([#150](https://github.com/murongg/markra/issues/150)) ([b8b13f3](https://github.com/murongg/markra/commit/b8b13f3effd950564d5afe6809965aabe59199df)), closes [#146](https://github.com/murongg/markra/issues/146)
* **editor:** render task lists as interactive checkboxes ([#151](https://github.com/murongg/markra/issues/151)) ([6d1f906](https://github.com/murongg/markra/commit/6d1f9065fd9cfed2be1d26992a4010e44b52ae7a))

## [0.6.0-beta.1](https://github.com/murongg/markra/compare/v0.5.6...v0.6.0-beta.1) (2026-05-29)

### Features

* **web:** add shared app runtime ([ea94fcf](https://github.com/murongg/markra/commit/ea94fcfd13754d5851796b3126588a93bb5453a5))

### Bug Fixes

* **desktop:** avoid blocking markdown open dialog ([3233595](https://github.com/murongg/markra/commit/32335951542039fd1489c3773601c752c5ea89d9)), closes [#141](https://github.com/murongg/markra/issues/141)

## [0.5.6](https://github.com/murongg/markra/compare/v0.5.5...v0.5.6) (2026-05-25)

### Features

* **tabs:** add cancel side-by-side menu action ([06859d6](https://github.com/murongg/markra/commit/06859d6936657dca35e1f02d0418e7c0c1f7f822))

### Bug Fixes

* **tabs:** stabilize drag-to-side splitting ([cefeaa2](https://github.com/murongg/markra/commit/cefeaa2fffd24a273b4e5f3f9bfdb73db41eed3b))

## [0.5.5](https://github.com/murongg/markra/compare/v0.5.4...v0.5.5) (2026-05-25)

### Features

* **settings:** add automatic update toggle ([8f8a69d](https://github.com/murongg/markra/commit/8f8a69d177a24b218c93dd21e0d222798f7bd025))

### Bug Fixes

* **menu:** hide editor menus in settings window ([b07e20e](https://github.com/murongg/markra/commit/b07e20e88a64c1e2238b749bb08afc2437e41aa1))

## [0.5.4](https://github.com/murongg/markra/compare/v0.5.3...v0.5.4) (2026-05-24)

### Features

* **ai:** add runtime context to document prompts ([45ebe46](https://github.com/murongg/markra/commit/45ebe46555a528acadca91c26e92bb155ce605f2))

### Bug Fixes

* **desktop:** keep titlebar tabs clear of AI panel ([42b7bbd](https://github.com/murongg/markra/commit/42b7bbd92a62557bfd5d9db4f504fd334255be3c))

## [0.5.3](https://github.com/murongg/markra/compare/v0.5.2...v0.5.3) (2026-05-24)

### Features

* **editor:** support frontmatter blocks ([607d2b8](https://github.com/murongg/markra/commit/607d2b80c96152c971d9d06f27727cb7ea73cab1))
* **editor:** support Hugo math delimiters ([4959045](https://github.com/murongg/markra/commit/4959045f25a55cc31f8f5219f7ac168530493e6a))

## [0.5.2](https://github.com/murongg/markra/compare/v0.5.1...v0.5.2) (2026-05-24)

### Features

* **desktop:** add Pandoc export formats ([63f9136](https://github.com/murongg/markra/commit/63f9136d70470e898eedb191de2b92aac0757980)), closes [#127](https://github.com/murongg/markra/issues/127)

## [0.5.1](https://github.com/murongg/markra/compare/v0.5.0...v0.5.1) (2026-05-22)

### Features

* **ai:** add agent message actions ([226cea4](https://github.com/murongg/markra/commit/226cea4e03b05c862baea12bf6987494548cd608)), closes [#104](https://github.com/murongg/markra/issues/104)

## [0.5.0](https://github.com/murongg/markra/compare/v0.4.0...v0.5.0) (2026-05-22)

### Features

* **desktop:** add file tree sorting ([d0d76a5](https://github.com/murongg/markra/commit/d0d76a5e2daaf0290fe4335407e8bf9254bf0817)), closes [#112](https://github.com/murongg/markra/issues/112)
* **desktop:** support file tree drag moves ([851d1ed](https://github.com/murongg/markra/commit/851d1edc5d1b4d59fa35c40ce595b8f70f242cc9)), closes [#117](https://github.com/murongg/markra/issues/117)
* **editor:** add GitHub alert syntax setting ([b365da6](https://github.com/murongg/markra/commit/b365da642c38f9c79360102058de765c85bf2b15))
* **editor:** add highlight syntax setting ([7d0de74](https://github.com/murongg/markra/commit/7d0de74385b600adace7643e60ec125d5999126d))

### Bug Fixes

* **editor:** keep dollar amounts out of math rendering ([cfdec30](https://github.com/murongg/markra/commit/cfdec300597b2a62f4af5c961ba2976cb7e083b1))
* **editor:** keep headings editable in visual mode ([d87b86a](https://github.com/murongg/markra/commit/d87b86a17b2431236f8d4a616c4a280217113888)), closes [#123](https://github.com/murongg/markra/issues/123)
* **editor:** remove heading divider lines ([87b64b0](https://github.com/murongg/markra/commit/87b64b0a5ad910453d53a3c174973b98d50ae6f2)), closes [#123](https://github.com/murongg/markra/issues/123)

## [0.3.0](https://github.com/murongg/markra/compare/v0.2.1...v0.3.0) (2026-05-21)

### Features

* **desktop:** add document search and replace ([0d6c25e](https://github.com/murongg/markra/commit/0d6c25ef9dd454011e1f1e3971f61948c4df629a))

## [0.2.1](https://github.com/murongg/markra/compare/v0.2.0...v0.2.1) (2026-05-21)

### Bug Fixes

* **desktop:** refresh restored tab editors ([df508cd](https://github.com/murongg/markra/commit/df508cdf497be1f9b4b17ab134d94d8b880c928e))

## [0.2.0](https://github.com/murongg/markra/compare/v0.1.28...v0.2.0) (2026-05-21)

### Features

* **templates:** add markdown template management ([d185835](https://github.com/murongg/markra/commit/d1858356c421b07ee4a68635945f9c0b07ebbfc7))

## [0.1.28](https://github.com/murongg/markra/compare/v0.1.27...v0.1.28) (2026-05-20)

### Features

* **editor:** support LaTeX macro definitions ([a1708fe](https://github.com/murongg/markra/commit/a1708feb2c392f9b792a68a6fb95bef355ee000f)), closes [#105](https://github.com/murongg/markra/issues/105)

## [0.1.27](https://github.com/murongg/markra/compare/v0.1.26...v0.1.27) (2026-05-20)

### Bug Fixes

* **desktop:** restore update-restarted windows ([0e7c6ce](https://github.com/murongg/markra/commit/0e7c6cefde78d2215498cebb62f5431ceddd1b6c)), closes [#109](https://github.com/murongg/markra/issues/109)

## [0.1.26](https://github.com/murongg/markra/compare/v0.1.25...v0.1.26) (2026-05-20)

### Features

* **desktop:** add side-by-side document tabs ([7ac200d](https://github.com/murongg/markra/commit/7ac200d7a0517923009bd9ebaa1db4fddac06e78))

### Bug Fixes

* **desktop:** polish file tree context menus ([1d9c860](https://github.com/murongg/markra/commit/1d9c860adb04260911c1c72437acd89ecac83589))
* **editor:** enforce read-only editor controls ([d3a9456](https://github.com/murongg/markra/commit/d3a9456e71d2f0bfaaf74f68b981bbc416a0a9c3))

## [0.1.25](https://github.com/murongg/markra/compare/v0.1.24...v0.1.25) (2026-05-20)

### Bug Fixes

* **editor:** use theme-aware text cursor ([f450859](https://github.com/murongg/markra/commit/f45085992ed135abd31d59d494c8143276728707))

## [0.1.24](https://github.com/murongg/markra/compare/v0.1.23...v0.1.24) (2026-05-20)

### Bug Fixes

* **desktop:** offset outline navigation below titlebar ([d456204](https://github.com/murongg/markra/commit/d4562048e246bec96f47d095258ec6550e7c4f64))
* **desktop:** restore workspace document tabs ([0b4b572](https://github.com/murongg/markra/commit/0b4b572e1afbbd63099780adada466e69e996a67)), closes [#97](https://github.com/murongg/markra/issues/97)

## [0.1.23](https://github.com/murongg/markra/compare/v0.1.22...v0.1.23) (2026-05-19)

### Bug Fixes

* **desktop:** show package version in settings ([abcd111](https://github.com/murongg/markra/commit/abcd111ef18569fe4af066c8c10b5e715d13f57a))
* **editor:** improve block image editing and drop targets ([fb7f976](https://github.com/murongg/markra/commit/fb7f976eb509498fa258b0b88fa21c54f2e5642f))
* **editor:** improve formula source editing ([cf2df4f](https://github.com/murongg/markra/commit/cf2df4f9106ddcf09be7b15e6fde2b5926596956))
* **editor:** remove automatic block exit paragraphs ([9d1cd98](https://github.com/murongg/markra/commit/9d1cd98a09e720dfb7f9b76ef812b737510b7245))
* **editor:** stop saving blank blocks as br tags ([ead4e6d](https://github.com/murongg/markra/commit/ead4e6df6b9e3448887b1f164968093dfedf2164))
* **i18n:** add current version translations ([c4dcffe](https://github.com/murongg/markra/commit/c4dcffed18dd435ab22aa7c537ff776208d7b8cf))

## [0.1.22](https://github.com/murongg/markra/compare/v0.1.21...v0.1.22) (2026-05-19)

### Bug Fixes

* **release:** exclude Wayland client from AppImage ([23b0726](https://github.com/murongg/markra/commit/23b0726f13521aba6032ff3407aec7aa0d345068))
* **release:** rebuild AppImage after library pruning ([350c8a8](https://github.com/murongg/markra/commit/350c8a876c22426e2598d4c6bed0009b60118a2a))
* **release:** use host GTK input method cache in AppImage ([cfd751f](https://github.com/murongg/markra/commit/cfd751f065f0e169bb0750dd68dee7358b34fedb))
* **release:** use XIM fallback for Fcitx AppImages ([9c86f8c](https://github.com/murongg/markra/commit/9c86f8cea3ab9e5e72001553d1c84e319f5eb9d5))

## [0.1.21](https://github.com/murongg/markra/compare/v0.1.20...v0.1.21) (2026-05-18)

### Bug Fixes

* **desktop:** handle missing recent markdown folders ([2f02e68](https://github.com/murongg/markra/commit/2f02e6823a278df98ded4f9555620a6c105f8e72)), closes [#76](https://github.com/murongg/markra/issues/76)

## [0.1.20](https://github.com/murongg/markra/compare/v0.1.19...v0.1.20) (2026-05-18)

### Features

* **desktop:** add read-only mode shortcut ([a6722b1](https://github.com/murongg/markra/commit/a6722b18d6c96808649a284b3adce09226d50108))
* **editor:** add Mermaid diagram previews ([c884d63](https://github.com/murongg/markra/commit/c884d63ee038ecbe62977f25f1d523f4eca38a76))

## [0.1.19](https://github.com/murongg/markra/compare/v0.1.18...v0.1.19) (2026-05-17)

### Features

* **desktop:** restore tab scroll position ([acfd991](https://github.com/murongg/markra/commit/acfd9915ffe066f577da73a97df1518b44bc5b0c))

## [0.1.18](https://github.com/murongg/markra/compare/v0.1.17...v0.1.18) (2026-05-17)

## [0.1.17](https://github.com/murongg/markra/compare/v0.1.16...v0.1.17) (2026-05-17)

### Features

* **desktop:** add folder delete context action ([ce8ca75](https://github.com/murongg/markra/commit/ce8ca75f6254ee42f54c6c275642631bb964449b)), closes [#86](https://github.com/murongg/markra/issues/86)

### Bug Fixes

* **desktop:** allow folder image previews ([93be07a](https://github.com/murongg/markra/commit/93be07a99d2dd82c80e08a9ed85e0263261df479))
* **desktop:** avoid stale editor save prompts ([813bee2](https://github.com/murongg/markra/commit/813bee23141c81d3d670c20b8361ba24e6988b04)), closes [#86](https://github.com/murongg/markra/issues/86)
* **desktop:** persist opened folder workspace state ([006fd21](https://github.com/murongg/markra/commit/006fd210f8de575581460346383524a4e6042c2c))
* **desktop:** refresh selected folders on tree changes ([d17a5a5](https://github.com/murongg/markra/commit/d17a5a5672dbfd3bec682081eb64ccd349358b36)), closes [#86](https://github.com/murongg/markra/issues/86)

## [0.1.16](https://github.com/murongg/markra/compare/v0.1.15...v0.1.16) (2026-05-17)

### Features

* **desktop:** refine sidebar and titlebar controls ([4c140b9](https://github.com/murongg/markra/commit/4c140b978ac2ca94d40a5ebad34f20a8734397c4))
* **desktop:** remember recent markdown folders ([495c3a6](https://github.com/murongg/markra/commit/495c3a6acb99498adb1f5093edca7abd16d5950b))

### Bug Fixes

* **desktop:** disable Linux window transparency ([dd2a78f](https://github.com/murongg/markra/commit/dd2a78f2f803dfb74cbc40dd2caead84ef76d449)), closes [#83](https://github.com/murongg/markra/issues/83)

## [0.1.15](https://github.com/murongg/markra/compare/v0.1.14...v0.1.15) (2026-05-17)

### Bug Fixes

* **desktop:** avoid rerunning workspace restore on source toggle ([e93ca94](https://github.com/murongg/markra/commit/e93ca948f224fca719e5fd5a4b51be5315f700c5))
* **desktop:** dock Windows sidebar footer controls ([55d4a8b](https://github.com/murongg/markra/commit/55d4a8b3ea7ce3edb70e0b310ccd1fcd721b8fef)), closes [#76](https://github.com/murongg/markra/issues/76)
* **desktop:** keep Windows titlebar actions clickable ([a0c3834](https://github.com/murongg/markra/commit/a0c383478e7c7b73ca91400e50eccff4c92bcb1b)), closes [#76](https://github.com/murongg/markra/issues/76)
* **desktop:** theme app scrollbars ([32689ce](https://github.com/murongg/markra/commit/32689ce955336baad9eb1bfa04911e3c6e7d0e6f)), closes [#76](https://github.com/murongg/markra/issues/76)

## [0.1.14](https://github.com/murongg/markra/compare/v0.1.13...v0.1.14) (2026-05-17)

### Features

* **editor:** add collapsible nested lists ([aee3490](https://github.com/murongg/markra/commit/aee3490e9896199c41c39eebb03cefea43c41626)), closes [#79](https://github.com/murongg/markra/issues/79)
* **editor:** improve list item interactions ([a1b5a75](https://github.com/murongg/markra/commit/a1b5a7596d8f0ea934d8315b4dff92860287d7db)), closes [#79](https://github.com/murongg/markra/issues/79)

### Bug Fixes

* **editor:** anchor block toolbar near first line ([de14374](https://github.com/murongg/markra/commit/de14374f5405caafd978548079928468c8f4faa4)), closes [#79](https://github.com/murongg/markra/issues/79)
* **editor:** keep tab indentation inside text blocks ([95f8fb0](https://github.com/murongg/markra/commit/95f8fb0ab62d69172cfe3e8342c9fbc48ff5461e)), closes [#79](https://github.com/murongg/markra/issues/79)

## [0.1.13](https://github.com/murongg/markra/compare/v0.1.12...v0.1.13) (2026-05-16)

### Bug Fixes

* **ai:** soften command input border ([a5d3938](https://github.com/murongg/markra/commit/a5d393871254e1fa26652ad5982a6235bcdf216c))
* **desktop:** align Windows titlebar tabs ([f9e1d1b](https://github.com/murongg/markra/commit/f9e1d1b5dc858a180cd1601acdfcc145a0e62ad4))
* **desktop:** hide file tree resize hover indicator ([6951349](https://github.com/murongg/markra/commit/6951349cc048f423b8dce30825fa993c83796c1e))
* **desktop:** route native menu commands to focused window ([dcb9cfd](https://github.com/murongg/markra/commit/dcb9cfd20c5180e1e4cba3538d75505f33cd5e3e))
* **theme:** restore editor link colors ([2c8e27f](https://github.com/murongg/markra/commit/2c8e27f12a6cc823e066052efa3fa28b057754d4))

## [0.1.12](https://github.com/murongg/markra/compare/v0.1.11...v0.1.12) (2026-05-16)

### Bug Fixes

* **build:** keep node aliases out of tests ([eea2a84](https://github.com/murongg/markra/commit/eea2a8423a0fd7fe27047f029696025cef3fa8f0))
* **theme:** align ink accent across UI ([a698388](https://github.com/murongg/markra/commit/a69838896fd764a8911fa346969fd07274960ca7))

## [0.1.11](https://github.com/murongg/markra/compare/v0.1.10...v0.1.11) (2026-05-16)

### Features

* **desktop:** add document tab context menu ([62e34ae](https://github.com/murongg/markra/commit/62e34ae3f08c4641d1b81b94eb530d5c52137b8d))
* **desktop:** add source visual split mode ([8911ce1](https://github.com/murongg/markra/commit/8911ce1da3ae406e808cff0ba008d4e93fa8179a))

## [0.1.10](https://github.com/murongg/markra/compare/v0.1.9...v0.1.10) (2026-05-16)

### Features

* **editor:** add heading section folding ([b9a12db](https://github.com/murongg/markra/commit/b9a12dbc59907bd6f84cf1b71c9e6d9e00fea327)), closes [#41](https://github.com/murongg/markra/issues/41)

## [0.1.9](https://github.com/murongg/markra/compare/v0.1.8...v0.1.9) (2026-05-15)

### Features

* **editor:** add GitHub-style callout blocks ([70a14fb](https://github.com/murongg/markra/commit/70a14fb720813757bc0a14678640ac24147f5a47)), closes [#42](https://github.com/murongg/markra/issues/42)

## [0.1.8](https://github.com/murongg/markra/compare/v0.1.7...v0.1.8) (2026-05-15)

### Features

* **desktop:** add custom theme management controls ([e619c53](https://github.com/murongg/markra/commit/e619c53c1c66884c295a480346df8ef0d107dd59))
* **desktop:** add custom themes and code copy controls ([e30b33e](https://github.com/murongg/markra/commit/e30b33e1632124b9e1ffe9f2adb6aa7201d53189))

## [0.1.7](https://github.com/murongg/markra/compare/v0.1.6...v0.1.7) (2026-05-15)

### Features

* **editor:** add standard markdown document links ([39237e1](https://github.com/murongg/markra/commit/39237e19e4fa5051dfdc3ab48b527d335bdd3381))

## [0.1.6](https://github.com/murongg/markra/compare/v0.1.5...v0.1.6) (2026-05-15)

### Features

* **editor:** open slash menu after adding block ([8b78605](https://github.com/murongg/markra/commit/8b78605667cfb9e62414013e3c46c6432547de72))

### Bug Fixes

* **desktop:** keep Windows tabs from covering file tree ([96fcb24](https://github.com/murongg/markra/commit/96fcb24930e7efba5d5513a6a587f60740527d07))
* **editor:** add blank block from list item handle ([8094e85](https://github.com/murongg/markra/commit/8094e85506b21ef34d7f5a1bbba313c621f63993))
* **editor:** handle slash menu text clicks ([f41c02b](https://github.com/murongg/markra/commit/f41c02b683248469e8722fac17f2cd49ee03a9fe))
* **editor:** keep hovered slash options clickable ([dde3964](https://github.com/murongg/markra/commit/dde396410660433a26b54b3630ade19227f5cc5d))
* **editor:** run slash command clicks after block add ([7847c7b](https://github.com/murongg/markra/commit/7847c7b15087c09a50ed45f02c17403309607db4))

## [0.1.5](https://github.com/murongg/markra/compare/v0.1.3...v0.1.5) (2026-05-15)

### Features

* **ai:** add selection AI display mode ([74864aa](https://github.com/murongg/markra/commit/74864aadac9660a6cfd31ab584888e0fc3f32981))
* **ai:** improve inline command workflow ([29a88fb](https://github.com/murongg/markra/commit/29a88fb759e223666eb634cb4af69fb24556daf2))
* **editor:** add block drag sorting ([272db6e](https://github.com/murongg/markra/commit/272db6e23242b07d05d562f88bf17904e38eb60d))
* **settings:** group AI controls and provider settings ([4023977](https://github.com/murongg/markra/commit/4023977468d3195ca21f64c8a821c7b4e154b29b))

### Bug Fixes

* **ai:** avoid layered selection hold ([960a3bc](https://github.com/murongg/markra/commit/960a3bc3fb1a04c64408b0518ef7aa26cd288048))
* **ai:** respect app language for translation target ([8b48586](https://github.com/murongg/markra/commit/8b485861aeec6cd22f0a9450dfd03202e163d1eb))
* **ai:** target translation defaults to app language ([7a4f82e](https://github.com/murongg/markra/commit/7a4f82e7c991adecae79b8c05cba1c79c2570b3e))
* **i18n:** add selection AI locale labels ([c570753](https://github.com/murongg/markra/commit/c5707539fc7935f63b529912cc0a191c0f226295))
* **markdown:** count CJK characters in word count ([9eae830](https://github.com/murongg/markra/commit/9eae83003caa87d3ba399577d4728dcd966cb89f))
* **release:** avoid caching cargo shims ([4c370a9](https://github.com/murongg/markra/commit/4c370a96f663afdfbb538d0022120c20a9076bb2))
* **titlebar:** align document tabs with editor pane ([8dae80b](https://github.com/murongg/markra/commit/8dae80b07b29bf7f974a7db3d2d440708bd80a2a))
* **titlebar:** align Windows document tabs ([b8e7d41](https://github.com/murongg/markra/commit/b8e7d41d0a1db0b9811c9fa9d5345d5cd4f5fc6c))

## [0.1.3](https://github.com/murongg/markra/compare/v0.1.2...v0.1.3) (2026-05-14)

### Features

* **desktop:** add configurable image storage ([1226f23](https://github.com/murongg/markra/commit/1226f2343649233f3fb2d8f98f88920443841534))
* **editor:** add slash commands and improve quote behavior ([25306b9](https://github.com/murongg/markra/commit/25306b90b1b7225576f34f620629c4dd9c75ddb6))
* **editor:** transfer pasted web images ([da4fbe7](https://github.com/murongg/markra/commit/da4fbe7c26d7aea45f7c0b86939fd681a0ed37c7))

## [0.1.2](https://github.com/murongg/markra/compare/v0.1.1...v0.1.2) (2026-05-14)

### Features

* **desktop:** customize titlebar actions ([f036372](https://github.com/murongg/markra/commit/f036372e6a51d6164e04b56606a3377fbd2fb893))

### Bug Fixes

* **desktop:** open associated markdown files ([eacd44c](https://github.com/murongg/markra/commit/eacd44c5bb6dc9fe97a9347954e76ef7c29c0f8f)), closes [#51](https://github.com/murongg/markra/issues/51)

## [0.1.1](https://github.com/murongg/markra/compare/v0.1.0...v0.1.1) (2026-05-13)

### Features

* **desktop:** add about metadata and update menu ([f2b71cb](https://github.com/murongg/markra/commit/f2b71cba95f5600755d1fffa2404e58672940c99)), closes [#36](https://github.com/murongg/markra/issues/36)
* **editor:** add resizable writing width ([9ce4097](https://github.com/murongg/markra/commit/9ce4097326465e79c766a03eeb7951dc6848f6e0))

## [0.1.0](https://github.com/murongg/markra/compare/v0.0.22...v0.1.0) (2026-05-13)

### Bug Fixes

* **editor:** delete image when source markdown is cleared ([a2c3124](https://github.com/murongg/markra/commit/a2c31242599df3b2804bd4c32fbb55ebef286533)), closes [#34](https://github.com/murongg/markra/issues/34)

## [0.0.22](https://github.com/murongg/markra/compare/v0.0.21...v0.0.22) (2026-05-13)

### Features

* **desktop:** add document tabs ([1c59434](https://github.com/murongg/markra/commit/1c59434c7eefcf834a042dbbf9fef9a27dba23d0))
* **desktop:** rename files from tabs ([1c1fd35](https://github.com/murongg/markra/commit/1c1fd350142e7bab78b4204e9e2984e3fe15a5ee))

### Bug Fixes

* **desktop:** ignore equivalent editor updates ([612c4ae](https://github.com/murongg/markra/commit/612c4aed240a081f8f30c5a69898e473f8f85c83))
* **desktop:** localize markdown picker language ([b871500](https://github.com/murongg/markra/commit/b871500d4a2d174790b39ea6cccfe0346fa11450))
* **desktop:** render soft line breaks in exports ([ca69a97](https://github.com/murongg/markra/commit/ca69a972b7c88eecae6bdda8c3397e2972232374))
* **desktop:** solidify titlebar surface ([89de53b](https://github.com/murongg/markra/commit/89de53b06b1bb5f0beee75ab1ce837a5bfdf3924))
* **editor:** improve code wrapping and highlighting ([1629d83](https://github.com/murongg/markra/commit/1629d830b2a64504423a079bfafaa6715a96a010))
* **editor:** normalize expanded heading source ([2ee2c28](https://github.com/murongg/markra/commit/2ee2c28fc2d0b74170c97f9696bd402000f73be9))
* **editor:** preserve display math rendering and caret flow ([601b4d5](https://github.com/murongg/markra/commit/601b4d51adc33e03ec8dc4134ff1315bfc1825da))

## [0.0.21](https://github.com/murongg/markra/compare/v0.0.20...v0.0.21) (2026-05-13)

### Features

* **desktop:** add close current file shortcut ([3ccc603](https://github.com/murongg/markra/commit/3ccc603d75dbcceef892027347bb674b3b6fec62)), closes [#20](https://github.com/murongg/markra/issues/20)

### Bug Fixes

* **desktop:** allow folder opens from Windows titlebar ([af4f7da](https://github.com/murongg/markra/commit/af4f7da1fe9f9703d7a2d521c2ef27c6bb7ce1dd))
* **desktop:** support folder opens from native menu ([972514c](https://github.com/murongg/markra/commit/972514ca21bbbd64471fa372afc428be2a732414))
* **editor:** expand headings to markdown source ([073bc7b](https://github.com/murongg/markra/commit/073bc7b7c0b1b404f0126871147ecd35ff194878)), closes [#18](https://github.com/murongg/markra/issues/18)

## [0.0.20](https://github.com/murongg/markra/compare/v0.0.19...v0.0.20) (2026-05-13)

### Features

* **settings:** add configurable shortcuts ([6d8e2ef](https://github.com/murongg/markra/commit/6d8e2ef478e6176f0165a2a75a499ca55277f227))

## [0.0.19](https://github.com/murongg/markra/compare/v0.0.18...v0.0.19) (2026-05-12)

### Bug Fixes

* **editor:** avoid covering code with language selector ([2a996ff](https://github.com/murongg/markra/commit/2a996ffd8c4b3d0f11081612a5225f55d743df0b))
* **editor:** avoid false dirty state detection ([e33bf83](https://github.com/murongg/markra/commit/e33bf8367f75f013ef7a58b4ce212ac5dd33a7b2))

## [0.0.18](https://github.com/murongg/markra/compare/v0.0.17...v0.0.18) (2026-05-12)

### Features

* **desktop:** add PDF and HTML export ([31ed6b2](https://github.com/murongg/markra/commit/31ed6b271bb0f8d94c215eeecc6a03382ebea91d))

### Bug Fixes

* **desktop:** stabilize native menu commands ([31b06a2](https://github.com/murongg/markra/commit/31b06a23a1281fefb025d28b6b0305d93a5bf358)), closes [#13](https://github.com/murongg/markra/issues/13)

## [0.0.17](https://github.com/murongg/markra/compare/v0.0.16...v0.0.17) (2026-05-12)

### Features

* **editor:** enrich native context menu ([732d444](https://github.com/murongg/markra/commit/732d4442d1e35207b11c89ce9a86169051aca883))

## [0.0.16](https://github.com/murongg/markra/compare/v0.0.15...v0.0.16) (2026-05-12)

### Features

* **editor:** add markdown source mode ([6f9e3c1](https://github.com/murongg/markra/commit/6f9e3c1162782bda95a38d03486bf1dd90b21743))

## [0.0.15](https://github.com/murongg/markra/compare/v0.0.14...v0.0.15) (2026-05-12)

### Features

* **editor:** add editable code block highlighting ([d2e88ff](https://github.com/murongg/markra/commit/d2e88ff592d2175625704a561d688992a184443e))
* **editor:** render math formulas ([1f6206f](https://github.com/murongg/markra/commit/1f6206fbd6694983e280896a3efc2b23526b8d6c))

### Bug Fixes

* **editor:** disable substitutions in code blocks ([54c5050](https://github.com/murongg/markra/commit/54c505055beaee72f168eaa44d25b68995c94956))
* **editor:** improve math formula editing ([8d246df](https://github.com/murongg/markra/commit/8d246df989c7c82c1e1648d2238299ad55b3909e))

## [0.0.14](https://github.com/murongg/markra/compare/v0.0.13...v0.0.14) (2026-05-12)

### Features

* **editor:** add AI panel command toggle ([e30c432](https://github.com/murongg/markra/commit/e30c432a4557cb8fe10b27b77e319d6918990755))

## [0.0.13](https://github.com/murongg/markra/compare/v0.0.12...v0.0.13) (2026-05-12)

## [0.0.12](https://github.com/murongg/markra/compare/v0.0.11...v0.0.12) (2026-05-11)

### Bug Fixes

* **desktop:** center app toasts ([b0cc94b](https://github.com/murongg/markra/commit/b0cc94b780d9a3d4b1114ac181797fd952efeabc))
* **desktop:** try local proxies for updates ([dcd7cfd](https://github.com/murongg/markra/commit/dcd7cfd38ae1cdba6f1174096529fc742aec4727))

## [0.0.11](https://github.com/murongg/markra/compare/v0.0.10...v0.0.11) (2026-05-11)

### Bug Fixes

* **desktop:** center macOS window control glyphs ([83d1fd6](https://github.com/murongg/markra/commit/83d1fd6889cfb5cfe42820d6369aaace88399250))

## [0.0.10](https://github.com/murongg/markra/compare/v0.0.9...v0.0.10) (2026-05-11)

### Features

* **desktop:** download updates in background ([059d7c2](https://github.com/murongg/markra/commit/059d7c22ecdb5a6f07ed8822a643834beff9d6af))

### Bug Fixes

* **desktop:** compile settings window chrome on Windows ([f03850e](https://github.com/murongg/markra/commit/f03850ea3bd73406b119dcc9a153f1df6ab92f68))

## [0.0.9](https://github.com/murongg/markra/compare/v0.0.8...v0.0.9) (2026-05-11)

### Bug Fixes

* **desktop:** self draw macOS window controls ([0778f7c](https://github.com/murongg/markra/commit/0778f7cb361ab0ca1d9d32b6a8135d4cd9c02223))

## [0.0.8](https://github.com/murongg/markra/compare/v0.0.7...v0.0.8) (2026-05-11)

### Bug Fixes

* **desktop:** align update toast icon ([e33a076](https://github.com/murongg/markra/commit/e33a0766cd73d8e2e0caf5868dc52d2e677d67f8))
* **desktop:** block default context menus in production ([221a4f9](https://github.com/murongg/markra/commit/221a4f9f98dc9cb9a593802345d4d9db0cc8c07e))
* **desktop:** compact Windows settings chrome ([bb2e240](https://github.com/murongg/markra/commit/bb2e24073b32c792003ff01db6132426188160d8))
* **desktop:** remove Windows settings header gap ([4c9dbab](https://github.com/murongg/markra/commit/4c9dbabd5278b350c2571dd4406912168f57516f))

## [0.0.7](https://github.com/murongg/markra/compare/v0.0.6...v0.0.7) (2026-05-11)

### Features

* **desktop:** add app update checks ([a688ed9](https://github.com/murongg/markra/commit/a688ed9c5ffe1dcddb70bcdb951e6586e0044c57))

### Bug Fixes

* **i18n:** add update translations ([35375cb](https://github.com/murongg/markra/commit/35375cb5d7bd1f5071c997adf067cefe0727185f))

## [0.0.6](https://github.com/murongg/markra/compare/v0.0.5...v0.0.6) (2026-05-11)

### Bug Fixes

* **desktop:** preserve Windows titlebar header ([103dfaf](https://github.com/murongg/markra/commit/103dfaffd8069f440d98237679988d6ca564255e))
* **desktop:** right-align Windows title actions ([24be97a](https://github.com/murongg/markra/commit/24be97a3d38fb9b719b0e99dad01f5c2490a5e93))

## [0.0.5](https://github.com/murongg/markra/compare/v0.0.4...v0.0.5) (2026-05-11)

### Bug Fixes

* **desktop:** remove Windows custom titlebar gap ([57f5d53](https://github.com/murongg/markra/commit/57f5d533d15e602e802ca71586b2e5d6fdace297))

## [0.0.4](https://github.com/murongg/markra/compare/v0.0.3...v0.0.4) (2026-05-11)

### Bug Fixes

* **ai:** preserve markdown source in editor context ([1fda637](https://github.com/murongg/markra/commit/1fda637c1733771003e99246315f04f8942d2280))
* **desktop:** clear active document after tree delete ([364bcca](https://github.com/murongg/markra/commit/364bccaa593884c390db46351ba88cae5810064d))
* **desktop:** format Windows chrome test ([bd806ba](https://github.com/murongg/markra/commit/bd806baea35fec7ee0d13a945f6990d932348a04))
* **desktop:** polish Windows window chrome ([106abee](https://github.com/murongg/markra/commit/106abee4e48e08f9b76665f9a27d40ca20b794c9))
* **editor:** allow exiting terminal markdown blocks ([ccffd36](https://github.com/murongg/markra/commit/ccffd363409a49b06afa78f96d1168b8d1ac2c95))

## [0.0.3](https://github.com/murongg/markra/compare/v0.0.2...v0.0.3) (2026-05-11)

### Bug Fixes

* **desktop:** prevent vendor chunk init failures ([3bd1685](https://github.com/murongg/markra/commit/3bd1685ae9c67bb12fa04e4d3521a1546ee4111f))

## [0.0.2](https://github.com/murongg/markra/compare/v0.0.1...v0.0.2) (2026-05-11)

### Bug Fixes

* **desktop:** keep milkdown vendor chunk intact ([4d5e0f2](https://github.com/murongg/markra/commit/4d5e0f241624fa96fe485812329da9780b27eb77))

## [0.0.1](https://github.com/murongg/markra/compare/cab50972a9704212d444c1a3b188c25336f9464c...v0.0.1) (2026-05-11)

### Features

* **ai-agent:** refactor tools and harden provider adapters ([d89ecad](https://github.com/murongg/markra/commit/d89ecad03003a564b84df0e57ca0f40b2bb89587))
* **ai-agent:** support multi-preview editing flows ([360798f](https://github.com/murongg/markra/commit/360798f67adc50d4f38ddd4e8c6aad0873724eb1))
* **ai:** add agent editing workflow ([a1d7d22](https://github.com/murongg/markra/commit/a1d7d22def513c41ebc6c71f6905516125186dc3))
* **ai:** add DeepSeek thinking toggle ([a80f428](https://github.com/murongg/markra/commit/a80f4282d5c7b2dfcbb2484c91ea2ee72a87fc03))
* **ai:** add inline command bar ([3c1f672](https://github.com/murongg/markra/commit/3c1f672d46d6e81f4218716b07cfb459442e80ee))
* **ai:** add inline editing ([6a299a6](https://github.com/murongg/markra/commit/6a299a6f3051c94083f7fb11428a29076bf961dd))
* **ai:** add provider settings ([191f874](https://github.com/murongg/markra/commit/191f874bada2b7a4477008d5403ab235649a0d7a))
* **ai:** add streaming agent editor flow ([6f7a009](https://github.com/murongg/markra/commit/6f7a00949067445948a37040acd7392a78c7b2d9))
* **ai:** add web search support ([4b0029f](https://github.com/murongg/markra/commit/4b0029fe1def2ff32fc45db1c97091b2a61b821b))
* **ai:** improve agent editing workflow ([9e5de1c](https://github.com/murongg/markra/commit/9e5de1ce3adb6091cdbf10bfc177e4e631ccfbb6))
* **ai:** improve preview confirmation ([4a47af5](https://github.com/murongg/markra/commit/4a47af56393b85fb2ce9d357eae68fe428d3d29c))
* **ai:** improve preview interactions ([f085c18](https://github.com/murongg/markra/commit/f085c18b4afee68d351003e36f07839277c53da8))
* **ai:** improve reasoning controls and provider setup ([3a06fbe](https://github.com/murongg/markra/commit/3a06fbe6fe0b7d0a308f358987d477dc3ebd0a77))
* **ai:** inspect document images with tools ([2904885](https://github.com/murongg/markra/commit/2904885e011bfd986f6d9ed240e99fb1a421b6e4))
* **ai:** let agent read workspace markdown files ([ba5e0e5](https://github.com/murongg/markra/commit/ba5e0e5a7a84da5c6c94d483d9e89b05e639c388))
* **ai:** organize agent sessions ([c407e02](https://github.com/murongg/markra/commit/c407e02e7ab70ee2158d71e756d4b597f42e7ba4))
* **ai:** polish provider configuration ([6e9c9d4](https://github.com/murongg/markra/commit/6e9c9d4c638f8fc4cb94c7e724cf56a108d66915))
* **ai:** refine agent sessions ([3636dcc](https://github.com/murongg/markra/commit/3636dcc9ceefa4d05ae1c28f46004e8f0fc1945b))
* **ai:** refine inline command flow ([3c0d4d0](https://github.com/murongg/markra/commit/3c0d4d0163907f806bc4d9cf49472f0c7edf4464))
* **ai:** refine inline editing interactions ([8e56c12](https://github.com/murongg/markra/commit/8e56c129169685345180cfee5537d2ca5a523f8e))
* **ai:** refine model pickers and agent panel ([1d25ad0](https://github.com/murongg/markra/commit/1d25ad09373b00cdcbc6741a5bac131c69ac4790))
* **ai:** refine provider catalog ([172a543](https://github.com/murongg/markra/commit/172a5435f2ba5a32724d506f3a9412cc5e405e93))
* **ai:** remember web search preference ([fd63643](https://github.com/murongg/markra/commit/fd6364318108308b6655f31095b4cc50dbe8da16))
* **ai:** restore session agent preferences ([56e2348](https://github.com/murongg/markra/commit/56e2348940ac48ddd80cbbd6fc9f5aef1205393a))
* **ai:** send markdown images to vision models ([9fedb9d](https://github.com/murongg/markra/commit/9fedb9d0e0d7f8d5a2bfcffe58bdc9b695c5dd74))
* **editor:** add table alignment controls ([8da703f](https://github.com/murongg/markra/commit/8da703fee1bd2b93be39436a0c807aa1d479ad69))
* **editor:** add table size picker ([6948c9f](https://github.com/murongg/markra/commit/6948c9f2b417e1da63a9e06a6d8c70f3c6ee9d23))
* **editor:** add visual table editing controls ([6f136d9](https://github.com/murongg/markra/commit/6f136d90f44980535151247ce35d14f568753452))
* **files:** add native file tree actions ([25d9761](https://github.com/murongg/markra/commit/25d976184b02260812fd1eb81dba450d59e04f64))
* **i18n:** localize desktop editor features ([a144a32](https://github.com/murongg/markra/commit/a144a32102611386c7dd5b259d92dd460e18c3e7))
* **images:** save pasted images and preview assets ([d222362](https://github.com/murongg/markra/commit/d2223626e91fea4dc6030ddc33801ff6d23cdbf9))
* scaffold Markra desktop editor ([cab5097](https://github.com/murongg/markra/commit/cab50972a9704212d444c1a3b188c25336f9464c))
* **settings:** add system theme preference ([fe34f20](https://github.com/murongg/markra/commit/fe34f20cb9fcde60888e1a448c3984cb78a76194))
* **settings:** streamline settings panel ([7e77f0b](https://github.com/murongg/markra/commit/7e77f0bb0df0273f23dacad348a1b5f1e4eaaa8a))
* **shell:** polish native chrome and file tree ([b80c230](https://github.com/murongg/markra/commit/b80c230f98b4bde7ebe159e4a34c014eec124cbe))
* **shell:** polish sidebar and titlebar interactions ([8a7aac7](https://github.com/murongg/markra/commit/8a7aac7acedad0d236e9b04fefd782e9a2b02037))

### Bug Fixes

* **ai:** correct document edit tools ([cd03ccf](https://github.com/murongg/markra/commit/cd03ccf3e8d7e9d4d6b870776812103cfad4f106))
* **ai:** disable agent chat without a document ([90df872](https://github.com/murongg/markra/commit/90df872e263f1c1d2e78a6355adf500ca6be71b6))
* **ai:** guard enter submit during IME composition ([c045c90](https://github.com/murongg/markra/commit/c045c9012e8b175f0be0d587fe39e2b9cfddcaff))
* **ai:** handle provider search and reasoning streams ([19ff011](https://github.com/murongg/markra/commit/19ff011b7fc5d23c074848db5319adc7b5a5953c))
* **ai:** harden sessions and document switching ([b725e3a](https://github.com/murongg/markra/commit/b725e3a10204b230093d34863a5ed2bc1a5aafe1))
* **ai:** improve stream reasoning handling ([62b406d](https://github.com/murongg/markra/commit/62b406d769c56a6a4147a7edddc95f6b9fac9b48))
* **ai:** keep active session model selection ([da395bd](https://github.com/murongg/markra/commit/da395bd727625748cb88ae13a31147296c4df27f))
* **ai:** keep agent chat scrolled to latest message ([8b63f29](https://github.com/murongg/markra/commit/8b63f292495eb069f370c77ab833dc258c629bf4))
* **ai:** render preview anchors reliably ([f2c21b4](https://github.com/murongg/markra/commit/f2c21b4ba69fbf36bba8806d9cdd8c92d1d2ec3f))
* **ai:** target document edits reliably ([d811374](https://github.com/murongg/markra/commit/d811374446865e8cb430cbbaf8cee4925c5af669))
* **ai:** update workspace on file selection ([b9a4809](https://github.com/murongg/markra/commit/b9a4809bf289546e7566df6860c39214cdc804d4))
* **ci:** point tauri checks at desktop app ([e7a8627](https://github.com/murongg/markra/commit/e7a86275047f0afacb9f85943910bca569a31a5e))
* **editor:** focus empty editor on launch ([f0dd5bf](https://github.com/murongg/markra/commit/f0dd5bf756530281091b1e013ec0c7b2271fd518))
* **editor:** open markdown links externally ([f35403a](https://github.com/murongg/markra/commit/f35403a07750e94478f2628195130835240fcb77))
* **editor:** preserve markdown source for links and images ([d651e3b](https://github.com/murongg/markra/commit/d651e3bd242be23863d878a606087362e15f1cdf))
* **editor:** render editable html blocks ([21faee0](https://github.com/murongg/markra/commit/21faee04d3dd3710b9af0ad71e56c0c864905848))
* **editor:** stabilize AI preview navigation ([db58e81](https://github.com/murongg/markra/commit/db58e818562a385524e0b2c4527370cf8a637a98))
* **file-tree:** support image asset renaming ([7d807e2](https://github.com/murongg/markra/commit/7d807e2815691fd7f1409d7409e2cb18ad7c42ef))
* **files:** handle dragged workspace folders ([564b9f8](https://github.com/murongg/markra/commit/564b9f88c0b702029a061cb58dba05e6188361bd))
* **release:** configure tauri bundle icons ([0cf30e8](https://github.com/murongg/markra/commit/0cf30e8db572323e436234e8d48dffe90bcf298f))
* **tsconfig:** expose package test projects to editors ([b7688ed](https://github.com/murongg/markra/commit/b7688ed5713139e23d17f86de884add682ab2404))

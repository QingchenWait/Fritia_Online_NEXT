# DEVELOP.md 鈥?鑺欐彁闆?Online NEXT 寮€鍙戞枃妗?
## 椤圭洰姒傝堪

鍩轰簬 Three.js 鐨勯潤鎬佺綉椤?3D 瑙掕壊浜掑姩搴旂敤锛屾覆鏌?PMX 鏍煎紡鐨勮姍鎻愰泤锛團ritia锛夎鑹叉ā鍨嬶紝
鏀寔瑙掕壊鑷姩琛屼负锛堣蛋鍔ㄣ€佸潗涓嬨€佺湪鐪硷級銆佺涓€浜虹О鎴块棿婕父銆丩LM 瀵硅瘽銆佹崲瑁呯瓑鍔熻兘銆?
---

## 鏂囦欢缁撴瀯

```
fritia_online_v2/
鈹溾攢鈹€ index.html                    # 鍏ュ彛 HTML锛屽寘鍚墍鏈?UI 鍏冪礌
鈹溾攢鈹€ css/
鈹?  鈹斺攢鈹€ style.css                 # 鍏ㄥ眬鏍峰紡
鈹溾攢鈹€ js/
鈹?  鈹溾攢鈹€ main.js                   # 搴旂敤鍏ュ彛锛屽垵濮嬪寲娴佺▼ & 涓诲惊鐜?鈹?  鈹溾攢鈹€ scene.js                  # Three.js 鍦烘櫙銆佺浉鏈恒€佺伅鍏夈€佹覆鏌撳櫒
鈹?  鈹溾攢鈹€ room.js                   # 鎴块棿鍑犱綍浣撱€佸鍏枫€佺鎾炰綋銆佽矾寰勭偣
鈹?  鈹溾攢鈹€ character.js              # PMX 瑙掕壊鍔犺浇銆佹潗璐ㄨ浆鎹€侀楠煎姩鐢汇€佺姸鎬佹満
鈹?  鈹溾攢鈹€ controls.js               # 绗竴浜虹О鎺у埗鍣?& 绉诲姩绔Е鎽告敮鎸?鈹?  鈹溾攢鈹€ dialogue.js               # LLM 瀵硅瘽绯荤粺锛圤penAI 鍏煎 API 娴佸紡浼犺緭锛?鈹?  鈹斺攢鈹€ settings.js               # 鐢ㄦ埛璁剧疆鎸佷箙鍖栵紙localStorage锛?鈹溾攢鈹€ src/
鈹?  鈹溾攢鈹€ _fritia_3d_model/         # 榛樿妯″瀷锛氭瘺缁掓淳瀵?鈹?  鈹溾攢鈹€ _fritia_alterable_models/ # 鍙崲瑁呮ā鍨嬶紙4 濂楋級
鈹?  鈹?  鈹溾攢鈹€ sweety_straw/         # 鑽夎帗鐢滃績
鈹?  鈹?  鈹溾攢鈹€ cyan_leaf/            # 闈掑彾瀵嗚９
鈹?  鈹?  鈹溾攢鈹€ pool_guard/           # 娉虫睜鎶ゅ崼
鈹?  鈹?  鈹斺攢鈹€ small_king/           # 鍥戒富椹惧埌
鈹?  鈹斺攢鈹€ _voices/                  # 璇煶鏂囦欢锛坰tartup_*.wav锛?鈹溾攢鈹€ package.json
鈹斺攢鈹€ LICENSE
```

---

## 妯″潡鍔熻兘璇﹁В

### `js/main.js` 鈥?搴旂敤鍏ュ彛

| 鍔熻兘 | 璇存槑 |
|------|------|
| `init()` | 寮傛鍒濆鍖栨祦绋嬶細鍦烘櫙 鈫?鎴块棿 鈫?瑙掕壊 鈫?鎺у埗 鈫?瀵硅瘽 鈫?UI |
| `animate()` | 涓绘覆鏌撳惊鐜紙requestAnimationFrame锛夛紝鏇存柊鎺у埗銆佽鑹层€佹覆鏌?|
| `onKeyDown()` | 鍏ㄥ眬閿洏浜嬩欢锛欶 浜や簰銆丒 鎹㈢敾/鎹㈣銆丒SC 閫€鍑?|
| `initPainting()` | 鎸傜敾涓婁紶涓?localStorage 鎸佷箙鍖?|
| `openModelSelector()` / `closeModelSelector()` | 鎹㈣闈㈡澘 UI |
| `selectModel()` | 璋冪敤 `swapModel()` 鍒囨崲瑙掕壊妯″瀷 |
| `playStartupVoice()` | 棣栨浜や簰鏃舵挱鏀鹃殢鏈鸿闊?|

### `js/scene.js` 鈥?鍦烘櫙鍒濆鍖?
| 鍏冪礌 | 閰嶇疆 |
|------|------|
| 娓叉煋鍣?| WebGLRenderer, PCFSoftShadowMap, SRGBColorSpace |
| 鐩告満 | PerspectiveCamera(65掳), 鍒濆浣嶇疆 (0, 1.6, 1.5) |
| 鐜鍏?| AmbientLight(0xfff0e0, 0.5) |
| 涓诲厜婧?| DirectionalLight(0xfff5e6, 0.9), 鎶曞皠闃村奖, 2048脳2048 shadowMap |
| 鍙扮伅 | PointLight(0xffd080, 0.5, 5m), 鎶曞皠闃村奖, 512脳512 |
| 绐楀厜 | RectAreaLight(0x88bbff, 0.4) |
| 鑳屾櫙 | 0x1a1a2e + 闆炬晥 |

### `js/room.js` 鈥?鎴块棿鏋勫缓

- 6脳5m 鎴块棿锛屽洓闈㈠ + 澶╄姳鏉?+ 鍦版澘
- 瀹跺叿锛氬簥锛堝乏渚э級銆佷功妗?+ 妞呭瓙锛堝彸渚у墠锛夈€佷功鏋讹紙鍙充晶鍚庯級銆佽。鏌滐紙鍙充晶鍚庯級銆佺獥鎴凤紙鍚庡锛夈€佹寕鐢伙紙鍓嶅锛?- 纰版挒绯荤粺锛氭墍鏈夊鍏峰拰澧欏鐢熸垚 AABB 纰版挒鐩?- 璺緞鐐圭郴缁燂細6 涓矾寰勭偣锛堜腑蹇冦€佺獥鎴枫€侀棬鍙ｃ€佷功鏋躲€佸簥銆佹瀛愶級锛屽叾涓簥鍜屾瀛愭爣璁颁负 `isFurniture: true` 鐢ㄤ簬鍧愪笅閫昏緫

### `js/character.js` 鈥?瑙掕壊绯荤粺锛堟牳蹇冩ā鍧楋級

#### PMX 鍔犺浇涓庢潗璐ㄨ浆鎹?
- 浣跨敤 `MMDLoader` 鍔犺浇 PMX 妯″瀷
- 灏嗗師濮?PMX 鏉愯川杞崲涓?`MeshToonMaterial`锛堝崱閫氭覆鏌撻鏍硷級
- 鏉愯川杞崲绛栫暐锛堜笁绉嶆儏鍐碉級锛?  1. **AlphaTest 鏉愯川**锛堟湁 `alphaTest > 0`锛夛細浣跨敤 `alphaTest` 纭竟缂樿鍒囷紝涓嶉€忔槑
  2. **鍗婇€忔槑鏉愯川**锛坄transparent = true` 鎴?`opacity < 1`锛夛細鍚敤 alpha blending锛宍depthWrite = false`锛宍DoubleSide` 娓叉煋
  3. **涓嶉€忔槑鏉愯川**锛氭爣鍑嗕笉閫忔槑娓叉煋
- 澶村彂鏉愯川锛堝悕绉板尮閰?`hair`/`楂猔/`澶村彂`锛夛細浣跨敤 `alphaTest` 瑁佸垏娓叉煋锛屽弻闈㈡覆鏌?
#### 楠ㄩ绯荤粺

- 楠ㄩ鏄犲皠琛?`BONE_MAP`锛氭敮鎸佹棩鏂?鑻辨枃楠ㄩ鍚?- 鏀寔鐨勯楠硷細涓績銆佽剨鏌泵?銆佸ご銆佸乏鍙宠偐銆佸乏鍙宠偐C銆佸乏鍙宠噦銆佸乏鍙宠倶銆佸乏鍙宠吙銆佸乏鍙宠啙銆佸乏鍙宠笣
- 姣忓抚璋冪敤 `forceUpdate()` 寮哄埗鏇存柊楠ㄩ鐭╅樀

#### 瑙掕壊鐘舵€佹満

| 鐘舵€?| 璇存槑 |
|------|------|
| `IDLE` | 闈欐绔欑珛锛屽懠鍚稿姩鐢伙紝闅忔満鏃堕棿鍚庡垏鎹㈠埌璧拌矾 |
| `WALKING` | 娌胯矾寰勭偣琛岃蛋锛屾琛屽懆鏈熷姩鐢伙紝纰版挒妫€娴?|
| `TURNING_TO_SIT` | 杞韩闈㈠悜瀹跺叿锛?.8s锛?|
| `STAND_TO_SIT` | 绔欑珛鈫掑潗涓嬪Э鎬佽繃娓★紙1.2s锛?|
| `SITTING` | 鍧愬Э闈欐锛屽懠鍚稿姩鐢伙紝闅忔満鏃堕棿鍚庤捣绔?|
| `SIT_TO_STAND` | 鍧愪笅鈫掔珯绔嬭繃娓★紙1.2s锛?|
| `WAVING` | 鎸ユ墜鍔ㄧ敾锛堥娆＄偣鍑绘椂瑙﹀彂锛?.5s锛?|
| `INTERACTING` | 瀵硅瘽妯″紡锛氬ご閮ㄨ拷韪帺瀹朵綅缃?|

#### 鐫＄湢妯″紡

- 瑙﹀彂锛氬噯鏄熷鍑嗗簥鎸?E锛堥€氳繃 `isLookingAtBed()` 灏勭嚎妫€娴?`bedMesh`锛?- 杩涘叆锛歚fadeToBlack()` 鈫?淇濆瓨鐩告満鐘舵€?鈫?绉诲姩瑙掕壊鍒板簥浣嶇疆 鈫?`applySleepingPose()` 鈫?闂溂锛坄blinkIndex = 1.0`锛夆啋 鐩告満绉诲埌搴婅竟锛堣繎璺濈韬哄Э瑙嗚锛夆啋 `fadeFromBlack()`
- 閫€鍑猴細`fadeToBlack()` 鈫?鎭㈠鐩告満鐘舵€?鈫?閲嶇疆瑙掕壊浣嶇疆鍜屽Э鎬?鈫?`applyIdlePose()` 鈫?鐫佺溂 鈫?`fadeFromBlack()`
- 鐫＄湢涓細WASD 绉诲姩绂佺敤锛坄controlsModule.update()` 璺宠繃锛夛紝浠呭厑璁搁紶鏍囪瑙掓棆杞?- 鐫＄湢濮挎€侊細鑴婃煴澶у箙鍚庝话 + 渚у€撅紝鍙岃吙寮洸锛屽ご閮ㄤ晶鍋忥紝妯℃嫙渚ц汉

#### Morph Target

- 鐪ㄧ溂锛氭悳绱?`銇俱伆銇熴亶` / `blink` / `鐪ㄧ溂`锛屽懆鏈?2~6s 闅忔満
- 寰瑧锛氭悳绱?`绗戙亜` / `寰瑧銇縛 / `smile` / `銇仯銇撱倞`锛岄粯璁ゅ己搴?0.3

### `js/controls.js` 鈥?绗竴浜虹О鎺у埗

- `PointerLockControls`锛氱偣鍑婚攣瀹氶紶鏍囷紝ESC 瑙ｉ攣
- WASD 绉诲姩 + 纰版挒妫€娴嬶紙0.25m 鍗婂緞鐞冧綋锛?- 绉诲姩绔敮鎸侊細铏氭嫙鎽囨潌 + 瑙︽懜瑙嗚鎺у埗
- `isNearCharacter()`锛氳窛绂诲垽瀹氾紙2.5m 闃堝€硷級

### `js/dialogue.js` 鈥?瀵硅瘽绯荤粺

- OpenAI 鍏煎 API 娴佸紡璋冪敤锛圫SE锛?- 绯荤粺 Prompt锛氳姍鎻愰泤瑙掕壊璁惧畾锛堝彲鐖卞コ鍙嬶紝绠€鐭彛璇洖澶嶏級
- 涓婁笅鏂囩獥鍙ｏ細鏈€杩?30 鏉℃秷鎭?- 鍙傛暟锛歵emperature=0.85, max_tokens=200

### `js/settings.js` 鈥?璁剧疆绠＄悊

- 鎸佷箙鍖栧瓨鍌細`localStorage` key = `fritia-settings`
- 閰嶇疆椤癸細`apiKey`, `baseUrl`, `model`
- 榛樿鍊硷細OpenAI API, gpt-4o-mini

---

## 鎶€鏈爤

| 缁勪欢 | 鐗堟湰/鎶€鏈?|
|------|-----------|
| 娓叉煋寮曟搸 | Three.js r169 (CDN importmap) |
| 妯″瀷鏍煎紡 | PMX (MikuMikuDance) |
| 鍔犺浇鍣?| MMDLoader (three/addons) |
| 娓叉煋椋庢牸 | MeshToonMaterial (鍗￠€氭覆鏌? |
| 瀵硅瘽 API | OpenAI 鍏煎 (娴佸紡 SSE) |
| 閮ㄧ讲鏂瑰紡 | 绾潤鎬佺綉椤碉紝鏃犻渶鍚庣 |

---

## 鍏抽敭璁捐鍐崇瓥

### 鏉愯川杞崲绛栫暐

PMX 鍘熷鏉愯川 鈫?MeshToonMaterial 杞崲鏃讹紝鍖哄垎涓夌閫忔槑妯″紡锛?1. **AlphaTest**锛氬師濮?`alphaTest > 0` 鏃朵娇鐢紝閫傚悎鏍戝彾/钑句笣绛夐晜绌烘潗璐?2. **Alpha Blending**锛氬師濮?`transparent = true` 鎴?`opacity < 1` 鏃朵娇鐢紝閫傚悎澶村彂绛夊崐閫忔槑鏉愯川
3. **涓嶉€忔槑**锛氬叾浠栨儏鍐?
澶村彂鍗婇€忔槑淇锛?026-06-17锛夛細
- 鍘?bug锛歁MDLoader 涓嶈缃?`transparent = true`锛堝ご鍙戞潗璐?#24 `澶村彂`銆?25 `澶村彂1` 鍧囦负 `transparent: false, opacity: 1, alphaTest: 0`锛夛紝瀵艰嚧澶村彂绾圭悊 alpha 閫氶亾鏈浣跨敤
- 淇锛氶€氳繃鏉愯川鍚嶅尮閰嶏紙`/hair|楂獆澶村彂/i`锛夎瘑鍒ご鍙戞潗璐紝浣跨敤 `alphaTest` 瑁佸垏娓叉煋锛圥MX 澶村彂绾圭悊鐨?alpha 閫氶亾鏄簩鍊肩殑锛氬ご鍙戜笣 = 1.0锛岀┖闅?= 0.0锛?- 淇2锛氭坊鍔?`setupTransparentShadows(mesh)` 鍑芥暟锛屼负浣跨敤 `alphaTest` 鐨勬潗璐ㄥ垱寤鸿嚜瀹氫箟娣卞害鐫€鑹插櫒锛坄customDepthMaterial`锛夛紝浣块槾褰辫创鍥惧皧閲?alpha 閫氶亾
- 淇3锛氳嚜瀹氫箟娣卞害鐫€鑹插櫒浣跨敤 `#define USE_SKINNING` + Three.js 鐨?`skinning_pars_vertex` 瀹炵幇楠ㄩ鍔ㄧ敾鏀寔
- 娉ㄦ剰锛歍hree.js 鐨?`depthPacking` 鍜?`skinning` 涓嶆槸 ShaderMaterial 鐨勫睘鎬э紝闇€瑕侀€氳繃鐫€鑹插櫒 define 鍜?uniforms 鎵嬪姩澶勭悊

### 鐩告満涓庝氦浜?
- 鍥哄畾楂樺害 1.6m锛堢涓€浜虹О瑙嗚锛?- PointerLock 鎺у埗锛孍SC 閫€鍑轰氦浜掓ā寮?- 璺濈闃堝€?2.5m 瑙﹀彂浜や簰鎻愮ず

### 妯″瀷鑷姩琛屼负

- 鍩轰簬璁℃椂鍣ㄧ殑鐘舵€佹満锛岄殢鏈烘椂闂磋Е鍙戠姸鎬佸垏鎹?- 鍧愪笅鍐峰嵈 5s锛岄槻姝㈠弽澶嶅潗涓?- 楠ㄩ鍔ㄧ敾锛氭墜鍔ㄨ绠?rotation锛岄潪鍔ㄧ敾鍓緫

---

## 鏋勫缓涓庤繍琛?
```bash
# 鏈湴寮€鍙戯紙闇€瑕佹湰鍦?HTTP 鏈嶅姟鍣紝鍥犱负 ES modules锛?npx serve .
# 鎴?python -m http.server 8000

# 鎵撳紑 http://localhost:8000
```

鏃犻渶鏋勫缓姝ラ锛岀洿鎺ユ祻瑙堝櫒鎵撳紑锛堥渶 HTTP 鏈嶅姟鍣ㄦ敮鎸?importmap锛夈€?
---

## 閫犳ⅵ绯荤粺锛?026-06-18锛?
閫犳ⅵ绯荤粺鏄?LLM 椹卞姩鐨勫鍏疯嚜涓诲垱閫犱笌鎴块棿甯冪疆妯″紡锛屼粛鐒舵槸绾潤鎬佸墠绔疄鐜帮紝涓嶆柊澧炲悗绔湇鍔°€?
### 鏂板/淇敼妯″潡

- `js/room.js`
  - 鏃ф埧闂翠粛鍗犵敤 `X [-3, 3]`, `Z [-2.5, 2.5]`銆?  - 鏂板閫犳ⅵ鎴块棿浣嶄簬鏃ф埧鍙充晶 `+X`锛屽崰鐢?`X [3, 13]`, `Z [-3, 3]`锛岄潰绉害涓烘棫鎴?2 鍊嶃€?  - 鏃у彸澧欐寜杩炴帴闂ㄦ礊鍒嗘锛岄棬娲炰腑蹇冪害 `X=3, Z=0.65`锛岀帺瀹跺彲閫氳繃銆?  - 杩斿洖 `dreamTerminalMesh`, `oldRoomBounds`, `dreamRoomBounds`, `dreamRoomColliders`, `dreamRoomWaypoints`, `doorClearanceZone`, `dreamWindowMesh`銆?- `js/dream_furniture_factory.js`
  - 鍙礋璐ｇ‘瀹氭€у鍏疯鏍兼牎楠屻€乶ormalize銆乸rimitive mesh 鏋勫缓銆丄ABB collider銆乸ose 搴旂敤鍜屽簭鍒楀寲銆?  - 鍏佽 primitive锛歚box`, `cylinder`, `sphere`, `cone`, `torus`, `plane`銆?  - 鍏佽绫诲埆锛歚seat`, `table`, `bed`, `storage`, `lighting`, `decor`, `plant`, `toy`, `custom`銆?  - 缁勪欢鏁伴噺闄愬埗 1-24锛涢鑹插繀椤绘槸 `#RRGGBB`锛岄潪娉曢鑹插洖閫€榛樿鑹诧紱鏉愯川鍙槧灏勬湰鍦?preset銆?- `js/dream_llm.js`
  - 澶嶇敤 `settings.js` 鐨?`apiKey/baseUrl/model` 璋冪敤 OpenAI 鍏煎 `chat/completions`銆?  - `requestDreamFurnitureSpec()` 璇锋眰涓ユ牸瀹跺叿 JSON銆?  - `requestFurnitureRomanticLine()` 涓哄姩鎬佸鍏?waypoint 璁块棶鐢熸垚鐭亱鐖卞彴璇嶃€?  - 鍏煎 `application/json` 闈炴祦寮忓搷搴斿拰 SSE/鏂囨湰娴佸搷搴斻€?- `js/dream_system.js`
  - 璐熻矗 UI銆佸埗閫犳祦绋嬨€佹憜鏀炬悳绱€佸け璐ユ彁绀恒€佹墸璐广€乴ocalStorage銆佸鍏ュ鍑恒€佸鍏峰揩鎹锋帶鍒躲€佸鍏风紪杈戙€佸姩鎬佺鎾炰綋銆佸姩鎬?waypoint銆佸鍏峰彴璇嶅喎鍗淬€?  - 鎴愭湰鍥哄畾 `500 鏁版嵁閲慲锛涘彧鏈夊鍏烽儴缃层€佹牎楠屽拰淇濆瓨鎴愬姛鍚庢墠璋冪敤 `spendMoney(500)`銆?  - 鍒犻櫎鑷埗瀹跺叿閫€鍥?`400 鏁版嵁閲慲銆?- `js/main.js`
  - 鍒濆鍖栭€犳ⅵ绯荤粺銆?  - `KeyE` 澧炲姞鐪嬪悜閫犳ⅵ缁堢鎵撳紑鈥滃鍏峰竷缃€濄€佺湅鍚戣嚜鍒跺鍏锋墦寮€瀹跺叿绠＄悊銆?  - `updateInteractionPrompt()` 澶嶇敤 `#painting-prompt` 鏄剧ず `鎸?E 鎵撳紑閫犳ⅵ缁堢` / `鎸?E 绠＄悊瀹跺叿`銆?  - 瀵煎嚭 JSON 椤跺眰鍔犲叆 `dreamFurniture`锛涘鍏ユ椂鎸?id 鍚堝苟骞惰烦杩囧潖瀹跺叿銆?  - 鏍规嵁鐩告満浣嶇疆鍒囨崲鑺欐彁闆呭鑸綔鐢ㄥ煙锛氭棫鎴块棿鍜岄€犳ⅵ鎴块棿浜掓枼娲诲姩銆?- `js/character.js`
  - 鏂板 `setCharacterNavigationScope(cd, scope)` 鍜?`forceCharacterIntoRoom(cd, roomId, spawnPosition)`銆?  - 鍒拌揪鍔ㄦ€佸鍏?waypoint 鏃舵淳鍙?`fritia-dream-furniture-visited`銆?- `js/controls.js`
  - overlay 绠＄悊鍒楄〃鏂板 `dream-terminal-panel`, `dream-furniture-editor-panel`, `dream-object-controls`銆?  - 鏂板 `setColliders()`, `addColliders()`, `removeColliders()` 鐢ㄤ簬鍔ㄦ€佸鍏风鎾炲悓姝ャ€?  - 鏂板 `resolveCameraCollisions()`锛屽鍏风Щ鍔ㄥ埌鐜╁鑴氫笅鏃跺皢鐩告満姘村钩鎺ㄥ嚭纰版挒浣撱€?  - 鏂板 `setMovementLocked()` 鍜?`rotateView()`锛屽鍏峰揩鎹风鐞嗘椂鍏佽鎷栨嫿杞姩瑙嗚浣嗙鐢ㄧ帺瀹剁Щ鍔ㄣ€?- `src/_logos`
  - 鏂板閫犳ⅵ缁堢鍜屽鍏峰揩鎹锋搷浣滃浘鏍囷細`dream_ai_core.svg`, `dream_blueprint.svg`, `dream_arrow_up.svg`, `dream_arrow_down.svg`, `dream_arrow_left.svg`, `dream_arrow_right.svg`, `dream_rotate_left.svg`, `dream_rotate_right.svg`, `dream_edit.svg`, `dream_coin.svg`銆?
### DOM id

- 瀹跺叿甯冪疆娴眰锛歚#dream-terminal-panel`
- 绐楀彛鏍囬锛歚閫犳ⅵ-瀹跺叿鎵撻€犵粓绔痐
- 鍏抽棴鍥炬爣鎸夐挳锛歚#dream-terminal-close`
- 瀹跺叿鎻忚堪杈撳叆锛歚#dream-furniture-description`
- 鎽嗘斁浣嶇疆杈撳叆锛歚#dream-placement-input`
- 鍒堕€犳寜閽細`#dream-create-button`
- 闃舵鏂囨湰锛歚#dream-progress`
- 杩涘害鏉★細`#dream-progress-fill`
- 鐘舵€佹彁绀猴細`#dream-status`
- 浣欓鏄剧ず锛歚#dream-balance`
- 瀹跺叿瀹炰綋蹇嵎鎺у埗灞傦細`#dream-object-controls`
- 蹇嵎绉诲姩鎸夐挳锛歚#dream-object-move-forward`, `#dream-object-move-back`, `#dream-object-move-left`, `#dream-object-move-right`
- 蹇嵎鏃嬭浆鎸夐挳锛歚#dream-object-rotate-left`, `#dream-object-rotate-right`
- 蹇嵎缂栬緫鎸夐挳锛歚#dream-object-edit`
- 蹇嵎纭鎸夐挳锛歚#dream-object-close`
- 涓诲睆骞曟皵娉℃彁绀猴細`#dream-screen-toast`
- 瀹跺叿绠＄悊娴眰锛歚#dream-furniture-editor-panel`
- 绠＄悊鍏抽棴鍥炬爣鎸夐挳锛歚#dream-editor-close`
- 绠＄悊鏍囬锛歚#dream-editor-title`
- 绠＄悊鍏冧俊鎭細`#dream-editor-meta`
- 閲嶅懡鍚嶈緭鍏ワ細`#dream-editor-name`
- 閲嶅懡鍚嶄繚瀛橈細`#dream-editor-save-name`
- 鑷姩鎽嗘斁杈撳叆/鎸夐挳锛歚#dream-editor-placement`, `#dream-editor-auto-place`
- 閲嶇疆/鍒犻櫎锛歚#dream-editor-reset`, `#dream-editor-delete`
- 绠＄悊鐘舵€侊細`#dream-editor-status`

### localStorage 涓庡鍏ュ鍑?
- 鏂?key锛歚fritia_dream_furniture`
- 瀛樺偍鏍煎紡锛氭暟缁勶紝姣忛」鍖呭惈锛?  - `id`
  - `name`
  - `category`
  - `description`
  - `spec`
  - `pose.position.x/y/z`
  - `pose.rotationY`
  - `createdAt`
  - `gameDateTime`
  - `lastDialogueAt`
- 瀵煎嚭 JSON锛?  - 椤跺眰瀛楁 `dreamFurniture`
  - `gameState.dreamFurniture` 涔熷寘鍚彧璇诲揩鐓э紝鏂逛究鏈潵鍏煎銆?- 瀵煎叆 JSON锛?  - 鏀寔 `data.dreamFurniture` 鎴?`data.gameState.dreamFurniture`銆?  - 鎸?`id` 鍘婚噸鍚堝苟銆?  - 鍗曚欢瀹跺叿 spec 鎭㈠澶辫触鎴栨憜鏀句笉瀹夊叏鏃惰烦杩囷紝涓嶅奖鍝嶆暣浣撳鍏ャ€?
### 浜嬩欢鍚?
- `fritia-overlay-closed`
  - 閫犳ⅵ闈㈡澘鍏抽棴鏃?detail id 涓?`dream-terminal-panel`, `dream-furniture-editor-panel` 鎴?`dream-object-controls`銆?- `fritia-dream-furniture-visited`
  - 瑙掕壊鍒拌揪鍔ㄦ€佸鍏?waypoint 鏃舵淳鍙戙€?  - detail 鍖呭惈 `furnitureId`, `name`, `description`, `category`, `dialogueTags`銆?- `fritia-game-state-updated`
  - 鎴愬姛鎵ｈ垂鍚庣敱 `spendMoney()` 娲惧彂锛屼富娴佺▼鍒锋柊 HUD銆?  - `addMoney(amount, reason)` 浼氬湪 detail 涓甫 `moneyDelta`锛孒UD 鍦ㄦ暟鎹噾浣欓鍚庢樉绀?`+amount`銆?
### LLM JSON 鍗忚

LLM 鍙兘杈撳嚭瀹跺叿瑙勬牸 JSON锛屼笉鍏佽杈撳嚭 Markdown銆佽В閲娿€佸閮?URL 鎴?JavaScript銆傚叧閿瓧娈碉細

```json
{
  "name": "鏄熷厜闃呰娌欏彂",
  "category": "seat",
  "description": "閫傚悎涓や汉闈犲潗鐨勬煍杞矙鍙戙€?,
  "dimensions": { "width": 1.8, "height": 0.9, "depth": 0.85 },
  "frontDirection": "+Z",
  "anchor": "floor",
  "components": [
    {
      "type": "box",
      "name": "seat_base",
      "position": { "x": 0, "y": 0.35, "z": 0 },
      "rotation": { "x": 0, "y": 0, "z": 0 },
      "size": { "x": 1.8, "y": 0.3, "z": 0.8 },
      "color": "#d9a7c7",
      "material": "fabric"
    }
  ],
  "interaction": {
    "waypoint": {
      "enabled": true,
      "offset": { "x": 0, "y": 0, "z": 1.0 },
      "furnitureType": "seat",
      "dialogueTags": ["娌欏彂", "鏄熷厜", "浼戞伅"]
    }
  },
  "placement": { "intent": "闈犺繎绐楄竟", "preferredWall": "window", "avoidDoor": true }
}
```

### 浜や簰瑙勫垯

- 鐪嬪悜閫犳ⅵ缁堢鎸?`E` 鎵撳紑 `瀹跺叿甯冪疆` 娴眰銆?- 閫犳ⅵ缁堢娴眰鏍囬鏁村悎涓?`閫犳ⅵ-瀹跺叿鎵撻€犵粓绔痐锛岃瑙変娇鐢ㄩ」鐩幇鏈夋繁鑹插崐閫忔槑娴眰閰嶈壊锛涘乏渚т负鎰挎湜杈撳叆宸ヤ綔鍖猴紝鍙充晶涓烘墦閫犲弬鏁颁笌杩涘害鐘舵€併€?- 鍒堕€犻樁娈碉細`妫€鏌ヤ綑棰濅笌 API 璁剧疆` 鈫?`姝ｅ湪瑙ｆ瀽瀹跺叿鎰挎湜` 鈫?`姝ｅ湪鐢熸垚瀹跺叿缁撴瀯` 鈫?`姝ｅ湪瀵绘壘瀹夊叏鎽嗘斁浣嶇疆` 鈫?`姝ｅ湪閮ㄧ讲鍒版埧闂碻 鈫?`瀹屾垚`銆?- 浣欓涓嶈冻銆佹湭閰嶇疆 API Key銆丩LM 璇锋眰澶辫触銆丣SON 瑙ｆ瀽澶辫触銆乻chema 鏍￠獙澶辫触銆佸昂瀵歌繃澶с€佹棤瀹夊叏鎽嗘斁浣嶇疆銆佷繚瀛樺け璐ラ兘涓嶆墸閽便€?- 鐪嬪悜宸茬敓鎴愬鍏锋寜 `E` 涓嶆墦寮€娴眰锛岃€屾槸鍦ㄥ鍏峰疄浣撲腑澶姇褰?`#dream-object-controls`銆?- `#dream-object-controls` 浠ュ崄瀛楁帓甯冨墠鍚庡乏鍙?0.25m 绉诲姩鎸夐挳锛屼腑蹇冧负缁胯壊纭鎸夐挳锛屽乏鍙充袱渚у寤朵负宸﹁浆/鍙宠浆 15掳锛屼笅鏂瑰寤朵负缂栬緫鎸夐挳銆?- 瀹跺叿蹇嵎绠＄悊鏃堕噴鏀?pointer lock 骞堕€氳繃 `#dream-object-controls` 绌虹櫧鍖哄煙鎷栨嫿杞姩瑙嗚锛屽悓鏃堕€氳繃 `setMovementLocked(true)` 绂佹鐜╁绉诲姩銆?- 绉诲姩鎸夐挳鐭寜涓€娆＄Щ鍔?0.25m锛涢暱鎸夎秴杩?0.5 绉掑悗杩炵画鍚戝搴旀柟鍚戠Щ鍔ㄣ€?- 鏃嬭浆鎸夐挳鐭寜涓€娆℃棆杞?15掳锛涢暱鎸夎秴杩?0.5 绉掑悗鎵嶈繘鍏ュ钩婊戣繛缁棆杞€?- 鐐瑰嚮蹇嵎缂栬緫鎸夐挳鎵嶆墦寮€ `#dream-furniture-editor-panel`锛岃娴眰鍙礋璐ｉ噸鍛藉悕銆佹柊鎽嗘斁浣嶇疆鑷姩鎽嗘斁銆侀噸缃拰鍒犻櫎銆?- 瀹跺叿绉诲姩/鏃嬭浆鎴愬姛涓嶆樉绀衡€滀綅缃凡鏇存柊鈥濇垨鈥滄棆杞凡鏇存柊鈥濓紱澶辫触鏃跺湪涓诲睆骞曞眳涓亸涓嬬敤 `#dream-screen-toast` 鏄剧ず涓婃诞姘旀场銆?- 瀹跺叿绉诲姩鎴栨棆杞悗锛屽鏋滅帺瀹剁浉鏈轰笌瀹跺叿/澧欎綋纰版挒浣撻噸鍚堬紝璋冪敤 `resolveCameraCollisions()` 鑷姩閫€閬裤€?- 瀹跺叿绠＄悊鏀寔閲嶅懡鍚嶃€佹寜鑷劧璇█閲嶆柊鑷姩鎽嗘斁銆侀噸缃拰鍒犻櫎銆?- 绉诲姩/鏃嬭浆鍚庨噸鏂板仛杈圭晫銆侀棬鍙ｆ竻绌哄尯鍜屽鍏烽噸鍙犳娴嬶紱澶辫触鍥炴粴銆?- 鍒犻櫎瀹跺叿浼氱Щ闄?mesh銆乧ollider銆亀aypoint 鍜?localStorage 璁板綍锛屽苟閫€鍥?400 鏁版嵁閲戙€?- 鐜╁杩涘叆閫犳ⅵ鎴块棿鍚庯紝鑺欐彁闆呭鑸垏鎹㈠埌閫犳ⅵ鎴块棿锛涘洖鏃ф埧闂村悗鍒囧洖鏃ф埧闂淬€?- 鍔ㄦ€佸鍏峰彴璇嶅悓涓€瀹跺叿鑷冲皯鍐峰嵈 10 鍒嗛挓鐜板疄鏃堕棿銆?
### 娴嬭瘯鏂规硶

1. `npm run dev` 鍚姩闈欐€佹湇鍔°€?2. 纭鏃ф埧闂淬€佽喘鐗╃粓绔€佺ぜ鐗╂敹钘忋€佺害浼氥€佹崲瑁呫€佸簥銆佹寕鐢诲拰鏃ュ父瀵硅瘽浠嶈兘浜や簰銆?3. 浠庢棫鎴垮彸渚ч棬娲炶繘鍏ラ€犳ⅵ鎴块棿锛岀‘璁や笉浼氳澧欎綋纰版挒鍫典綇銆?4. 鐪嬪悜閫犳ⅵ缁堢鎸?`E`锛岀‘璁ゆ诞灞傛墦寮€銆佹帶鍒堕噴鏀俱€佸叧闂悗鎭㈠鎺у埗銆?5. 鏈厤缃?API Key 鏃剁偣鍑诲埗閫犲鍏凤紝纭鎻愮ず閿欒涓斾笉鎵ｉ挶銆?6. 浣欓涓嶈冻鏃剁‘璁や笉璋冪敤 LLM 涓斾笉鎵ｉ挶銆?7. 浣跨敤鍚堟硶 LLM 杈撳嚭鍒堕€犲鍏凤紝纭瀹跺叿鐢熸垚鍦ㄩ€犳ⅵ鎴块棿鍐呫€佷笉绌垮銆佷笉鎸￠棬銆佷笉閲嶅彔锛屼笖鎴愬姛鍚庢墸闄?500 鏁版嵁閲戙€?8. 鍒锋柊椤甸潰纭瀹跺叿鎭㈠銆?9. 鐪嬪悜瀹跺叿鎸?`E`锛岀‘璁ゅ疄浣撲腑澶嚭鐜扮揣鍑戝崐閫忔槑蹇嵎鍦嗗舰鎸夐挳锛涙祴璇曠煭鎸夌Щ鍔ㄣ€侀暱鎸夎繛缁Щ鍔ㄣ€佺煭鎸夋棆杞€侀暱鎸夎繛缁棆杞€佷腑蹇冪‘璁ゃ€?10. 鐐瑰嚮蹇嵎缂栬緫鎸夐挳锛屾祴璇曢噸鍛藉悕銆佽嚜鍔ㄦ憜鏀俱€侀噸缃€佸垹闄ゃ€?11. 鍒犻櫎瀹跺叿鍚庣‘璁ゆ暟鎹噾澧炲姞 400锛屽乏涓婅鏁版嵁閲戜綑棰濆悗鏄剧ず `+400`銆?12. 瀹跺叿蹇嵎绠＄悊鏃惰浆鍔ㄨ瑙掞紝纭鍙湅鍚戝洓鍛ㄤ絾 WASD/鎽囨潌涓嶈兘绉诲姩鐜╁銆?13. 灏嗗鍏风Щ鍔ㄥ埌鐜╁鑴氫笅闄勮繎锛岀‘璁ょ浉鏈鸿嚜鍔ㄩ€€閬夸笖涓嶄細鍗¤繘瀹跺叿鎴栧浣撱€?14. 瀵煎嚭 JSON 鍚庡啀瀵煎叆锛岀‘璁ゅ鍏锋仮澶嶄笖鍧忓鍏蜂笉浼氬鑷存暣浣撳鍏ュけ璐ャ€?15. 鐜╁杩涘嚭閫犳ⅵ鎴块棿锛岀‘璁よ姍鎻愰泤鍙湪褰撳墠鎴块棿鐨?waypoint 鍐呯Щ鍔ㄣ€?16. 鑺欐彁闆呭埌杈惧姩鎬佸鍏?waypoint 鍚庯紝鍦ㄥ喎鍗磋鍒欎笅鐢熸垚杞婚噺鍙拌瘝銆?17. 绉诲姩绔鍙ｆ鏌ヨ緭鍏ユ瀛楀彿銆佹寜閽竷灞€鍜屽叧闂悗鎺у埗鎭㈠銆?
## 2026-06-18 Dream System Incremental Notes

- `index.html`
  - Added object-control delete button `#dream-object-delete`, using `src/_logos/dream_trash.svg`.
  - Removed delete action from the edit overlay; `#dream-furniture-editor-panel` now keeps rename, auto-place, and reset only.
- `css/style.css`
  - Added `.dream-object-btn.delete` placement and danger styling.
  - Added `.dream-character-bubble` for Fritia's head-above furniture romance line bubble.
- `js/dream_system.js`
  - New exported helpers: `getDreamFurnitureLabel(furnitureId)` and `getDreamFurnitureDialogueContext()`.
  - Furniture records now persist `playerDescription`, the text typed by the player during creation. Old saves without this field fall back to `description`.
  - `#dream-object-delete` calls the existing delete confirmation/refund flow.
  - Move buttons still short-click by `0.25m`; long press after `0.5s` now moves smoothly in `0.05m` ticks every `40ms`.
  - Furniture placement now tries wall-adjacent candidates before center fallback and rejects the dream-room window clearance zone as well as door clearance/overlaps.
  - Dynamic furniture romance lines are shown with `.dream-character-bubble` projected above Fritia's model instead of a detached toast.
- `js/dialogue.js`
  - Daily chat system prompt appends `getDreamFurnitureDialogueContext()` so Fritia can answer questions about player-created furniture names and descriptions.
- `js/character.js`
  - Added `moveCharacterToWaypoint(cd, waypoint, options)` for room transition walking, with optional queued waypoints.
- `js/main.js`
  - Room switches now try a two-step walking route through the shared door and only fall back to `forceCharacterIntoRoom()` if the route cannot start.
  - Furniture interaction prompt now includes the target furniture name.

Additional tests:

1. Move between bedroom and dream room and verify Fritia walks through the door before teleport fallback is needed.
2. Let Fritia reach a generated furniture waypoint and verify the LLM line appears above her head.
3. Ask about a generated furniture item in daily dialogue and verify the name/player description are available in context.
4. In object controls, long-press move buttons and verify movement is smooth; click the trash button and verify confirm + `+400` refund.
5. Create furniture with no placement text and verify the first accepted placement is wall-adjacent without blocking the door or window.

### 2026-06-18 Bubble Fix Note

- Furniture romance bubbles now use Fritia's head bone world position first, with model AABB as fallback.
- Bubble visibility no longer depends on a strict projected-z visibility gate, preventing valid LLM lines from being hidden when the model bounds or camera projection are unusual.
- Console logs now show `[Dream] furniture romantic line bubble:` when a line is passed to the head bubble, and `[Dream] furniture romantic line skipped:` when the LLM call returns no displayable line.

### 2026-06-18 Furniture Dialogue Fallback Note

- Dream furniture dialogue cooldown is now `60 * 1000` ms real time per furniture item.
- Furniture visits first check active gameplay state; no bubble is shown while controls are not locked, while sleeping, during daily dialogue, date dialogue, gift overlays, or dream overlays.
- Each eligible visit has a `0.5` chance to call the LLM. If the LLM is skipped or fails, the system uses one of 18 local Fritia-style fallback lines.
- Furniture romance line requests use non-streaming `chat/completions` to avoid incompatible SSE parsers returning `LLM 没有返回最终 JSON 内容。` for short plain-text lines.

### 2026-06-18 Furniture Dialogue Parse And Navigation Note

- `js/dream_llm.js` now accepts more OpenAI-compatible `chat/completions` response shapes, including nested `message.content`, array text blocks, `output_text`, and direct `{ "line": "..." }`/`{ "text": "..." }` style responses.
- Furniture romance line requests log `[Dream][LLM] furniture romantic raw output:` before local cleanup, so F12 can show the exact model output used for the bubble.
- Furniture romance line cleanup now strips code fences, optional JSON wrappers, quotes, whitespace, and a leading `芙提雅：` speaker prefix before deciding whether the LLM returned an empty line.
- `js/character.js` now routes character walking through a small room-local grid A* when the direct segment to a waypoint is blocked by furniture colliders.
- Character walking no longer treats a mid-path collider hit as waypoint arrival. It tries to re-plan toward the original waypoint; if re-planning fails, it returns to idle instead of firing the furniture-visited event.
- Random idle movement, post-sit movement, and room-transition movement all use the same waypoint walking entry so generated furniture can be avoided consistently.

### 2026-06-18 Stuck Prevention And Fallback Line Note

- Character waypoint planning still avoids colliders, but walking execution no longer stops when a segment brushes a collider edge. It marks `walkClipping` and keeps moving so Fritia cannot remain stuck forever on furniture collision boundaries.
- If grid routing cannot produce a safe route, `beginWalkToWaypoint()` falls back to a direct segment. A brief visual clip is accepted over blocking the character state machine.
- `FALLBACK_FURNITURE_LINES` is now stored as readable Chinese text in `js/dream_system.js`.
- `getFallbackFurnitureLine()` filters empty values and always returns a non-empty Chinese fallback line before showing Fritia's head bubble.

### 2026-06-18 Furniture Reasoning Token Retry Note

- `js/dream_llm.js` now keeps furniture romance line responses as raw chat completion JSON before extracting display text.
- Furniture romance `max_tokens` is raised from `80` to `256` because reasoning models can consume the whole small budget before producing `message.content`.
- If the first response has empty `message.content`, non-empty `message.reasoning_content`, and `finish_reason: "length"`, the request is retried once with `max_tokens: 640` and lower temperature.
- `reasoning_content` is intentionally not shown as dialogue; only final assistant content or explicit `line`/`text` fields are displayed.

### 2026-06-18 Furniture Personality Context Note

- Furniture romance line requests now load and cache `src/_queries/system_prompt.txt`, matching the daily dialogue personality source.
- The furniture bubble prompt appends a short scene-specific constraint after the full character prompt: generate one concise romance line about the player-created furniture, without narration or reasoning.
- Dream furniture dialogue cooldown is now `20 * 1000` ms real time per furniture item.
- Eligible furniture visits now call the LLM with probability `0.8`; skipped or failed calls still use local fallback lines.

### 2026-06-18 Furniture Sitting Edge Note

- Bedroom bed and chair waypoints now include `sitCollider` metadata.
- `character.js` computes sitting pose from the nearest edge of the furniture collider instead of always backing up from the current waypoint.
- Sitting transition no longer teleports the character to the collider edge after turning. Waypoints are placed at the stable outside edge, and the collider edge only determines final hip position and outward-facing direction.
- The bed uses the open room-side edge as its sitting edge, avoiding wall/headboard side selection.
- The chair uses its front edge as the sitting edge.
- Bed/chair sitting waypoints remain semantic furniture anchors. `character.js` derives the actual walk target from `sitCollider`, placing it just outside the usable sitting edge so A* does not push the character away from an invalid in-collider point.
- The final hip target is pushed deeper onto the surface to avoid a too-forward, dangling posture.
- Furniture sitting routes append the computed sit-approach point as the final walking segment when A* simplifies to a nearby grid cell, so the character walks to the trigger point instead of sliding there during the sit animation.
- The bed hip inset is shallower than the chair inset so Fritia does not sit too deep on the bed.
- This avoids the old failure mode where path clipping or a waypoint inside the bed/chair collider caused Fritia to sit in midair near the furniture edge.

### 2026-06-18 Furniture Edit View-Axis Move Note

- Dream furniture object-control move buttons still move furniture only along world X/Z axes.
- During active furniture editing, forward/back/left/right are derived from the current camera horizontal look direction snapped to the nearest world X or Z axis.
- Long-press movement recomputes this mapping on each smooth movement tick, so rotating the view while editing immediately changes the button basis for the active furniture only.

### 2026-06-18 Dream Furniture LLM Revision Note

- `js/dream_llm.js` exports `requestDreamFurnitureRevision({ furniture, instruction, roomContext, settings })`.
- Style revision sends the current safe furniture JSON plus the player's natural-language request to the existing OpenAI-compatible `chat/completions` settings, and expects one complete replacement furniture spec JSON.
- The revised spec is still validated locally through `normalizeFurnitureSpec()`, `createFurnitureFromSpec()`, and `validateRuntimePlacement()`; LLM output is never executed.
- `dream_furniture_factory.js` now exposes `createFurnitureColliders(group)` for component-level dynamic colliders. Runtime keeps one whole-furniture AABB for UI projection, but player and character collision use the component collider list so revised furniture can gain or lose solid areas such as wall doorways.
- `character.js` exports `refreshCharacterNavigationData(cd, scope)`. Dream furniture changes update Fritia's active waypoints/colliders without a full room-scope reset, and invalidate the current walking path if it was planned through an area that is now blocked by revised furniture.
- `#dream-furniture-editor-panel` now contains `#dream-editor-style-instruction`, `#dream-editor-style-apply`, `#dream-editor-style-progress`, and `#dream-editor-style-progress-fill`.
- Style revision costs `100 数据金` only after the revised furniture preview is validated and deployed. While pending, `#dream-revision-confirm-bar` shows `#dream-revision-confirm` (`1`) and `#dream-revision-rollback` (`2`).
- Confirm keeps the preview. Rollback restores the previous spec and refunds `50 数据金` through `addMoney(..., 'dream_furniture_revision_refund')`.
- During pending revision confirmation, `isDreamRevisionPending()` blocks normal E/F interactions, hides normal interaction prompts, disables top/touch UI pointer events with `body.dream-revision-pending`, and `constrainPendingRevisionPlayer()` keeps the player inside dream-room bounds.
- Position auto-placement moved out of the edit overlay into `#dream-placement-editor-panel`, opened by `#dream-object-placement` in the object-control button cluster. `#dream-editor-placement` and `#dream-editor-auto-place` are now scoped to that placement overlay.
- `controls.js` overlay ids include `dream-placement-editor-panel`; `src/_logos/dream_gpt.svg` is the local GPT-style icon used for the placement button.

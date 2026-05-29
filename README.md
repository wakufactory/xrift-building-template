# xrift-building-template

`xrift-building-world` は、コードで書いた `BuildingPlan` から建物を生成する [XRift](https://xrift.net/) 用のtemplate です。部屋、ドア、窓、面ごとの色や material を plan として書くと、内部で box の instance 描画と Rapier collider に変換されます。

コンセプト的には、部屋のサイズを指定するだけで、壁や床を作ってくれて、窓やドアは相対座標で穴を開ける、というのがコード的に手軽にできるというものです。

BuildingPlanは建物構造とコライダーだけ作って、インテリアや装飾は別途componentを配置するという方針になります。

XRiftのテンプレートとしてワールドを作成する場合は、
```
xrift create  world -t wakufactory/xrift-building-template
```
で始められます。

plan を編集する主なファイルは `src/worldPlan.tsx` です。material の一覧は `src/worldMaterials.ts` にあります。

## plan の基本

`BuildingPlan` は建物全体の設定と、部屋の配列でできています。

```ts
import type { BuildingPlan } from './building'

export const myPlan: BuildingPlan = {
  unit: 1,
  floorHeight: 3,
  wallThickness: 0.2,
  slabThickness: 0.12,
  pillar: {
    thickness: 0.25,
  },
  roof: {
    overhang: 0.35,
    thickness: 0.16,
    heightOffset: 0,
    materialKey: 'roof:flat-concrete',
  },
  materialKeys: {
    room: {
      floor: 'floor:warm-wood',
      wall: 'wall:plaster',
      ceiling: 'ceiling:soft-white',
    },
    exteriorGround: 'ground:outdoor',
    pillar: 'pillar:concrete',
    roof: 'roof:flat-concrete',
  },
  rooms: [
    {
      id: 'room-a',
      position: [0, 0],
      size: [6, 4],
      doors: [
        { side: 'south', offset: 0, width: 1.4 },
      ],
      windows: [
        { side: 'north', offset: -1.5, width: 1.2 },
      ],
      ceilingOpenings: [
        { position: [0, 1], size: [2, 2] },
      ],
    },
  ],
}
```

## 屋根

`roof` を指定すると、plan 内の room 形状に合わせて平面屋根を生成します。L 字や張り出しのある平面では、最大外接矩形ではなく部屋矩形の合成範囲だけを非重複の矩形 roof に分割します。

```ts
roof: {
  overhang: 0.35,
  thickness: 0.16,
  heightOffset: 0,
  materialKey: 'roof:flat-concrete',
}
```

- `overhang` は各 room 矩形から外側へ張り出す量です。
- `thickness` は屋根 slab の厚みです。省略時は `slabThickness` を使います。
- `heightOffset` は `floorHeight` を基準に屋根位置を上下へずらす量です。`0` のとき屋根の中心が建物高さの上端に乗り、厚みの半分が上へはみ出します。正の値で上、負の値で下に移動します。
- `materialKey` を省略すると `materialKeys.roof`、それもなければ `materialKeys.room.ceiling` を使います。
- `roof: false` または未指定なら屋根は生成しません。

この plan を表示するには `BuildingWorld` に渡します。

```tsx
import { BuildingWorld } from './building'
import { worldBuildingMaterials } from './worldMaterials'

<BuildingWorld
  plan={myPlan}
  materials={worldBuildingMaterials}
  position={[0, 0, 0]}
/>
```

現在の `src/worldPlan.tsx` では `plan1` と `plan2` を作り、`Buildings()` の中で 2 つの `BuildingWorld` を別々の高さに配置しています。

## 座標と向き

plan の `position` と `size` は XZ 平面で指定します。

- `position: [x, z]` は部屋の中心です。
- `size: [width, depth]` は X 方向の幅と Z 方向の奥行きです。
- Y 方向の建物高さは `floorHeight` で決まります。床 slab は `0..slabThickness`、天井 slab は `floorHeight - slabThickness..floorHeight` に収まります。壁と柱は従来通り `0..floorHeight` です。

壁の向きは次の通りです。

| side | 方向 |
| --- | --- |
| `north` | `-Z` |
| `south` | `+Z` |
| `east` | `+X` |
| `west` | `-X` |

ドアや窓の `offset` は壁の中心からの距離です。

- `north` / `south` 壁では、正の `offset` は `+X` 方向です。
- `east` / `west` 壁では、正の `offset` は `north` 方向、つまり `-Z` 方向です。

## unit

`unit` は plan の寸法 1 単位を実座標で何単位にするかです。

```ts
export const plan: BuildingPlan = {
  unit: 0.5,
  floorHeight: 6,
  wallThickness: 0.4,
  slabThickness: 0.24,
  // ...
}
```

この例では、plan 上の `6` は実座標では `3` になります。`room.position`, `room.size`, `door/window` の `offset`, `width`, `height`, `bottom`、床/天井/屋根開口の `position`, `size`、床高、壁厚、床 slab、柱、外部地面の寸法がまとめてスケールされます。

## 部屋を書く

部屋は `rooms` に追加します。

```ts
{
  id: 'gallery',
  position: [0, 0],
  size: [8, 6],
}
```

隣り合う部屋は、境界がぴったり接するように置きます。

```ts
rooms: [
  {
    id: 'room-a',
    position: [0, 0],
    size: [6, 4],
  },
  {
    id: 'room-b',
    position: [6, 0],
    size: [6, 4],
  },
]
```

この例では `room-a` の east 側と `room-b` の west 側が接します。共有している壁は二重生成されず、`id` の辞書順で先の部屋が共有区間を持ちます。部屋サイズが違う場合も、共有している区間だけが抜かれ、余った壁は残ります。

## ドアと窓

ドアと窓は壁に開ける矩形です。

```ts
doors: [
  { side: 'south', offset: 0, width: 1.6, height: 2.2 },
],
windows: [
  { side: 'north', offset: -1.5, width: 1.2, bottom: 1.0, height: 1.1 },
],
```

省略時のデフォルトは次の通りです。

| 種類 | `bottom` | `height` |
| --- | ---: | ---: |
| door | `0` | `2.15` |
| window | `1.05` | `1.05` |

`width` と `offset` は必須です。開口が壁の外にはみ出す場合、壁と重なる範囲だけが引かれます。

## 床・天井・屋根の開口

床、天井、屋根にも room 単位で矩形開口を指定できます。`position` は部屋中心からの `[x, z]`、`size` は `[width, depth]` です。

```ts
ceilingOpenings: [
  { position: [0, 1], size: [2, 2] },
],
floorOpenings: [
  { position: [0, 1], size: [2, 2] },
],
roofOpenings: [
  { position: [0, 1], size: [2, 2] },
],
```

床と天井の開口が部屋の外にはみ出す場合、部屋と重なる範囲だけが引かれます。屋根の開口は room 基準の位置で roof だけから引かれ、`overhang` 部分も含む屋根形状との重なりだけが抜かれます。床、天井、屋根の開口は互いに独立しており、壁の `doors` / `windows` には影響しません。

## 面の色と material

床、壁、天井のデフォルト material は `materialKeys.room` で指定します。

```ts
materialKeys: {
  room: {
    floor: 'floor:warm-wood',
    wall: 'wall:plaster',
    ceiling: 'ceiling:soft-white',
  },
  exteriorGround: 'ground:outdoor',
  pillar: 'pillar:concrete',
}
```

部屋ごとに変える場合は `surfaces` を使います。

```ts
surfaces: {
  floor: { materialKey: 'floor:stone' },
  wall: { materialKey: 'wall:gallery-white' },
  ceiling: { hidden: true, noCollider: true },
}
```

壁ごとに変える場合は `surfaces.walls` を使います。`surfaces.wall` が全壁のデフォルトで、`surfaces.walls.north` などが個別壁の上書きです。

```ts
surfaces: {
  wall: { materialKey: 'wall:plaster' },
  walls: {
    north: { color: '#208020' },
    south: { color: '#dc7310' },
  },
}
```

`color` は instance color として使われます。同じ `materialKey` のまま色だけを変えられるので、material 数を増やさずに見た目を変えられます。

## 非表示と collider

`hidden` と `noCollider` で、描画と物理を別々に制御できます。

```ts
surfaces: {
  ceiling: { hidden: true, noCollider: true },
}
```

- `hidden: true` は描画しません。
- `noCollider: true` は collider を作りません。
- `hidden: true` だけなら、見えない壁や床として衝突だけ残ります。

## インテリア object の配置

床、天井、壁を基準に家具、額、照明などを置く場合は `getFloorPlacement()`、`getCeilingPlacement()`、`getWallPlacement()` を使います。どれも plan の `unit` を反映した `position` / `rotation` を返します。

```tsx
import { getCeilingPlacement, getFloorPlacement, getWallPlacement } from './building'

const sofa = getFloorPlacement(plan1, {
  roomId: '2-gallery',
  offset: [-2, 1],
  height: 0.35,
  rotationY: Math.PI / 2,
})

const lamp = getCeilingPlacement(plan1, {
  roomId: '2-gallery',
  offset: [0, 1],
  height: 0.2,
})

const frame = getWallPlacement(plan1, {
  roomId: '2-gallery',
  side: 'north',
  offset: 2,
  height: 1.6,
  inset: 0.04,
})

<group position={sofa.position} rotation={sofa.rotation}>
  {/* sofa mesh */}
</group>

<group position={lamp.position} rotation={lamp.rotation}>
  {/* ceiling-mounted mesh */}
</group>

<group position={frame.position} rotation={frame.rotation}>
  {/* wall-mounted mesh. local +Z faces into the room. */}
</group>
```

床と天井の `offset` は部屋中心からの `[x, z]` です。壁の `offset` はドアや窓と同じ壁ローカル座標で、`north` / `south` では `+X`、`east` / `west` では north 方向、つまり `-Z` が正です。床配置の `height` は床 slab 上面からの高さ、天井配置の `height` は天井 slab 下面から下方向への距離、壁配置の `height` は従来通り壁の下端からの高さです。`inset` は壁の室内面から部屋内側へずらす距離です。

children を直接囲んで配置したい場合は `RoomObject` / `CeilingObject` / `WallObject` を使います。

```tsx
import { BuildingWorld, CeilingObject, RoomObject, WallObject } from './building'

<BuildingWorld plan={plan1} materials={worldBuildingMaterials}>
  <RoomObject roomId="2-gallery" position={[-2, 1]} height={0.35} rotationY={Math.PI / 2}>
    {/* sofa mesh */}
  </RoomObject>

  <CeilingObject roomId="2-gallery" position={[0, 1]} height={0.2}>
    {/* ceiling-mounted mesh */}
  </CeilingObject>

  <WallObject roomId="2-gallery" side="north" offset={2} height={1.6} inset={0.04}>
    {/* wall-mounted mesh. local +Z faces into the room. */}
  </WallObject>
</BuildingWorld>
```

`RoomObject` / `CeilingObject` / `WallObject` は親の `BuildingWorld` から plan を受け取ります。`RoomObject` と `CeilingObject` の `position` は部屋中心からの `[x, z]` です。`WallObject` の `offset` は door/window と同じ壁ローカル offset です。

component ではなく transform だけ使いたい場合は、`BuildingWorld` の内側で `useFloorPlacement()` / `useCeilingPlacement()` / `useWallPlacement()` を使います。これも plan を直接渡さず、親の `BuildingWorld` から受け取ります。

```tsx
import { useWallPlacement } from './building'

function PictureFrame() {
  const frame = useWallPlacement({
    roomId: '2-gallery',
    side: 'north',
    offset: 2,
    height: 1.6,
    inset: 0.04,
  })

  return <group position={frame.position} rotation={frame.rotation}>{/* mesh */}</group>
}
```

## 外部地面

外部地面は、すべての部屋の外接範囲に余白を足した box として自動生成されます。

```ts
exteriorGround: {
  margin: 10,
  thickness: 0.12,
  materialKey: 'ground:outdoor',
}
```

不要な場合は `false` を指定します。

```ts
exteriorGround: false
```

未指定の場合は生成されます。`margin` のデフォルトは `14`、`thickness` のデフォルトは `slabThickness` です。

## 柱

各部屋の四隅には柱が生成されます。

```ts
pillar: {
  thickness: 0.25,
}
```

`pillar.thickness` を省略すると `wallThickness * 1.4` が使われます。柱の material は `materialKeys.pillar` で指定します。

隣接する部屋で同じ位置・同じサイズの柱が生成された場合、完全一致するものだけが自動で重複除去されます。

## material を追加する

material は `src/worldMaterials.ts` に追加します。

```ts
export const worldBuildingMaterials = {
  'wall:blue': {
    color: '#4f7ecb',
    roughness: 0.8,
    metalness: 0,
  },
}
```

texture を使う場合は `public/` 以下にファイルを置き、`texture.map` には `public/` からの相対パスを書きます。

```ts
'floor:tile': {
  color: '#ffffff',
  roughness: 0.85,
  texture: {
    map: 'textures/tile.png',
    tileSize: [1, 1],
    repeat: [4, 4],
    wrap: 'repeat',
  },
}
```

XRift 配信時の asset path に合わせるため、内部では `useXRift().baseUrl` と結合して読み込まれます。`/textures/tile.png` のように先頭 `/` を付けても取り除かれますが、plan では `textures/tile.png` の形に揃えるのが分かりやすいです。

`texture.tileSize` を指定すると、box の実寸に対して一定の大きさで texture を貼ります。`tileSize: [1, 1]` は、床・天井では X/Z 方向、東西壁では Z/Y 方向、南北壁では X/Y 方向に 1 world unit で 1 周期になります。`repeat` はその上に掛かる追加倍率です。`tileSize` を省略した texture は従来通り、unit box の UV と `repeat` だけで貼られます。

material key が catalog に存在しない場合は、ピンク色の fallback material が使われます。

## 建物以外の box を描画する

家具やエクステリアのような建物 plan に入れない box は、`BoxLayer` に `BoxInstance[]` と同じ material catalog を渡して描画できます。collider が必要な場合は `collider` prop を付けます。

`BoxBatchProvider` の配下に置くと、複数の `BuildingWorld` と直接置いた `BoxLayer` がまとめて描画されます。描画は material key ごとに 1 つの `InstancedMesh` になり、`source` でどの `BuildingWorld` / `BoxLayer` 由来かを区別できます。

```tsx
import { BoxBatchProvider, BoxLayer, type BoxInstance } from './building'
import { worldBuildingMaterials } from './worldMaterials'

const furniture: BoxInstance[] = [
  {
    id: 'bench',
    position: [4, 0.35, 2],
    size: [2.4, 0.7, 0.55],
    materialKey: 'furniture:neutral',
  },
]

export function Furniture() {
  return (
    <BoxBatchProvider>
      <BoxLayer
        id="furniture"
        parts={furniture}
        materials={worldBuildingMaterials}
        collider
      />
    </BoxBatchProvider>
  )
}
```

`BoxInstance.collider: false` を指定した box は、`BoxLayer collider` が有効でも collider を作りません。`BoxInstance.color` を指定すると、material key は共通のまま instance ごとに色だけ変えられます。統合後の mesh では `mesh.userData.boxInstances[instanceId]` に元の box id と `source` が入ります。

## 複数階や複数棟

現状の複数階は、複数の `BuildingWorld` を Y 方向にずらして配置する形です。

```tsx
export function Buildings() {
  return (
    <>
      <BuildingWorld
        plan={plan1}
        materials={worldBuildingMaterials}
        position={[0, 0, 0]}
      />
      <BuildingWorld
        plan={plan2}
        materials={worldBuildingMaterials}
        position={[0, 5.5, 0]}
      />
    </>
  )
}
```

`position` は `[x, y, z]` です。`scale` も指定できますが、寸法を一貫して管理したい場合は plan の `unit` を使う方が分かりやすいです。

## 確認方法

```bash
npm run dev
npm run typecheck
npm run build
```

`BuildingWorld` の `enableProfileLog` が true の場合、ブラウザ console に `[building profile]` が出ます。描画 instance 数、collider 数、material key ごとの数を確認できます。

## 実装メモ

内部構造の詳細は `src/building/architecture.md` を参照してください。

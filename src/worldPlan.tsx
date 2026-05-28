import { BuildingWorld, BoxBatchProvider, BoxLayer, RoomObject } from './building'
import type { BuildingPlan, BoxInstance, BoxPartColor, Vec2, Vec3 } from './building'
import { worldBuildingMaterials } from './worldMaterials'
import { Text } from '@react-three/drei'

//使用material
const materialKeys = {
  room: {
    floor: 'floor:warm-wood',
    wall: 'wall:plaster',
    ceiling: 'ceiling:soft-white',
  },
  exteriorGround: 'ground:outdoor',
  pillar: 'pillar:concrete',
  roof: 'roof:flat-concrete',
}

//一階間取りデータ
const courtyardPlan1:BuildingPlan= {
    unit: 1,
    floorHeight: 3.2,
    wallThickness: 0.18,
    slabThickness: 0.12,
    exteriorGround: {
      margin: 1.4,
      thickness: 0.16,
      materialKey: 'ground:outdoor',
    },
    pillar: {
      thickness: 0.26,
    },
    materialKeys,
    rooms: [
      {
        id: '1F-room',
        position: [0, 0],
        size: [6, 6],
        surfaces: {
          floor: { materialKey: 'floor:stone' },
          wall: { materialKey: 'wall:plaster' },
          walls: {
            south: { color:'#cfc7b8'},
            east: { color: '#d7d0c2'},
          },
        },
        doors: [
          { side: 'south', offset: 0.25, width: 1.2 , height: 2.2 },
        ],
        windows: [
         { side: 'north' as const, offset: 0, width: 2.35, bottom: 1, height: 1 },
          { side: 'east', offset: 2, width: 1.1, bottom: 1, height: 1 },
          { side: 'west', offset: -2, width: 1.1, bottom: 1, height: 1 },
        ],
        ceilingOpenings: [
            { position: [2., -2], size: [2, 2] },
        ],
      },
    ],
  }
//二階間取りデータ
const courtyardPlan2:BuildingPlan =  {
    unit: 1,
    floorHeight: 3,
    wallThickness: 0.18,
    slabThickness: 0.12,
    exteriorGround: false,
    pillar: {
      thickness: 0.26,
    },
    materialKeys,
    roof: {
      overhang: 0.25,
      thickness: 0.14,
      heightOffset: -0,
      materialKey: 'roof:flat-concrete',
    },
    rooms: [
      {
        id: '2F-room',
        position: [0, -1],
        size: [6, 4],
        surfaces: {
          floor: { materialKey: 'floor:warm-wood' },
          wall: { materialKey: 'wall:gallery-white' },
          walls: {
            south: { color: '#ece8dd' },
            west: { color: '#e3ded3' },
          },
        },
        windows: [
          { side: 'north', offset: -0.8 , width: 1.2, bottom: 0.9, height: 1 },
          { side: 'south', offset:  0., width: 3.25, bottom: 0.9, height: 1 },
          { side: 'east', offset: -0.55, width: 2, bottom: 1, height: 1 },
          { side: 'west', offset: 0.55, width: 2, bottom: 1, height: 1 },
        ],
        floorOpenings: [
            { position: [2., -2], size: [2, 2] },
        ],
      },
    ],
  }

//テーブル
function BoxFurniture({
  id,
  size,
  color,
}: {
  id: string
  size: Vec2
  color: BoxPartColor
}) {
  const parts: BoxInstance[] = [
    {
      id: `${id}-top`,
      position: [0, 0.75, 0],
      size: [size[0], 0.12, size[1]],
      materialKey: 'furniture:neutral',
      color,
    },
    {
      id: `${id}-base`,
      position: [0, 0.36, 0],
      size: [size[0] * 0.18, 0.72, size[1] * 0.18],
      materialKey: 'furniture:neutral',
      color,
    },
  ]
  return (
    <BoxLayer
      id={id}
      parts={parts}
      materials={worldBuildingMaterials}
      collider
    />
  )
}

//全体まとめ
export function SimpleBuilding({position=[0,0,0]}:{
  position?:Vec3
}) {
  return (
    <BoxBatchProvider>
      <group position={position}>
        //一階
        <BuildingWorld
          id="courtyard-floor-1"
          name="Courtyard 1F"
          plan={courtyardPlan1}
          materials={worldBuildingMaterials}
          position={[0, 0, 0]}
          enableProfileLog={true}
        >
          //部屋に椅子を配置
          <RoomObject roomId="1F-room" position={[-1.5, 1]} height={0.05}>
            <BoxFurniture id="atrium-table" size={[1.2, 1.5]} color="#9e735d" />
          </RoomObject>

        </BuildingWorld>
        //二階
        <BuildingWorld
          id="courtyard-floor-2"
          name="Courtyard 2F"
          plan={courtyardPlan2}
          materials={worldBuildingMaterials}
          position={[0, 3.2, 0]}
          enableProfileLog={true}
        >
        </BuildingWorld>
      //ラベル
      <Text
        position={[0, 3.5, 3]}
        fontSize={0.8}
        color="#161f3f"
        anchorX="center"
        anchorY="middle"
      >
        SimpleHouse
      </Text>
      </group>
    </BoxBatchProvider>
  )
}
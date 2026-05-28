import type { BoxMaterialCatalog } from './building'

export const worldBuildingMaterials = {
  'floor:warm-wood': {
    color: '#f4e5d8',
    roughness: 0.78,
    metalness: 0,
    texture: {
      map: 'textures/warm-wood.png',
      tileSize: [0.5, 0.5],
    },
  },
  'debug:measure-grid': {
    color: '#ffffff',
    roughness: 0.82,
    metalness: 0,
    texture: {
      map: 'textures/measure-grid.png',
      tileSize: [1, 1],
    },
  },
  'floor:stone': {
    color: '#747b7c',
    roughness: 0.9,
    metalness: 0,
  },
  'ground:outdoor': {
    color: '#7c8778',
    roughness: 0.92,
    metalness: 0,
  },
  'wall:plaster': {
    color: '#d7d0c2',
    roughness: 0.86,
    metalness: 0,
  },
  'wall:gallery-white': {
    color: '#ece8dd',
    roughness: 0.82,
    metalness: 0,
  },
  'wall:accent': {
    color: '#536b63',
    roughness: 0.75,
    metalness: 0,
  },
  'ceiling:soft-white': {
    color: '#f1eee6',
    roughness: 0.86,
    metalness: 0,
  },
  'roof:flat-concrete': {
    color: '#5f686c',
    roughness: 0.88,
    metalness: 0,
  },
  'trim:dark-metal': {
    color: '#2f3538',
    roughness: 0.45,
    metalness: 0.25,
  },
  'pillar:concrete': {
    color: '#9b9b91',
    roughness: 0.88,
    metalness: 0,
  },
  'furniture:neutral': {
    color: '#a8826f',
    roughness: 0.72,
    metalness: 0,
  },
} satisfies BoxMaterialCatalog

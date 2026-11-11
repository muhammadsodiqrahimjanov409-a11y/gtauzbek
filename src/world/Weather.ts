import * as THREE from 'three';
import type { Vec3, WeatherMode } from '../types/game';

export interface WeatherSystemHandle {
  group: THREE.Group;
  update: (
    dt: number,
    weather: WeatherMode,
    focusPos: Vec3,
    asphaltMat: THREE.MeshStandardMaterial,
    intersectionMat: THREE.MeshStandardMaterial,
  ) => void;
}

export function createWeatherSystem(rainDropCount = 900): WeatherSystemHandle {
  const group = new THREE.Group();

  // Line-segment rain streaks (2 vertices per drop)
  const positions = new Float32Array(rainDropCount * 6);
  const speeds = new Float32Array(rainDropCount);
  const spread = 68;
  const maxHeight = 36;

  for (let i = 0; i < rainDropCount; i++) {
    const x = (Math.random() - 0.5) * spread;
    const y = Math.random() * maxHeight;
    const z = (Math.random() - 0.5) * spread;
    const base = i * 6;
    positions[base] = x;
    positions[base + 1] = y;
    positions[base + 2] = z;
    positions[base + 3] = x - 0.15;
    positions[base + 4] = y - 1.35;
    positions[base + 5] = z - 0.1;
    speeds[i] = 26 + Math.random() * 10;
  }

  const rainGeo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(positions, 3);
  rainGeo.setAttribute('position', posAttr);

  const rainMat = new THREE.LineBasicMaterial({
    color: 0xcbd5e1,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
  });

  const rainLines = new THREE.LineSegments(rainGeo, rainMat);
  rainLines.frustumCulled = false;
  rainLines.visible = false;
  group.add(rainLines);

  const update: WeatherSystemHandle['update'] = (
    dt,
    weather,
    focusPos,
    asphaltMat,
    intersectionMat,
  ) => {
    const isRain = weather === 'rainy';
    rainLines.visible = isRain;

    // Adjust road wetness / specular sheen smoothly
    const targetRoughness = isRain ? 0.26 : weather === 'cloudy' ? 0.62 : 0.74;
    const targetMetalness = isRain ? 0.35 : 0.08;
    asphaltMat.roughness = THREE.MathUtils.damp(asphaltMat.roughness, targetRoughness, 3, dt);
    asphaltMat.metalness = THREE.MathUtils.damp(asphaltMat.metalness, targetMetalness, 3, dt);
    intersectionMat.roughness = asphaltMat.roughness;
    intersectionMat.metalness = asphaltMat.metalness;

    if (!isRain) return;

    rainLines.position.set(focusPos.x, 0, focusPos.z);
    const arr = posAttr.array as Float32Array;
    const halfSpread = spread * 0.5;

    for (let i = 0; i < rainDropCount; i++) {
      const base = i * 6;
      const fall = speeds[i] * dt;
      arr[base + 1] -= fall;
      arr[base + 4] -= fall;
      arr[base] -= 1.8 * dt;
      arr[base + 3] -= 1.8 * dt;

      if (arr[base + 4] < 0) {
        const nx = (Math.random() - 0.5) * spread;
        const ny = maxHeight + Math.random() * 4;
        const nz = (Math.random() - 0.5) * spread;
        arr[base] = nx;
        arr[base + 1] = ny;
        arr[base + 2] = nz;
        arr[base + 3] = nx - 0.15;
        arr[base + 4] = ny - 1.35;
        arr[base + 5] = nz - 0.1;
      } else if (arr[base] < -halfSpread) {
        arr[base] += spread;
        arr[base + 3] += spread;
      }
    }

    posAttr.needsUpdate = true;
  };

  return {
    group,
    update,
  };
}

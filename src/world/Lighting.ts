import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { GraphicsQuality, Vec3, WeatherMode } from '../types/game';
import { evaluateAtmosphereAtHour } from './DayNightCycle';

export interface LightingSystemHandle {
  sunLight: THREE.DirectionalLight;
  hemiLight: THREE.HemisphereLight;
  fog: THREE.FogExp2;
  envTexture: THREE.Texture;
  applyQuality: (quality: GraphicsQuality, shadowsEnabled: boolean, isSoftwareGl: boolean) => void;
  update: (
    timeHours: number,
    weather: WeatherMode,
    playerPos: Vec3,
    nightMaterials: THREE.MeshStandardMaterial[],
    lampBulbMaterial: THREE.MeshStandardMaterial,
  ) => boolean;
  dispose: () => void;
}

export function createLightingSystem(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  isSoftwareGl: boolean,
): LightingSystemHandle {
  // Mandatory studio PBR reflection environment map
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const envRenderTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
  const envTexture = envRenderTarget.texture;
  scene.environment = envTexture;
  pmremGenerator.dispose();

  const background = new THREE.Color('#60A5FA');
  scene.background = background;

  const fog = new THREE.FogExp2('#7DD3FC', 0.0012);
  scene.fog = fog;

  const hemiLight = new THREE.HemisphereLight(0xbae6fd, 0x1e293b, 0.78);
  hemiLight.position.set(0, 120, 0);
  scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight(0xfffbeb, 1.7);
  sunLight.position.set(75, 115, 65);
  sunLight.castShadow = !isSoftwareGl;
  sunLight.shadow.mapSize.set(1024, 1024);
  sunLight.shadow.camera.near = 5;
  sunLight.shadow.camera.far = 285;
  const shadowBounds = 98;
  sunLight.shadow.camera.left = -shadowBounds;
  sunLight.shadow.camera.right = shadowBounds;
  sunLight.shadow.camera.top = shadowBounds;
  sunLight.shadow.camera.bottom = -shadowBounds;
  sunLight.shadow.bias = -0.0005;
  sunLight.shadow.normalBias = 0.03;
  scene.add(sunLight);
  scene.add(sunLight.target);

  const applyQuality = (quality: GraphicsQuality, shadowsEnabled: boolean, softwareGl: boolean) => {
    const useShadows = shadowsEnabled && !softwareGl && quality !== 'low';
    renderer.shadowMap.enabled = useShadows;
    sunLight.castShadow = useShadows;

    const targetMapSize = quality === 'high' ? 1536 : 1024;
    if (useShadows && sunLight.shadow.mapSize.width !== targetMapSize) {
      sunLight.shadow.mapSize.set(targetMapSize, targetMapSize);
      sunLight.shadow.map?.dispose();
      sunLight.shadow.map = null;
    }

    const dprCap = softwareGl ? 1 : quality === 'low' ? 1 : quality === 'medium' ? 1.5 : 2;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
  };

  const overcastTint = new THREE.Color('#64748B');
  const rainNightTint = new THREE.Color('#0F172A');

  const update: LightingSystemHandle['update'] = (
    timeHours,
    weather,
    playerPos,
    nightMaterials,
    lampBulbMaterial,
  ) => {
    const sample = evaluateAtmosphereAtHour(timeHours);

    let weatherDim = 1.0;
    let fogDensity = 0.0011;
    if (weather === 'cloudy') {
      weatherDim = 0.72;
      fogDensity = 0.0019;
      sample.skyColor.lerp(overcastTint, sample.isNight ? 0.2 : 0.55);
      sample.fogColor.lerp(overcastTint, sample.isNight ? 0.25 : 0.6);
    } else if (weather === 'rainy') {
      weatherDim = 0.52;
      fogDensity = 0.003;
      sample.skyColor.lerp(sample.isNight ? rainNightTint : overcastTint, 0.72);
      sample.fogColor.lerp(sample.isNight ? rainNightTint : overcastTint, 0.75);
    }

    background.copy(sample.skyColor);
    fog.color.copy(sample.fogColor);
    fog.density = fogDensity;

    hemiLight.color.copy(sample.hemiSkyColor);
    hemiLight.groundColor.copy(sample.hemiGroundColor);
    hemiLight.intensity = sample.hemiIntensity * (weather === 'sunny' ? 1 : 0.9);

    sunLight.color.copy(sample.sunColor);
    sunLight.intensity = sample.sunIntensity * weatherDim;

    // Follow player so orthographic shadows stay crisp across wide boulevards
    sunLight.target.position.set(playerPos.x, 0, playerPos.z);
    sunLight.position.set(
      playerPos.x + sample.sunDirection.x * 110,
      sample.sunDirection.y * 125,
      playerPos.z + sample.sunDirection.z * 110,
    );

    const winEmissive = 0.06 + sample.nightGlowFactor * 1.15;
    for (let i = 0; i < nightMaterials.length; i++) {
      nightMaterials[i].emissiveIntensity = winEmissive;
    }
    lampBulbMaterial.emissiveIntensity = sample.nightGlowFactor > 0.25 ? 2.6 * sample.nightGlowFactor : 0.1;

    return sample.isNight || weather === 'rainy';
  };

  return {
    sunLight,
    hemiLight,
    fog,
    envTexture,
    applyQuality,
    update,
    dispose: () => {
      envRenderTarget.dispose();
    },
  };
}

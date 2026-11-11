import * as THREE from 'three';

export interface AtmosphereSample {
  skyColor: THREE.Color;
  fogColor: THREE.Color;
  sunColor: THREE.Color;
  hemiSkyColor: THREE.Color;
  hemiGroundColor: THREE.Color;
  sunIntensity: number;
  hemiIntensity: number;
  sunDirection: THREE.Vector3;
  isNight: boolean;
  nightGlowFactor: number;
}

const C_DAWN_SKY = new THREE.Color('#F59E0B').lerp(new THREE.Color('#38BDF8'), 0.45);
const C_DAY_SKY = new THREE.Color('#60A5FA');
const C_SUNSET_SKY = new THREE.Color('#EA580C').lerp(new THREE.Color('#4338CA'), 0.38);
const C_NIGHT_SKY = new THREE.Color('#090F1F');

const C_SUN_WARM = new THREE.Color('#FDBA74');
const C_SUN_NOON = new THREE.Color('#FFFBEB');
const C_MOON = new THREE.Color('#93C5FD');

const _sky = new THREE.Color();
const _fog = new THREE.Color();
const _sun = new THREE.Color();
const _hemiSky = new THREE.Color();
const _hemiGround = new THREE.Color('#1E293B');
const _sunDir = new THREE.Vector3();

export function evaluateAtmosphereAtHour(timeHours: number): AtmosphereSample {
  const h = ((timeHours % 24) + 24) % 24;

  // Compute solar elevation angle: sunrise ~6:00, noon 12:00, sunset ~18:30
  const dayAngle = ((h - 6) / 12.5) * Math.PI;
  const elevation = Math.sin(dayAngle);
  const azimuth = ((h / 24) * Math.PI * 2) - Math.PI * 0.5;

  let sunInt = 1.6;
  let hemiInt = 0.72;
  let nightFactor = 0;

  if (h >= 5 && h < 8) {
    // Dawn transition
    const t = (h - 5) / 3;
    _sky.copy(C_NIGHT_SKY).lerp(C_DAWN_SKY, Math.min(1, t * 1.4));
    if (t > 0.6) {
      _sky.lerp(C_DAY_SKY, (t - 0.6) / 0.4);
    }
    _sun.copy(C_SUN_WARM).lerp(C_SUN_NOON, t);
    sunInt = THREE.MathUtils.lerp(0.28, 1.55, t);
    hemiInt = THREE.MathUtils.lerp(0.32, 0.75, t);
    nightFactor = Math.max(0, 1 - t * 1.6);
  } else if (h >= 8 && h < 16.5) {
    // Crisp Daylight
    _sky.copy(C_DAY_SKY);
    _sun.copy(C_SUN_NOON);
    sunInt = 1.75;
    hemiInt = 0.8;
    nightFactor = 0;
  } else if (h >= 16.5 && h < 20) {
    // Golden Hour & Sunset
    const t = (h - 16.5) / 3.5;
    if (t < 0.55) {
      _sky.copy(C_DAY_SKY).lerp(C_SUNSET_SKY, t / 0.55);
    } else {
      _sky.copy(C_SUNSET_SKY).lerp(C_NIGHT_SKY, (t - 0.55) / 0.45);
    }
    _sun.copy(C_SUN_NOON).lerp(C_SUN_WARM, Math.min(1, t * 1.5));
    sunInt = THREE.MathUtils.lerp(1.65, 0.3, t);
    hemiInt = THREE.MathUtils.lerp(0.75, 0.34, t);
    nightFactor = Math.max(0, (t - 0.35) / 0.65);
  } else {
    // Night
    _sky.copy(C_NIGHT_SKY);
    _sun.copy(C_MOON);
    sunInt = 0.34;
    hemiInt = 0.32;
    nightFactor = 1.0;
  }

  _fog.copy(_sky).lerp(new THREE.Color('#94A3B8'), nightFactor > 0.5 ? 0.04 : 0.18);
  _hemiSky.copy(_sky).lerp(new THREE.Color('#E0F2FE'), nightFactor > 0.5 ? 0.08 : 0.35);

  const clampedY = elevation > 0.12 ? elevation : 0.48; // At night, moon sits cleanly overhead-angled
  _sunDir.set(Math.cos(azimuth) * 0.75, clampedY, Math.sin(azimuth) * 0.75).normalize();

  return {
    skyColor: _sky,
    fogColor: _fog,
    sunColor: _sun,
    hemiSkyColor: _hemiSky,
    hemiGroundColor: _hemiGround,
    sunIntensity: sunInt,
    hemiIntensity: hemiInt,
    sunDirection: _sunDir,
    isNight: nightFactor > 0.45,
    nightGlowFactor: nightFactor,
  };
}

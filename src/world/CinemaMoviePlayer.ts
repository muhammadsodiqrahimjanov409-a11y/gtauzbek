import * as THREE from 'three';

export const CINEMA_MOVIE_COUNT = 4;
const CINEMA_FRAME_INTERVAL = 1 / 24;

export interface CinemaProjectorRig {
  group: THREE.Group;
  reelA: THREE.Mesh;
  reelB: THREE.Mesh;
  lensGlowMat: THREE.MeshStandardMaterial;
  beamMat: THREE.MeshBasicMaterial;
}

export interface CinemaHallRuntime {
  buildingId: string;
  centerX: number;
  centerZ: number;
  movieIndex: number;
  customVideoTitle: string | null;
  customObjectUrl: string | null;
  paused: boolean;
  frameAccum: number;
  timeOffset: number;
  canvas: HTMLCanvasElement | null;
  ctx: CanvasRenderingContext2D | null;
  videoEl: HTMLVideoElement | null;
  posterImg: HTMLImageElement | null;
  posterReady: boolean;
  texture: THREE.Texture;
  screenMaterial: THREE.MeshStandardMaterial;
  stageBounceMaterial: THREE.MeshStandardMaterial;
  projector: CinemaProjectorRig;
}

interface RealCinemaMovieSpec {
  headerBadge: string;
  videoUrl: string;
  posterUrl: string;
  subtitlesUz: [string, string, string];
  tintColorsHex: [number, number, number];
}

const POSTER_SCIFI = new URL(
  '../assets/images/cinema_scifi_live_action_1793602944200.jpg',
  import.meta.url,
).href;
const POSTER_RALLY = new URL(
  '../assets/images/cinema_rally_supercars_1793602946386.jpg',
  import.meta.url,
).href;
const POSTER_DRAGON = new URL(
  '../assets/images/cinema_epic_fantasy_dragon_1793602947506.jpg',
  import.meta.url,
).href;
const POSTER_CYBER = new URL(
  '../assets/images/cinema_cyber_machine_world_1793602947990.jpg',
  import.meta.url,
).href;

export const REAL_CINEMA_MOVIES: RealCinemaMovieSpec[] = [
  {
    headerBadge: 'IMAX LASER · PO‘LAT KO‘Z YOSHLARI (LIVE SCI-FI)',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
    posterUrl: POSTER_SCIFI,
    subtitlesUz: [
      '«Ko‘prik ustidagi ilmiy guruh signalni qabul qilmoqda...»',
      '« Himoya gumbazi faollashdi — barcha tizimlar shay holatda!»',
      '«Kelajak xotirasi saqlab qolindi — yangi davr boshlanmoqda!»',
    ],
    tintColorsHex: [0x38bdf8, 0x2dd4bf, 0xf59e0b],
  },
  {
    headerBadge: 'DOLBY ATMOS · SUPERKARLAR RALLISI (LIVE)',
    videoUrl:
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4',
    posterUrl: POSTER_RALLY,
    subtitlesUz: [
      '«Dvigatellar o‘t oldi — tog‘ dovoni bo‘ylab superkarlar poygasi!»',
      '«Har bir burilishda yuqori tezlik va mahorat sinovi!»',
      '«Marra chizig‘i yaqin — chempionlar karvoni oldinda!»',
    ],
    tintColorsHex: [0xf43f5e, 0xf59e0b, 0x38bdf8],
  },
  {
    headerBadge: 'PREMYERA 4K · SINTEL: AJDARHO AFSONASI',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
    posterUrl: POSTER_DRAGON,
    subtitlesUz: [
      '«Qorli cho‘qqilar ortida qadimiy ajdarho makoni yashiringan...»',
      '«Do‘stlik va jasorat olovli sinovdan o‘tmoqda!»',
      '«Qanotlar osmonga yozildi — afsona davom etadi!»',
    ],
    tintColorsHex: [0xf97316, 0x60a5fa, 0x34d399],
  },
  {
    headerBadge: 'CYBER HALL · MASHINALAR OLAMI (ELEPHANTS DREAM)',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
    posterUrl: POSTER_CYBER,
    subtitlesUz: [
      '«Cheksiz mexanizmlar labirintiga xush kelibsiz...»',
      '«Har bir tishli g‘ildirak va kabel tirik tizimning bir qismi!»',
      '«Markaziy reaktor uyg‘ondi — haqiqat chegarasi ochildi!»',
    ],
    tintColorsHex: [0xc084fc, 0x22d3ee, 0xf472b6],
  },
];

const _scratchTint = new THREE.Color();

function formatTimecode(sec: number): string {
  const safe = Number.isFinite(sec) && sec >= 0 ? sec : 0;
  const s = Math.floor(safe % 60);
  const m = Math.floor(safe / 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function loadHallSource(hall: CinemaHallRuntime): void {
  const movieIdx = ((hall.movieIndex % CINEMA_MOVIE_COUNT) + CINEMA_MOVIE_COUNT) % CINEMA_MOVIE_COUNT;
  const spec = REAL_CINEMA_MOVIES[movieIdx];

  if (typeof Image !== 'undefined') {
    hall.posterReady = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      hall.posterReady = true;
    };
    img.src = spec.posterUrl;
    hall.posterImg = img;
  }

  if (hall.videoEl) {
    const srcToPlay = hall.customObjectUrl ?? spec.videoUrl;
    if (hall.videoEl.src !== srcToPlay) {
      hall.videoEl.src = srcToPlay;
      hall.videoEl.load();
    }
    hall.videoEl.muted = true;
    if (!hall.paused) {
      hall.videoEl.play().catch(() => {
        // Autoplay fallback stays silent until user interaction
      });
    }
  }
}

export function renderCinemaMovieFrame(hall: CinemaHallRuntime, elapsed: number): number {
  const ctx = hall.ctx;
  const movieIdx = ((hall.movieIndex % CINEMA_MOVIE_COUNT) + CINEMA_MOVIE_COUNT) % CINEMA_MOVIE_COUNT;
  const spec = REAL_CINEMA_MOVIES[movieIdx];

  const vid = hall.videoEl;
  const hasLiveVideo =
    Boolean(vid) && vid!.readyState >= 2 && vid!.videoWidth > 0 && vid!.videoHeight > 0;
  const curTime = hasLiveVideo ? vid!.currentTime : (elapsed + hall.timeOffset) % 180;
  const totalDur =
    hasLiveVideo && Number.isFinite(vid!.duration) && vid!.duration > 1 ? vid!.duration : 180;
  const act = Math.floor((curTime / 9) % 3) as 0 | 1 | 2;

  if (ctx && hall.canvas) {
    const W = hall.canvas.width;
    const H = hall.canvas.height;
    const topBar = 34;
    const botBar = 44;
    const frameH = H - topBar - botBar;

    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, W, H);

    if (hasLiveVideo && vid) {
      try {
        ctx.drawImage(vid, 0, topBar, W, frameH);
      } catch {
        // Fallback if cross-origin frame not yet decoded
      }
    } else if (hall.posterReady && hall.posterImg) {
      // Smooth cinematic Ken Burns camera pan across the photorealistic 16:9 film frame while buffering
      const zoom = 1.06 + Math.sin(elapsed * 0.35 + hall.timeOffset) * 0.04;
      const panX = Math.cos(elapsed * 0.28 + hall.timeOffset) * 18;
      const panY = Math.sin(elapsed * 0.22 + hall.timeOffset) * 10;
      const dw = W * zoom;
      const dh = frameH * zoom;
      const dx = (W - dw) * 0.5 + panX;
      const dy = topBar + (frameH - dh) * 0.5 + panY;
      ctx.drawImage(hall.posterImg, dx, dy, dw, dh);
    } else {
      const grad = ctx.createLinearGradient(0, topBar, W, topBar + frameH);
      grad.addColorStop(0, '#0f172a');
      grad.addColorStop(0.5, '#1e293b');
      grad.addColorStop(1, '#020617');
      ctx.fillStyle = grad;
      ctx.fillRect(0, topBar, W, frameH);
    }

    // Widescreen Letterbox Matte Bars (Top & Bottom)
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, W, topBar);
    ctx.fillRect(0, H - botBar, W, botBar);

    // Header Title + Real Timecode
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'left';
    const headerTitle = hall.customVideoTitle
      ? `SHAXSIY KINO · ${hall.customVideoTitle.toUpperCase()}`
      : spec.headerBadge;
    ctx.fillText(headerTitle.slice(0, 56), 18, 22);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(`${formatTimecode(curTime)} / ${formatTimecode(totalDur)}`, W - 18, 22);

    // Bottom Subtitle Caption
    if (!hall.customVideoTitle) {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText(spec.subtitlesUz[act], W * 0.5, H - 14);
    } else {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 15px sans-serif';
      ctx.fillText(hall.paused ? 'PAUZA' : 'NAMOYISHDA — REAL VIDEO', W * 0.5, H - 14);
    }

    // Progress Bar along bottom matte seam
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(18, H - botBar + 2, W - 36, 4);
    ctx.fillStyle = '#f59e0b';
    const ratio = Math.max(0.01, Math.min(1, curTime / Math.max(1, totalDur)));
    ctx.fillRect(18, H - botBar + 2, (W - 36) * ratio, 4);

    hall.texture.needsUpdate = true;
  }

  return spec.tintColorsHex[act];
}

export function buildCinemaProjectorRig(
  ceilingHeight: number,
  halfDepth: number,
  screenCenterY: number,
): CinemaProjectorRig {
  const group = new THREE.Group();
  const projY = ceilingHeight - 0.88;
  const projZ = halfDepth - 3.6;
  group.position.set(0, projY, projZ);

  const housingMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.34,
    metalness: 0.78,
  });
  const metalTrimMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    roughness: 0.22,
    metalness: 0.88,
  });
  const lensGlowMat = new THREE.MeshStandardMaterial({
    color: 0xe0f2fe,
    emissive: 0x38bdf8,
    emissiveIntensity: 1.35,
    roughness: 0.1,
  });

  const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.75, 10), metalTrimMat);
  strut.position.y = 0.42;
  group.add(strut);

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.56, 1.45), housingMat);
  group.add(body);

  const reelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.1, 16);
  reelGeo.rotateZ(Math.PI * 0.5);
  const reelA = new THREE.Mesh(reelGeo, metalTrimMat);
  reelA.position.set(0, 0.48, -0.28);
  const reelB = new THREE.Mesh(reelGeo, metalTrimMat);
  reelB.position.set(0, 0.48, 0.36);
  group.add(reelA, reelB);

  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.22, 0.46, 14).rotateX(Math.PI * 0.5),
    metalTrimMat,
  );
  barrel.position.set(0, -0.04, -0.92);
  const lensGlass = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.16, 0.06, 14).rotateX(Math.PI * 0.5),
    lensGlowMat,
  );
  lensGlass.position.set(0, -0.04, -1.16);
  group.add(barrel, lensGlass);

  const targetLocalY = screenCenterY - projY;
  const targetLocalZ = -halfDepth + 0.85 - projZ;
  const beamLength = Math.hypot(targetLocalY, targetLocalZ) - 1.25;
  const pitchAngle = Math.atan2(targetLocalY, -targetLocalZ);

  const beamMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.085,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });

  const beamGeo = new THREE.CylinderGeometry(0.18, 2.35, Math.max(4, beamLength), 16, 1, true);
  beamGeo.translate(0, -Math.max(4, beamLength) * 0.5, 0);
  beamGeo.rotateX(Math.PI * 0.5 - pitchAngle);

  const beamMesh = new THREE.Mesh(beamGeo, beamMat);
  beamMesh.position.set(0, -0.04, -1.18);
  beamMesh.renderOrder = 4;
  group.add(beamMesh);

  return {
    group,
    reelA,
    reelB,
    lensGlowMat,
    beamMat,
  };
}

export function createCinemaHallRuntime(
  buildingId: string,
  centerX: number,
  centerZ: number,
  initialMovieIndex: number,
  ceilingHeight: number,
  halfDepth: number,
  screenCenterY: number,
  stageBounceMaterial: THREE.MeshStandardMaterial,
): CinemaHallRuntime {
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let videoEl: HTMLVideoElement | null = null;
  let texture: THREE.Texture;

  if (typeof document !== 'undefined') {
    canvas = document.createElement('canvas');
    canvas.width = 854;
    canvas.height = 480;
    ctx = canvas.getContext('2d');

    const ct = new THREE.CanvasTexture(canvas);
    ct.colorSpace = THREE.SRGBColorSpace;
    ct.generateMipmaps = false;
    ct.minFilter = THREE.LinearFilter;
    ct.magFilter = THREE.LinearFilter;
    texture = ct;

    videoEl = document.createElement('video');
    videoEl.crossOrigin = 'anonymous';
    videoEl.loop = true;
    videoEl.muted = true;
    videoEl.playsInline = true;
    videoEl.preload = 'metadata';
  } else {
    const dt = new THREE.DataTexture(new Uint8Array([15, 23, 42, 255]), 1, 1);
    dt.needsUpdate = true;
    texture = dt;
  }

  const screenMaterial = new THREE.MeshStandardMaterial({
    map: texture,
    emissive: 0xffffff,
    emissiveMap: texture,
    emissiveIntensity: 1.02,
    roughness: 0.14,
  });

  const projector = buildCinemaProjectorRig(ceilingHeight, halfDepth, screenCenterY);

  const hall: CinemaHallRuntime = {
    buildingId,
    centerX,
    centerZ,
    movieIndex: initialMovieIndex % CINEMA_MOVIE_COUNT,
    customVideoTitle: null,
    customObjectUrl: null,
    paused: false,
    frameAccum: CINEMA_FRAME_INTERVAL,
    timeOffset: initialMovieIndex * 11.5,
    canvas,
    ctx,
    videoEl,
    posterImg: null,
    posterReady: false,
    texture,
    screenMaterial,
    stageBounceMaterial,
    projector,
  };

  loadHallSource(hall);
  const initHex = renderCinemaMovieFrame(hall, 0);
  _scratchTint.setHex(initHex);
  hall.projector.beamMat.color.copy(_scratchTint);
  hall.projector.lensGlowMat.emissive.copy(_scratchTint);
  hall.stageBounceMaterial.color.copy(_scratchTint);
  hall.stageBounceMaterial.emissive.copy(_scratchTint);

  return hall;
}

export function setCinemaHallMovieIndex(hall: CinemaHallRuntime, nextIndex: number): number {
  hall.movieIndex = ((nextIndex % CINEMA_MOVIE_COUNT) + CINEMA_MOVIE_COUNT) % CINEMA_MOVIE_COUNT;
  if (hall.customObjectUrl && typeof URL !== 'undefined') {
    URL.revokeObjectURL(hall.customObjectUrl);
  }
  hall.customObjectUrl = null;
  hall.customVideoTitle = null;
  hall.paused = false;
  hall.timeOffset = 0;
  loadHallSource(hall);
  renderCinemaMovieFrame(hall, 0);
  return hall.movieIndex;
}

export function setCinemaHallCustomVideo(
  hall: CinemaHallRuntime,
  objectUrl: string,
  fileName: string,
): void {
  if (hall.customObjectUrl && hall.customObjectUrl !== objectUrl && typeof URL !== 'undefined') {
    URL.revokeObjectURL(hall.customObjectUrl);
  }
  hall.customObjectUrl = objectUrl;
  hall.customVideoTitle = fileName;
  hall.paused = false;
  loadHallSource(hall);
  renderCinemaMovieFrame(hall, 0);
}

export function toggleCinemaHallPlayPause(hall: CinemaHallRuntime): boolean {
  hall.paused = !hall.paused;
  if (hall.videoEl) {
    if (hall.paused) {
      hall.videoEl.pause();
    } else {
      hall.videoEl.play().catch(() => {});
    }
  }
  return hall.paused;
}

export function disposeCinemaHallRuntime(hall: CinemaHallRuntime): void {
  if (hall.videoEl) {
    hall.videoEl.pause();
    hall.videoEl.removeAttribute('src');
    hall.videoEl.load();
  }
  if (hall.customObjectUrl && typeof URL !== 'undefined') {
    URL.revokeObjectURL(hall.customObjectUrl);
    hall.customObjectUrl = null;
  }
  hall.texture.dispose();
}

export function stepCinemaHallRuntime(
  hall: CinemaHallRuntime,
  dt: number,
  elapsed: number,
  viewerPos?: { x: number; z: number },
  isPlayerInsideThisHall = false,
  audioGain = 0,
): void {
  if (!hall.paused) {
    hall.projector.reelA.rotation.x += dt * 1.85;
    hall.projector.reelB.rotation.x += dt * 1.85;
  }

  let distSq = 0;
  if (viewerPos) {
    const dx = viewerPos.x - hall.centerX;
    const dz = viewerPos.z - hall.centerZ;
    distSq = dx * dx + dz * dz;
  }

  // Manage HTML5 <video> lifecycle & real indoor soundtrack audio
  if (hall.videoEl) {
    if (distSq > 165 * 165) {
      if (!hall.videoEl.paused) {
        hall.videoEl.pause();
      }
      hall.videoEl.muted = true;
      return;
    }

    if (!hall.paused && hall.videoEl.paused) {
      hall.videoEl.play().catch(() => {});
    }

    if (isPlayerInsideThisHall && !hall.paused && audioGain > 0.01) {
      hall.videoEl.volume = Math.max(0, Math.min(1, audioGain));
      if (hall.videoEl.muted) {
        hall.videoEl.muted = false;
      }
    } else if (!hall.videoEl.muted) {
      hall.videoEl.muted = true;
    }
  } else if (distSq > 165 * 165) {
    return;
  }

  hall.frameAccum += dt;
  if (hall.frameAccum >= CINEMA_FRAME_INTERVAL) {
    hall.frameAccum = hall.frameAccum % CINEMA_FRAME_INTERVAL;
    const tintHex = renderCinemaMovieFrame(hall, elapsed);
    _scratchTint.setHex(tintHex);
    hall.projector.beamMat.color.lerp(_scratchTint, 0.22);
    hall.projector.lensGlowMat.emissive.lerp(_scratchTint, 0.25);
    hall.stageBounceMaterial.color.lerp(_scratchTint, 0.22);
    hall.stageBounceMaterial.emissive.lerp(_scratchTint, 0.22);
  }

  const flicker = Math.sin(elapsed * 19.0 + hall.timeOffset) * 0.03;
  hall.screenMaterial.emissiveIntensity = 1.02 + flicker;
  hall.projector.beamMat.opacity = 0.085 + flicker * 0.35;
}

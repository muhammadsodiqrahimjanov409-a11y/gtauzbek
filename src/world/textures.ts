import * as THREE from 'three';

export interface ProceduralTextureSet {
  roadStraight: THREE.CanvasTexture;
  roadIntersection: THREE.CanvasTexture;
  sidewalk: THREE.CanvasTexture;
  officeFacade: THREE.CanvasTexture;
  officeEmissive: THREE.CanvasTexture;
  residentialFacade: THREE.CanvasTexture;
  residentialEmissive: THREE.CanvasTexture;
  grass: THREE.CanvasTexture;
  parkingBay: THREE.CanvasTexture;
  dispose: () => void;
}

function finalizeColorTexture(
  canvas: HTMLCanvasElement,
  maxAnisotropy: number,
  repeatX = 1,
  repeatY = 1,
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function createCityTextures(renderer: THREE.WebGLRenderer): ProceduralTextureSet {
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy() || 1);

  // 1. 6-Lane Grand Boulevard Asphalt Texture (34m wide: 3 wide lanes per direction + double amber median + concrete shoulders)
  const roadCanvas = document.createElement('canvas');
  roadCanvas.width = 512;
  roadCanvas.height = 512;
  const rctx = roadCanvas.getContext('2d')!;
  rctx.fillStyle = '#232730';
  rctx.fillRect(0, 0, 512, 512);

  // Subtle asphalt aggregate grain
  for (let i = 0; i < 4200; i++) {
    const shade = 29 + Math.floor(Math.random() * 22);
    rctx.fillStyle = `rgb(${shade},${shade + 2},${shade + 5})`;
    rctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
  }

  // Outer raised curb shoulders & white edge lines
  rctx.fillStyle = '#64748B';
  rctx.fillRect(0, 0, 12, 512);
  rctx.fillRect(500, 0, 12, 512);
  rctx.fillStyle = '#CBD5E1';
  rctx.fillRect(16, 0, 4, 512);
  rctx.fillRect(492, 0, 4, 512);

  // Center median dark rumble strip + double amber divider
  rctx.fillStyle = '#1B1F27';
  rctx.fillRect(246, 0, 20, 512);
  rctx.fillStyle = '#F59E0B';
  rctx.fillRect(249, 0, 4, 512);
  rctx.fillRect(259, 0, 4, 512);

  // 2 dashed lane dividers on each side -> 3 spacious lanes per direction (6 lanes total!)
  rctx.fillStyle = '#E2E8F0';
  const laneDividerX = [94, 172, 336, 414];
  for (let y = 18; y < 512; y += 96) {
    for (const lx of laneDividerX) {
      rctx.fillRect(lx, y, 4, 50);
    }
  }
  const roadStraight = finalizeColorTexture(roadCanvas, maxAniso, 1, 1);

  // 2. Wide Grand Intersection Crosswalk Texture (34m x 34m)
  const interCanvas = document.createElement('canvas');
  interCanvas.width = 512;
  interCanvas.height = 512;
  const ictx = interCanvas.getContext('2d')!;
  ictx.fillStyle = '#232730';
  ictx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 3200; i++) {
    const shade = 30 + Math.floor(Math.random() * 18);
    ictx.fillStyle = `rgb(${shade},${shade + 2},${shade + 5})`;
    ictx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
  }

  // Stop lines & wide 6-lane zebra crosswalks on all 4 approaches
  ictx.fillStyle = '#E2E8F0';
  ictx.fillRect(28, 48, 456, 4);
  ictx.fillRect(28, 460, 456, 4);
  ictx.fillRect(48, 28, 4, 456);
  ictx.fillRect(460, 28, 4, 456);

  ictx.fillStyle = '#CBD5E1';
  for (let s = 32; s <= 468; s += 24) {
    ictx.fillRect(s, 10, 12, 32);
    ictx.fillRect(s, 470, 12, 32);
    ictx.fillRect(10, s, 32, 12);
    ictx.fillRect(470, s, 32, 12);
  }
  const roadIntersection = finalizeColorTexture(interCanvas, maxAniso, 1, 1);

  // 3. Concrete Sidewalk Promenade Tiles
  const swCanvas = document.createElement('canvas');
  swCanvas.width = 128;
  swCanvas.height = 128;
  const sctx = swCanvas.getContext('2d')!;
  sctx.fillStyle = '#94A3B8';
  sctx.fillRect(0, 0, 128, 128);
  sctx.strokeStyle = '#64748B';
  sctx.lineWidth = 2;
  for (let x = 0; x <= 128; x += 32) {
    sctx.beginPath();
    sctx.moveTo(x, 0);
    sctx.lineTo(x, 128);
    sctx.stroke();
  }
  for (let y = 0; y <= 128; y += 32) {
    sctx.beginPath();
    sctx.moveTo(0, y);
    sctx.lineTo(128, y);
    sctx.stroke();
  }
  const sidewalk = finalizeColorTexture(swCanvas, maxAniso, 40, 40);

  // 4. Skyscraper Glass Facade + Night Emissive Map
  const offCanvas = document.createElement('canvas');
  offCanvas.width = 256;
  offCanvas.height = 512;
  const octx = offCanvas.getContext('2d')!;

  const offEmCanvas = document.createElement('canvas');
  offEmCanvas.width = 256;
  offEmCanvas.height = 512;
  const oectx = offEmCanvas.getContext('2d')!;

  octx.fillStyle = '#1E293B';
  octx.fillRect(0, 0, 256, 512);
  oectx.fillStyle = '#000000';
  oectx.fillRect(0, 0, 256, 512);

  const cols = 8;
  const rows = 20;
  const cw = 256 / cols;
  const rh = 512 / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lit = (r * 13 + c * 7) % 5 === 0 || (r * 3 + c * 11) % 7 === 0;
      octx.fillStyle = lit ? '#475569' : '#0F172A';
      octx.fillRect(c * cw + 4, r * rh + 4, cw - 8, rh - 8);

      if (lit) {
        const warm = (r + c) % 3 === 0;
        oectx.fillStyle = warm ? '#FDE68A' : '#BAE6FD';
        oectx.fillRect(c * cw + 5, r * rh + 5, cw - 10, rh - 10);
      }
    }
  }
  const officeFacade = finalizeColorTexture(offCanvas, maxAniso, 1, 1);
  const officeEmissive = finalizeColorTexture(offEmCanvas, maxAniso, 1, 1);

  // 5. Residential Facade + Night Emissive
  const resCanvas = document.createElement('canvas');
  resCanvas.width = 256;
  resCanvas.height = 256;
  const rc = resCanvas.getContext('2d')!;

  const resEmCanvas = document.createElement('canvas');
  resEmCanvas.width = 256;
  resEmCanvas.height = 256;
  const rec = resEmCanvas.getContext('2d')!;

  rc.fillStyle = '#CBD5E1';
  rc.fillRect(0, 0, 256, 256);
  rec.fillStyle = '#000000';
  rec.fillRect(0, 0, 256, 256);

  for (let r = 0; r < 6; r++) {
    rc.fillStyle = '#94A3B8';
    rc.fillRect(0, r * 42, 256, 3);
    for (let c = 0; c < 6; c++) {
      const lit = (r * 5 + c * 9) % 4 === 0;
      rc.fillStyle = '#1E293B';
      rc.fillRect(c * 42 + 9, r * 42 + 9, 24, 24);
      if (lit) {
        rec.fillStyle = '#FCD34D';
        rec.fillRect(c * 42 + 11, r * 42 + 11, 20, 20);
      }
    }
  }
  const residentialFacade = finalizeColorTexture(resCanvas, maxAniso, 1, 1);
  const residentialEmissive = finalizeColorTexture(resEmCanvas, maxAniso, 1, 1);

  // 6. Lush Grass Texture
  const grassCanvas = document.createElement('canvas');
  grassCanvas.width = 128;
  grassCanvas.height = 128;
  const gctx = grassCanvas.getContext('2d')!;
  gctx.fillStyle = '#2F6F44';
  gctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 900; i++) {
    gctx.fillStyle = i % 2 === 0 ? '#388050' : '#255D38';
    gctx.fillRect(Math.random() * 128, Math.random() * 128, 3, 3);
  }
  const grass = finalizeColorTexture(grassCanvas, maxAniso, 32, 32);

  // 7. Marked Precision Parking Bay
  const parkBayCanvas = document.createElement('canvas');
  parkBayCanvas.width = 256;
  parkBayCanvas.height = 256;
  const pctx = parkBayCanvas.getContext('2d')!;
  pctx.fillStyle = '#1E293B';
  pctx.fillRect(0, 0, 256, 256);
  pctx.strokeStyle = '#F59E0B';
  pctx.lineWidth = 14;
  pctx.strokeRect(16, 16, 224, 224);
  pctx.fillStyle = '#F59E0B';
  pctx.font = 'bold 72px sans-serif';
  pctx.textAlign = 'center';
  pctx.textBaseline = 'middle';
  pctx.fillText('P', 128, 128);
  const parkingBay = finalizeColorTexture(parkBayCanvas, maxAniso, 1, 1);

  return {
    roadStraight,
    roadIntersection,
    sidewalk,
    officeFacade,
    officeEmissive,
    residentialFacade,
    residentialEmissive,
    grass,
    parkingBay,
    dispose: () => {
      roadStraight.dispose();
      roadIntersection.dispose();
      sidewalk.dispose();
      officeFacade.dispose();
      officeEmissive.dispose();
      residentialFacade.dispose();
      residentialEmissive.dispose();
      grass.dispose();
      parkingBay.dispose();
    },
  };
}

import * as THREE from 'three';
import type { WeaponId } from '../types/game';

export interface HumanoidRig {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  leftArmPivot: THREE.Group;
  rightArmPivot: THREE.Group;
  weaponMount: THREE.Group;
  leftLegPivot: THREE.Group;
  rightLegPivot: THREE.Group;
  headGroup: THREE.Group;
  setColor: (jacketHex: number, pantsHex?: number) => void;
  animate: (
    dt: number,
    speed: number,
    isSprinting: boolean,
    isGrounded: boolean,
    equippedWeapon?: WeaponId,
    actionTimer?: number,
  ) => void;
}

export function createProceduralHumanoid(
  jacketHex = 0x1d4ed8,
  pantsHex = 0x1e293b,
  skinHex = 0xf1c27d,
  castShadow = true,
): HumanoidRig {
  const root = new THREE.Group();

  // Soft Ground Contact Shadow Plane (prevents floating appearance)
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 64;
  shadowCanvas.height = 64;
  const sctx = shadowCanvas.getContext('2d')!;
  const grad = sctx.createRadialGradient(32, 32, 4, 32, 32, 30);
  grad.addColorStop(0, 'rgba(0,0,0,0.52)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  sctx.fillStyle = grad;
  sctx.fillRect(0, 0, 64, 64);
  const shadowTex = new THREE.CanvasTexture(shadowCanvas);

  const contactShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.15, 1.15).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
    }),
  );
  contactShadow.position.y = 0.045;
  root.add(contactShadow);

  const jacketMat = new THREE.MeshStandardMaterial({
    color: jacketHex,
    roughness: 0.55,
    metalness: 0.12,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    roughness: 0.3,
    metalness: 0.45,
  });
  const pantsMat = new THREE.MeshStandardMaterial({
    color: pantsHex,
    roughness: 0.78,
    metalness: 0.05,
  });
  const skinMat = new THREE.MeshStandardMaterial({
    color: skinHex,
    roughness: 0.65,
    metalness: 0.02,
  });
  const shoeMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.5,
    metalness: 0.2,
  });
  const hairMat = new THREE.MeshStandardMaterial({
    color: 0x1c1917,
    roughness: 0.85,
  });

  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  // Pelvis
  const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.2, 0.25), pantsMat);
  pelvis.position.y = 0.86;
  pelvis.castShadow = castShadow;
  bodyGroup.add(pelvis);

  // Torso Jacket
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.54, 0.28), jacketMat);
  torso.position.y = 1.22;
  torso.castShadow = castShadow;
  bodyGroup.add(torso);

  // Chest Stripe Accent
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.07, 0.29), trimMat);
  stripe.position.y = 1.32;
  bodyGroup.add(stripe);

  // Head + Hair + Visor
  const headGroup = new THREE.Group();
  headGroup.position.y = 1.56;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 0.3), skinMat);
  head.position.y = 0.16;
  head.castShadow = castShadow;
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.32), hairMat);
  hair.position.set(0, 0.3, -0.01);
  const shades = new THREE.Mesh(
    new THREE.BoxGeometry(0.26, 0.065, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.15, metalness: 0.8 }),
  );
  shades.position.set(0, 0.18, 0.145);
  headGroup.add(head, hair, shades);
  bodyGroup.add(headGroup);

  // Left & Right Arms (Note: in +Z forward humanoid space, left is +X and right is -X, or vice versa)
  const makeArm = (side: -1 | 1): THREE.Group => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.32, 1.44, 0);
    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.42, 0.16), jacketMat);
    sleeve.position.y = -0.2;
    sleeve.castShadow = castShadow;
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.13), skinMat);
    hand.position.y = -0.45;
    pivot.add(sleeve, hand);
    return pivot;
  };
  const leftArmPivot = makeArm(1);
  const rightArmPivot = makeArm(-1);
  bodyGroup.add(leftArmPivot, rightArmPivot);

  // Right-hand Weapon Attachment Socket
  const weaponMount = new THREE.Group();
  weaponMount.position.set(0, -0.46, 0.05);
  weaponMount.rotation.x = Math.PI * 0.5;
  rightArmPivot.add(weaponMount);

  // Left & Right Legs + Sneakers
  const makeLeg = (side: -1 | 1): THREE.Group => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.12, 0.82, 0);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.72, 0.19), pantsMat);
    leg.position.y = -0.36;
    leg.castShadow = castShadow;
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.11, 0.28), shoeMat);
    shoe.position.set(0, -0.765, 0.045);
    pivot.add(leg, shoe);
    return pivot;
  };
  const leftLegPivot = makeLeg(1);
  const rightLegPivot = makeLeg(-1);
  bodyGroup.add(leftLegPivot, rightLegPivot);

  let walkPhase = 0;
  let idleClock = 0;

  return {
    root,
    bodyGroup,
    leftArmPivot,
    rightArmPivot,
    weaponMount,
    leftLegPivot,
    rightLegPivot,
    headGroup,
    setColor: (jHex: number, pHex?: number) => {
      jacketMat.color.setHex(jHex);
      if (pHex !== undefined) pantsMat.color.setHex(pHex);
    },
    animate: (
      dt: number,
      speed: number,
      isSprinting: boolean,
      isGrounded: boolean,
      equippedWeapon: WeaponId = 'unarmed',
      actionTimer = 0,
    ) => {
      idleClock += dt;

      // Leg locomotion
      if (!isGrounded) {
        leftLegPivot.rotation.x = THREE.MathUtils.damp(leftLegPivot.rotation.x, 0.42, 12, dt);
        rightLegPivot.rotation.x = THREE.MathUtils.damp(rightLegPivot.rotation.x, -0.32, 12, dt);
        bodyGroup.position.y = THREE.MathUtils.damp(bodyGroup.position.y, 0, 10, dt);
      } else if (speed > 0.25) {
        const freq = isSprinting ? 12.5 : 8.2;
        const amp = isSprinting ? 0.78 : 0.48;
        walkPhase += dt * freq;
        const s = Math.sin(walkPhase);
        leftLegPivot.rotation.x = s * amp;
        rightLegPivot.rotation.x = -s * amp;
        bodyGroup.position.y = Math.abs(Math.cos(walkPhase)) * (isSprinting ? 0.07 : 0.035);
        bodyGroup.rotation.x = THREE.MathUtils.damp(bodyGroup.rotation.x, isSprinting ? 0.12 : 0.04, 8, dt);
      } else {
        leftLegPivot.rotation.x = THREE.MathUtils.damp(leftLegPivot.rotation.x, 0, 10, dt);
        rightLegPivot.rotation.x = THREE.MathUtils.damp(rightLegPivot.rotation.x, 0, 10, dt);
        bodyGroup.position.y = Math.sin(idleClock * 2.2) * 0.015;
        bodyGroup.rotation.x = THREE.MathUtils.damp(bodyGroup.rotation.x, 0, 8, dt);
      }

      // Upper-body & Arm Poses based on Equipped Weapon
      if (equippedWeapon === 'pistol') {
        const recoilKick = actionTimer > 0 ? Math.sin((actionTimer / 0.16) * Math.PI) * 0.26 : 0;
        rightArmPivot.rotation.x = THREE.MathUtils.damp(rightArmPivot.rotation.x, -1.48 - recoilKick, 18, dt);
        rightArmPivot.rotation.y = THREE.MathUtils.damp(rightArmPivot.rotation.y, 0.08, 14, dt);
        leftArmPivot.rotation.y = THREE.MathUtils.damp(leftArmPivot.rotation.y, 0, 12, dt);
        const swing = speed > 0.25 ? -Math.sin(walkPhase) * 0.35 : Math.sin(idleClock * 2) * 0.03;
        leftArmPivot.rotation.x = THREE.MathUtils.damp(leftArmPivot.rotation.x, swing, 10, dt);
        weaponMount.rotation.set(Math.PI * 0.5, 0, 0);
      } else if (equippedWeapon === 'ak47') {
        const recoilKick = actionTimer > 0 ? Math.sin((actionTimer / 0.16) * Math.PI) * 0.3 : 0;
        rightArmPivot.rotation.x = THREE.MathUtils.damp(rightArmPivot.rotation.x, -1.42 - recoilKick, 20, dt);
        rightArmPivot.rotation.y = THREE.MathUtils.damp(rightArmPivot.rotation.y, 0.18, 16, dt);
        // Support left hand angled across chest to grip handguard
        leftArmPivot.rotation.x = THREE.MathUtils.damp(leftArmPivot.rotation.x, -1.35 - recoilKick * 0.8, 18, dt);
        leftArmPivot.rotation.y = THREE.MathUtils.damp(leftArmPivot.rotation.y, -0.52, 16, dt);
        weaponMount.rotation.set(Math.PI * 0.5, 0, 0);
      } else if (equippedWeapon === 'golf_club') {
        weaponMount.rotation.set(0.35, 0, 0);
        if (actionTimer > 0) {
          // Wind-up & athletic golf swing arc
          const prog = 1 - actionTimer / 0.52;
          const swingAngle = prog < 0.3 ? -2.3 * (prog / 0.3) : -2.3 + ((prog - 0.3) / 0.7) * 3.5;
          rightArmPivot.rotation.x = swingAngle;
          leftArmPivot.rotation.x = swingAngle * 0.92;
          rightArmPivot.rotation.y = 0.22;
          leftArmPivot.rotation.y = -0.35;
        } else {
          const carrySway = speed > 0.25 ? Math.sin(walkPhase) * 0.22 : 0;
          rightArmPivot.rotation.x = THREE.MathUtils.damp(rightArmPivot.rotation.x, -0.32 + carrySway, 10, dt);
          rightArmPivot.rotation.y = THREE.MathUtils.damp(rightArmPivot.rotation.y, 0, 10, dt);
          leftArmPivot.rotation.x = THREE.MathUtils.damp(leftArmPivot.rotation.x, -carrySway, 10, dt);
          leftArmPivot.rotation.y = THREE.MathUtils.damp(leftArmPivot.rotation.y, 0, 10, dt);
        }
      } else {
        // Unarmed natural arm swing
        rightArmPivot.rotation.y = THREE.MathUtils.damp(rightArmPivot.rotation.y, 0, 12, dt);
        leftArmPivot.rotation.y = THREE.MathUtils.damp(leftArmPivot.rotation.y, 0, 12, dt);
        if (!isGrounded) {
          leftArmPivot.rotation.x = THREE.MathUtils.damp(leftArmPivot.rotation.x, -0.65, 12, dt);
          rightArmPivot.rotation.x = THREE.MathUtils.damp(rightArmPivot.rotation.x, -0.65, 12, dt);
        } else if (speed > 0.25) {
          const amp = isSprinting ? 0.78 : 0.48;
          const s = Math.sin(walkPhase);
          leftArmPivot.rotation.x = -s * amp * 0.85;
          rightArmPivot.rotation.x = s * amp * 0.85;
        } else {
          leftArmPivot.rotation.x = THREE.MathUtils.damp(leftArmPivot.rotation.x, Math.sin(idleClock * 2) * 0.03, 8, dt);
          rightArmPivot.rotation.x = THREE.MathUtils.damp(rightArmPivot.rotation.x, -Math.sin(idleClock * 2) * 0.03, 8, dt);
        }
      }
    },
  };
}

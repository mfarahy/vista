'use client';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { useI18n } from '@/lib/i18n';
import type { Translator } from '@/lib/i18n/core';
import type {
  FloorPlan3DModel,
  FloorPlan3DOpening,
  FloorPlan3DRoom,
  FloorPlan3DWall,
} from '@/app/create/[id]/types';

/**
 * Three.js scene for the generated 3D floor plan model. Renders the
 * dollhouse-style structure: room floors (polygon or AABB), walls, doors,
 * windows, and room name labels, with orbit controls so the user can rotate
 * and inspect the model, plus a reset-camera button. Pure presentation — it
 * never mutates data and only knows the standardized FloorPlan3DModel shape.
 */

const COLORS = {
  floor: 0xf0e9dc,
  wall: 0xd8d0c0,
  door: 0x8a5a33,
  window: 0xaed8f0,
};

const LEVEL_GAP = 0.2;

function boxMaterial(color: number, opacity = 1) {
  return new THREE.MeshStandardMaterial({ color, opacity, transparent: opacity < 1 });
}

function addWall(group: THREE.Group, wall: FloorPlan3DWall) {
  const dx = wall.to.x - wall.from.x;
  const dy = wall.to.y - wall.from.y;
  const length = Math.hypot(dx, dy);
  if (length <= 0) return;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(length, wall.height, wall.thickness),
    boxMaterial(COLORS.wall),
  );
  mesh.position.set((wall.from.x + wall.to.x) / 2, wall.height / 2, (wall.from.y + wall.to.y) / 2);
  mesh.rotation.y = Math.atan2(dy, dx);
  group.add(mesh);
}

function addOpening(group: THREE.Group, opening: FloorPlan3DOpening, kind: 'door' | 'window') {
  const height = kind === 'door' ? opening.height : Math.min(opening.height, 1.4);
  const y = kind === 'door' ? height / 2 + 0.02 : height / 2 + 0.95;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(opening.width, height, 0.06),
    boxMaterial(kind === 'door' ? COLORS.door : COLORS.window, kind === 'window' ? 0.75 : 1),
  );
  mesh.position.set(opening.x, y, opening.y);
  mesh.rotation.y = opening.rotation ?? 0;
  group.add(mesh);
}

function addRoomFloor(group: THREE.Group, room: FloorPlan3DRoom) {
  let mesh: THREE.Mesh;
  if (room.points && room.points.length >= 3) {
    const shape = new THREE.Shape(
      room.points.map((p) => new THREE.Vector2(p.x, p.y)),
    );
    mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), boxMaterial(COLORS.floor));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.02;
  } else {
    mesh = new THREE.Mesh(
      new THREE.BoxGeometry(room.width, 0.12, room.depth),
      boxMaterial(COLORS.floor),
    );
    mesh.position.set(room.x, 0.06, room.y);
  }
  group.add(mesh);
}

function roomDisplayName(room: FloorPlan3DRoom, tr: Translator): string {
  if (room.labelHint === 'kitchen') return tr.t('floorplanDebug.roomKitchen');
  if (room.labelHint === 'outside') return tr.t('floorplanDebug.roomOutside');
  return tr.t('floorplanDebug.roomName', { number: room.labelIndex ?? 1 });
}

function addRoom(
  group: THREE.Group,
  room: FloorPlan3DRoom,
  labelLayer: THREE.Group,
  tr: Translator,
) {
  addRoomFloor(group, room);

  const label = document.createElement('div');
  label.className = 'floorplan-3d-label';
  label.textContent = room.areaM2
    ? tr.t('floorplan3d.roomLabel', { name: roomDisplayName(room, tr), area: room.areaM2 })
    : roomDisplayName(room, tr);
  const object = new CSS2DObject(label);
  object.position.set(room.x, room.height + 0.35, room.y);
  labelLayer.add(object);
}

export function FloorPlan3DScene({ model }: { model: FloorPlan3DModel }) {
  const { locale, t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf7f4ee);

    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.inset = '0';
    container.appendChild(renderer.domElement);

    const labelRenderer = new CSS2DRenderer();
    labelRenderer.domElement.style.position = 'absolute';
    labelRenderer.domElement.style.inset = '0';
    labelRenderer.domElement.style.pointerEvents = 'none';
    container.appendChild(labelRenderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, 0xd8cfc0, 1.15));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(12, 20, 10);
    scene.add(sun);

    const structure = new THREE.Group();
    const labelLayer = new THREE.Group();
    scene.add(structure);
    scene.add(labelLayer);

    const levelHeights = new Map<number, number>();
    for (const room of model.rooms) {
      levelHeights.set(room.level, Math.max(levelHeights.get(room.level) ?? 0, room.height));
    }
    const levels = [...levelHeights.keys()].sort((a, b) => a - b);

    const tr: Translator = { locale, t };
    for (const level of levels) {
      const levelHeight = levelHeights.get(level) ?? 2.5;
      const group = new THREE.Group();
      group.position.y = level * (levelHeight + LEVEL_GAP);
      for (const room of model.rooms) {
        if (room.level === level) addRoom(group, room, labelLayer, tr);
      }
      for (const wall of model.walls) {
        if (wall.level === level) addWall(group, wall);
      }
      for (const door of model.doors) {
        if (door.level === level) addOpening(group, door, 'door');
      }
      for (const window of model.windows) {
        if (window.level === level) addOpening(group, window, 'window');
      }
      structure.add(group);
    }

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2.05;

    function frameCamera() {
      const bounds = new THREE.Box3().setFromObject(structure);
      if (bounds.isEmpty())
        bounds.setFromCenterAndSize(new THREE.Vector3(0, 1, 0), new THREE.Vector3(4, 2, 4));
      const center = bounds.getCenter(new THREE.Vector3());
      const radius = bounds.getSize(new THREE.Vector3()).length() || 4;
      camera.position.copy(center).add(new THREE.Vector3(radius * 0.9, radius * 0.8, radius * 1.1));
      camera.lookAt(center);
      controls.target.copy(center);
      controls.minDistance = radius * 0.3;
      controls.maxDistance = radius * 4;
      controls.update();
    }
    frameRef.current = frameCamera;
    frameCamera();

    function resize() {
      const target = containerRef.current;
      if (!target) return;
      const width = target.clientWidth || 1;
      const height = target.clientHeight || 1;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      labelRenderer.setSize(width, height);
    }
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    renderer.setAnimationLoop(() => {
      controls.update();
      renderer.render(scene, camera);
      labelRenderer.render(scene, camera);
    });

    return () => {
      observer.disconnect();
      renderer.setAnimationLoop(null);
      controls.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const material = object.material;
          if (Array.isArray(material)) material.forEach((item) => item.dispose());
          else material.dispose();
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
      labelRenderer.domElement.remove();
      frameRef.current = null;
    };
  }, [model, locale, t]);

  return (
    <div className="floorplan-3d-scene" aria-label={t('floorplan3d.ariaLabel')}>
      <div ref={containerRef} className="floorplan-3d-canvas" />
      <span className="floorplan-3d-hint" aria-hidden="true">
        {t('floorplan3d.hint')}
      </span>
      <button
        type="button"
        className="floorplan-3d-reset"
        onClick={() => frameRef.current?.()}
        aria-label={t('floorplanDebug.resetCamera')}
        title={t('floorplanDebug.resetCamera')}
      >
        {t('floorplanDebug.resetCamera')}
      </button>
    </div>
  );
}
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { BuildingModel3D } from "./geometryGenerator";

type BuildingViewerProps = {
  model: BuildingModel3D;
  selectedFloorId: string;
  selectedElement: { type: "floor" | "room" | "wall" | "door" | "window"; id: string; floorId: string } | null;
  onSelectElement: (element: { type: "floor" | "room" | "wall" | "door" | "window"; id: string; floorId: string } | null) => void;
};

const createFloorMesh = (vertices: { x: number; y: number }[]) => {
  const shape = new THREE.Shape();
  shape.moveTo(vertices[0].x, vertices[0].y);
  for (const vertex of vertices.slice(1)) shape.lineTo(vertex.x, vertex.y);
  shape.closePath();

  const mesh = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshStandardMaterial({ color: "#d5d8d1", roughness: 1, side: THREE.DoubleSide }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  return mesh;
};

const createCeilingMesh = (vertices: { x: number; y: number }[]) => {
  const shape = new THREE.Shape();
  shape.moveTo(vertices[0].x, vertices[0].y);
  for (const vertex of vertices.slice(1)) shape.lineTo(vertex.x, vertex.y);
  shape.closePath();

  const mesh = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshStandardMaterial({ color: "#e5e8e1", roughness: 1, side: THREE.DoubleSide }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  return mesh;
};

const createMeasurementLine = (start: { x: number; y: number; z: number }, end: { x: number; y: number; z: number }, color = "#1b2d35") => {
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(start.x, start.y, start.z),
    new THREE.Vector3(end.x, end.y, end.z),
  ]);

  const material = new THREE.LineBasicMaterial({ color });
  const line = new THREE.Line(geometry, material);
  return line;
};

const createMeasurementLabel = (text: string, position: { x: number; y: number; z: number }, vertical = false, color = "#1b2d35") => {
  const canvas = document.createElement("canvas");
  const width = 256;
  const height = 64;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;

  context.font = "600 30px 'Segoe UI', system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  const textWidth = context.measureText(text).width;
  const backgroundPadding = 12;
  const backgroundWidth = Math.min(textWidth + backgroundPadding * 2, width - 4);
  const backgroundX = width / 2 - backgroundWidth / 2;
  context.fillStyle = "rgba(255,255,255,0.82)";
  context.fillRect(backgroundX, 8, backgroundWidth, height - 16);
  context.fillStyle = color;
  context.fillText(text, width / 2, height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }),
  );
  const worldHeight = 0.32;
  sprite.scale.set((backgroundWidth / height) * worldHeight, worldHeight, 1);
  sprite.position.set(position.x, position.y, position.z);
  sprite.userData = { vertical };
  return { sprite, texture };
};

const createPartMesh = (
  part: { center: { x: number; y: number; z: number }; width: number; height: number; depth: number; rotationZ: number },
  material: THREE.Material,
  meta: { type: "door" | "window"; id: string; floorId: string },
) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(part.width, part.height, part.depth), material);
  mesh.position.set(part.center.x, part.center.y, part.center.z);
  mesh.rotation.y = -part.rotationZ;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = meta;
  return mesh;
};

export function BuildingViewer({ model, selectedFloorId, selectedElement, onSelectElement }: BuildingViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#eef2f1");
    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
    camera.position.set(10, 9, 11);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(4.5, 1.2, -3.5);
    controls.enableDamping = true;
    controls.minDistance = 4;
    controls.maxDistance = 25;

    scene.add(new THREE.HemisphereLight("#ffffff", "#9aa9a4", 2.2));
    const keyLight = new THREE.DirectionalLight("#ffffff", 2.5);
    keyLight.position.set(6, 10, 5);
    keyLight.castShadow = true;
    scene.add(keyLight);

    const floorGroups = new Map<string, THREE.Group>();
    for (const floor of model.floors) {
      let group = floorGroups.get(floor.floorId);
      if (!group) { group = new THREE.Group(); floorGroups.set(floor.floorId, group); scene.add(group); }
      const mesh = createFloorMesh(floor.vertices);
      mesh.position.y = floor.elevation - 0.01;
      mesh.userData = { type: "room", id: floor.roomId, floorId: floor.floorId };
      group.add(mesh);

      const floorSelector = new THREE.Mesh(
        new THREE.BoxGeometry(10, 0.04, 8),
        new THREE.MeshBasicMaterial({ color: "#dfe5e2", transparent: true, opacity: 0.03 }),
      );
      floorSelector.position.set(4.5, floor.elevation - 0.05, -3.5);
      floorSelector.userData = { type: "floor", id: floor.floorId, floorId: floor.floorId };
      group.add(floorSelector);
    }

    for (const ceiling of model.ceilings) {
      const mesh = createCeilingMesh(ceiling.vertices);
      mesh.position.y = ceiling.elevation + 0.01;
      mesh.userData = { type: "room", id: ceiling.roomId, floorId: ceiling.floorId };
      let group = floorGroups.get(ceiling.floorId);
      if (!group) { group = new THREE.Group(); floorGroups.set(ceiling.floorId, group); scene.add(group); }
      group.add(mesh);
    }

    for (const wall of model.wallBoxes) {
      const material = new THREE.MeshStandardMaterial({
        color: wall.kind === "exterior" ? "#3d5a59" : "#81938d",
        roughness: 0.82,
      });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(wall.length, wall.height, wall.thickness), material);
      mesh.position.set(wall.center.x, wall.center.y, wall.center.z);
      mesh.rotation.y = -wall.rotationZ;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = { type: "wall", id: wall.sourceWallId, floorId: wall.floorId };
      let group = floorGroups.get(wall.floorId);
      if (!group) { group = new THREE.Group(); floorGroups.set(wall.floorId, group); scene.add(group); }
      group.add(mesh);
    }

    const doorGroup = new THREE.Group();
    const doorFrameMaterial = new THREE.MeshStandardMaterial({ color: "#6b4f35", roughness: 0.6 });
    const doorLeafMaterial = new THREE.MeshStandardMaterial({ color: "#9a6a42", roughness: 0.55 });
    const doorHandleMaterial = new THREE.MeshStandardMaterial({ color: "#c9c2b4", metalness: 0.7, roughness: 0.3 });
    for (const door of model.doors) {
      const meta = { type: "door" as const, id: door.id, floorId: door.floorId };
      for (const part of door.frame) doorGroup.add(createPartMesh(part, doorFrameMaterial, meta));
      const leafPart = door.leafSwing ?? door.leaf;
      if (leafPart) doorGroup.add(createPartMesh(leafPart, doorLeafMaterial, meta));
      if (door.handle) doorGroup.add(createPartMesh(door.handle, doorHandleMaterial, meta));
    }
    scene.add(doorGroup);

    const windowGroup = new THREE.Group();
    const windowFrameMaterial = new THREE.MeshStandardMaterial({ color: "#d7deda", roughness: 0.6 });
    const windowGlassMaterial = new THREE.MeshStandardMaterial({ color: "#9fc4dd", transparent: true, opacity: 0.4, roughness: 0.12, side: THREE.DoubleSide });
    const windowSillMaterial = new THREE.MeshStandardMaterial({ color: "#c7cec9", roughness: 0.7 });
    for (const window of model.windows) {
      const meta = { type: "window" as const, id: window.id, floorId: window.floorId };
      for (const part of window.frame) windowGroup.add(createPartMesh(part, windowFrameMaterial, meta));
      if (window.glass) windowGroup.add(createPartMesh(window.glass, windowGlassMaterial, meta));
      if (window.sill) windowGroup.add(createPartMesh(window.sill, windowSillMaterial, meta));
    }
    scene.add(windowGroup);

    const measurementGroup = new THREE.Group();
    const measurementColor = "#20363f";
    const labelTextures: THREE.CanvasTexture[] = [];
    for (const measurement of model.measurements) {
      const line = createMeasurementLine(measurement.start, measurement.end, measurementColor);
      line.userData = { type: measurement.subjectType, id: measurement.subjectId, floorId: measurement.floorId };
      measurementGroup.add(line);

      const vertical = measurement.axis === "vertical";
      const midpoint = {
        x: (measurement.start.x + measurement.end.x) / 2,
        y: (measurement.start.y + measurement.end.y) / 2,
        z: (measurement.start.z + measurement.end.z) / 2,
      };
      const labelPosition = vertical
        ? { x: midpoint.x + 0.22, y: midpoint.y, z: midpoint.z }
        : { x: midpoint.x, y: midpoint.y + 0.18, z: midpoint.z };
      const label = createMeasurementLabel(measurement.label, labelPosition, vertical, measurementColor);
      if (label) {
        measurementGroup.add(label.sprite);
        labelTextures.push(label.texture);
      }
    }
    scene.add(measurementGroup);

    const stairGroup = new THREE.Group();
    for (const stair of model.stairs) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(stair.width, stair.height, stair.length), new THREE.MeshStandardMaterial({ color: "#b7653a", roughness: 0.9 }));
      mesh.position.set(stair.center.x, stair.center.y, stair.center.z);
      mesh.rotation.y = stair.rotationY;
      stairGroup.add(mesh);
    }
    scene.add(stairGroup);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(model.roof.width, model.roof.height, model.roof.length), new THREE.MeshStandardMaterial({ color: "#6c4e46", roughness: 1 }));
    roof.position.set(model.roof.center.x, model.roof.center.y, model.roof.center.z);
    scene.add(roof);

    for (const [floorId, group] of floorGroups) group.visible = selectedFloorId === "all" || selectedFloorId === floorId;
    stairGroup.visible = selectedFloorId === "all" || model.stairs.some((stair) => stair.sourceFloorId === selectedFloorId || stair.targetFloorId === selectedFloorId);
    doorGroup.visible = selectedFloorId === "all" || model.doors.some((door) => door.floorId === selectedFloorId);
    windowGroup.visible = selectedFloorId === "all" || model.windows.some((window) => window.floorId === selectedFloorId);
    roof.visible = selectedFloorId === "all" || selectedFloorId === model.roof.floorId;
    measurementGroup.visible = selectedFloorId === "all" || model.measurements.some((measurement) => measurement.floorId === selectedFloorId);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const handlePointerDown = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(scene.children, true);
      const pick = hits.find((hit) => hit.object.userData && hit.object.userData.type);
      if (!pick) {
        onSelectElement(null);
        return;
      }
      const meta = pick.object.userData as { type: "floor" | "room" | "wall" | "door" | "window"; id: string; floorId: string };
      onSelectElement(meta);
    };

    renderer.domElement.addEventListener("pointerdown", handlePointerDown);

    const grid = new THREE.GridHelper(12, 12, "#b5c0bd", "#d6ddda");
    grid.position.set(4.5, -0.02, -3.5);
    scene.add(grid);

    const axes = new THREE.AxesHelper(1.4);
    axes.position.set(0, 0, 0);
    scene.add(axes);

    const resize = () => {
      const { width, height } = container.getBoundingClientRect();
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    let frame = 0;
    const render = () => {
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      for (const texture of labelTextures) texture.dispose();
      controls.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, [model, selectedFloorId, onSelectElement]);

  return <div className="viewer" ref={containerRef} aria-label="3D building model" />;
}
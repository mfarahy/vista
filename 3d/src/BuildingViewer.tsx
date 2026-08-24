import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { BuildingModel3D } from "./geometryGenerator";

type BuildingViewerProps = {
  model: BuildingModel3D;
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
  mesh.position.y = -0.01;
  mesh.receiveShadow = true;
  return mesh;
};

export function BuildingViewer({ model }: BuildingViewerProps) {
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

    const floorGroup = new THREE.Group();
    for (const floor of model.floors) floorGroup.add(createFloorMesh(floor.vertices));
    scene.add(floorGroup);

    for (const wall of model.wallBoxes) {
      const material = new THREE.MeshStandardMaterial({
        color: wall.kind === "exterior" ? "#3d5a59" : "#81938d",
        roughness: 0.82,
      });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(wall.length, wall.height, wall.thickness), material);
      mesh.position.set(wall.center.x, wall.center.z, -wall.center.y);
      mesh.rotation.y = -wall.rotationZ;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
    }

    for (const opening of model.openings) {
      const marker = new THREE.Mesh(
        new THREE.BoxGeometry(opening.width, opening.height, opening.thickness * 1.08),
        new THREE.MeshStandardMaterial({
          color: opening.type === "door" ? "#be7a35" : "#3b78a8",
          transparent: true,
          opacity: 0.28,
          roughness: 0.65,
        }),
      );
      marker.position.set(opening.center.x, opening.center.z, -opening.center.y);
      marker.rotation.y = -opening.rotationZ;
      scene.add(marker);
    }

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
      controls.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, [model]);

  return <div className="viewer" ref={containerRef} aria-label="3D building model" />;
}
'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { useI18n } from '@/lib/i18n';

type GlbViewerProps = {
  modelUrl: string | null;
  modelBase64?: string | null;
  ariaLabel?: string;
};

export function GlbViewer({ modelUrl, modelBase64, ariaLabel }: GlbViewerProps) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const resolvedUrl = modelBase64
    ? modelBase64.startsWith('data:')
      ? modelBase64
      : `data:model/gltf-binary;base64,${modelBase64}`
    : modelUrl;

  useEffect(() => {
    if (!resolvedUrl) {
      setLoading(false);
      return;
    }
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#eef2f1');

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = true;

    scene.add(new THREE.HemisphereLight('#ffffff', '#9aa9a4', 2.2));
    const keyLight = new THREE.DirectionalLight('#ffffff', 2.5);
    keyLight.position.set(5, 10, 5);
    keyLight.castShadow = true;
    scene.add(keyLight);

    const loader = new GLTFLoader();

    loader.load(
      resolvedUrl,
      (gltf) => {
        if (cancelled) return;
        const model = gltf.scene;
        scene.add(model);

        const box = new THREE.Box3().setFromObject(model);
        if (box.isEmpty()) {
          box.setFromCenterAndSize(new THREE.Vector3(0, 0, 0), new THREE.Vector3(2, 2, 2));
        }
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 2;
        const distance = maxDim * 1.8;

        model.position.sub(center);

        const newBox = new THREE.Box3().setFromObject(model);
        const newCenter = newBox.getCenter(new THREE.Vector3());

        camera.position.set(newCenter.x + distance * 0.7, newCenter.y + distance * 0.6, newCenter.z + distance * 0.9);
        controls.target.copy(newCenter);
        controls.update();

        camera.near = maxDim * 0.01;
        camera.far = maxDim * 20;
        camera.updateProjectionMatrix();
        controls.minDistance = maxDim * 0.2;
        controls.maxDistance = maxDim * 6;

        const grid = new THREE.GridHelper(maxDim * 2, 14, '#b5c0bd', '#d6ddda');
        grid.position.y = newBox.min.y - 0.02;
        scene.add(grid);

        setLoading(false);
      },
      undefined,
      () => {
        if (cancelled) return;
        setError(t('floorplan3d.meltflex.invalidGlb'));
        setLoading(false);
      },
    );

    const resize = () => {
      const { width, height } = container.getBoundingClientRect();
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    let frame = 0;
    const render = () => {
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          const mat = obj.material;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else if (mat) (mat as THREE.Material).dispose();
        }
      });
    };
  }, [resolvedUrl, t]);

  if (!resolvedUrl) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t('floorplan3d.meltflex.empty')}
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" aria-label={ariaLabel ?? t('floorplan3d.ariaLabel')} />
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/60 backdrop-blur-sm">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden="true" />
          <span className="mt-3 text-sm text-muted-foreground">{t('floorplan3d.meltflex.loadingModel')}</span>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 p-4">
          <p className="max-w-md text-center text-sm text-destructive">{error}</p>
        </div>
      )}
    </div>
  );
}

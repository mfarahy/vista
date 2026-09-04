// 3D view (Phase 6).
//
// A minimal three.js scene: extruded walls built from the same floor-plan
// data as the 2D view, and one clickable sphere marker per panorama
// position, placed via `floorPlanToWorld3D()` — the same coordinate mapping
// used to relate the floor plan, the 3D scene and the 360 panoramas.
//
// This is intentionally not a full 3D building/editor: no roof, no
// textures, orbit controls only, just enough geometry to prove the
// coordinate mapping holds.

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { PANORAMAS } from './panoramas.js'
import { ROOMS, WALLS, WINDOWS, roomById } from './floorplan.js'
import { EYE_HEIGHT_M, floorPlanToWorld3D } from './coordinates.js'
import { windowFloorSegment, windowWorldCorners } from './windowGeometry.js'

const WALL_HEIGHT_M = 2.6
const WALL_THICKNESS_M = 0.12
const MARKER_RADIUS_M = 0.28

export default function Scene3D({ activePanoramaId, onSelectPanorama }) {
  const containerRef = useRef(null)

  useEffect(() => {
    const container = containerRef.current
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xe5e7eb)

    const camera = new THREE.PerspectiveCamera(
      55,
      container.clientWidth / container.clientHeight,
      0.1,
      200,
    )
    camera.position.set(6, 14, 20)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(5, 0, 4)
    controls.update()

    scene.add(new THREE.AmbientLight(0xffffff, 0.7))
    const sun = new THREE.DirectionalLight(0xffffff, 0.8)
    sun.position.set(10, 20, 10)
    scene.add(sun)

    // Floor, sized to the rooms' bounding box.
    const xs = ROOMS.flatMap((r) => [r.center.x - r.size / 2, r.center.x + r.size / 2])
    const ys = ROOMS.flatMap((r) => [r.center.y - r.size / 2, r.center.y + r.size / 2])
    const floorWidth = Math.max(...xs) - Math.min(...xs) + 4
    const floorDepth = Math.max(...ys) - Math.min(...ys) + 4
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(floorWidth, floorDepth),
      new THREE.MeshStandardMaterial({ color: 0xf3f4f6 }),
    )
    floor.rotation.x = -Math.PI / 2
    floor.position.set((Math.min(...xs) + Math.max(...xs)) / 2, 0, (Math.min(...ys) + Math.max(...ys)) / 2)
    scene.add(floor)

    // Walls: one extruded box per floor-plan wall segment.
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff })
    for (const wall of WALLS) {
      const dx = wall.x2 - wall.x1
      const dy = wall.y2 - wall.y1
      const length = Math.hypot(dx, dy)
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(length, WALL_HEIGHT_M, WALL_THICKNESS_M),
        wallMaterial,
      )
      const mid = floorPlanToWorld3D({ x: (wall.x1 + wall.x2) / 2, y: (wall.y1 + wall.y2) / 2 })
      mesh.position.set(mid.x, WALL_HEIGHT_M / 2, mid.z)
      mesh.rotation.y = -Math.atan2(dy, dx)
      scene.add(mesh)
    }

    // Windows (Phase 7): one translucent glass plane per floor-plan window,
    // built from the same derived world-space corners used for the 360
    // overlay, offset slightly toward the room interior so the plane sits on
    // the wall's inner face instead of inside the wall box.
    for (const win of WINDOWS) {
      const room = roomById(win.roomId)
      const { center } = windowFloorSegment(win)
      const toRoom = { x: room.center.x - center.x, y: room.center.y - center.y }
      const toRoomLen = Math.hypot(toRoom.x, toRoom.y) || 1
      const inset = WALL_THICKNESS_M / 2 + 0.01
      const off = {
        x: (toRoom.x / toRoomLen) * inset,
        z: (toRoom.y / toRoomLen) * inset,
      }
      const corners = windowWorldCorners(win).map((c) => ({
        x: c.x + off.x,
        y: c.y,
        z: c.z + off.z,
      }))
      const positions = new Float32Array(corners.flatMap((c) => [c.x, c.y, c.z]))
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      geometry.setIndex([0, 1, 2, 0, 2, 3])
      geometry.computeVertexNormals()
      const glass = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({
          color: 0x93c5fd,
          transparent: true,
          opacity: 0.85,
          side: THREE.DoubleSide,
        }),
      )
      scene.add(glass)
      const edgeGeometry = new THREE.BufferGeometry()
      edgeGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      edgeGeometry.setIndex([0, 1, 2, 3, 0])
      const edges = new THREE.Line(
        edgeGeometry,
        new THREE.LineBasicMaterial({ color: 0x1d4ed8 }),
      )
      scene.add(edges)
    }

    // Panorama markers, positioned via the canonical coordinate mapping.
    const markerGeometry = new THREE.SphereGeometry(MARKER_RADIUS_M, 24, 16)
    const markers = PANORAMAS.map((pano) => {
      const worldPos = floorPlanToWorld3D(pano.position, EYE_HEIGHT_M)
      const material = new THREE.MeshStandardMaterial({
        color: pano.id === activePanoramaId ? 0xf59e0b : 0x2563eb,
      })
      const mesh = new THREE.Mesh(markerGeometry, material)
      mesh.position.set(worldPos.x, worldPos.y, worldPos.z)
      mesh.userData.panoramaId = pano.id
      scene.add(mesh)
      return mesh
    })

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()

    function handleClick(event) {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObjects(markers)[0]
      if (hit) onSelectPanorama(hit.object.userData.panoramaId)
    }
    renderer.domElement.addEventListener('click', handleClick)

    let rafId
    const animate = () => {
      rafId = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    function handleResize() {
      camera.aspect = container.clientWidth / container.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(container.clientWidth, container.clientHeight)
    }
    window.addEventListener('resize', handleResize)

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', handleResize)
      renderer.domElement.removeEventListener('click', handleClick)
      controls.dispose()
      renderer.dispose()
      container.removeChild(renderer.domElement)
    }
  }, [activePanoramaId, onSelectPanorama])

  return <div className="scene-3d" ref={containerRef} />
}

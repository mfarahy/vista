import { useEffect, useRef, useState } from 'react'
import 'pannellum/build/pannellum.js'
import 'pannellum/build/pannellum.css'
import { panoramaById } from './panoramas.js'
import {
  FADE_TRANSITION_MS,
  buildScenesConfig,
  navigateToPanorama,
} from './spatialNavigation.js'
import { attachWindowOverlay } from './windowOverlay.js'
import FloorPlan2D from './FloorPlan2D.jsx'
import Scene3D from './Scene3D.jsx'

const pannellum = window.pannellum

const VIEWS = [
  { id: '2d', label: '2D Floor Plan' },
  { id: '3d', label: '3D View' },
  { id: '360', label: '360°' },
]

export default function App() {
  const containerRef = useRef(null)
  const [view, setView] = useState('2d')
  const [activePanoramaId, setActivePanoramaId] = useState('living-room')
  const [currentLabel, setCurrentLabel] = useState(
    () => panoramaById('living-room').label,
  )
  // Tracks which scene the viewer should (re)mount on; kept out of the
  // effect's dependency array so in-viewer arrow navigation (which also
  // updates it) doesn't tear down and recreate the Pannellum viewer.
  const initialSceneRef = useRef(activePanoramaId)

  // Clicking a marker in the 2D floor plan or the 3D view opens the 360
  // panorama for that position.
  function openPanorama(id) {
    initialSceneRef.current = id
    setActivePanoramaId(id)
    setView('360')
  }

  useEffect(() => {
    if (view !== '360') return

    let viewer
    let overlayCleanup

    // One Pannellum scene per panorama; navigation arrows are part of each
    // scene's hotspot configuration.
    const scenes = buildScenesConfig((link) => navigateToPanorama(viewer, link))

    viewer = pannellum.viewer(containerRef.current, {
      type: 'equirectangular',
      firstScene: initialSceneRef.current,
      scenes,
      autoLoad: true,
      // Simple cross-fade transition between panoramas.
      sceneFadeDuration: FADE_TRANSITION_MS,
      // Interaction: drag to look around, wheel + pinch to zoom.
      mouseZoom: true,
      keyboardZoom: true,
      // Keep the UI minimal: hide the built-in toolbar and compass.
      showControls: false,
      compass: false,
      tooltip: false,
    })

    // `load` fires for the initial panorama and after every scene change.
    const handleSceneLoad = () => {
      const sceneId = viewer.getScene()
      const pano = panoramaById(sceneId)
      setCurrentLabel(pano ? pano.label : sceneId)
      initialSceneRef.current = sceneId
      setActivePanoramaId(sceneId)

      // Geometry-based window overlay (Phase 7): attaches for any panorama
      // that owns a floor-plan window (currently living room only).
      // Navigation arrows are created by Pannellum from the scene config.
      if (overlayCleanup) {
        overlayCleanup()
        overlayCleanup = undefined
      }
      overlayCleanup = attachWindowOverlay(viewer, containerRef.current, sceneId)
    }
    viewer.on('load', handleSceneLoad)

    return () => {
      viewer.off('load', handleSceneLoad)
      if (overlayCleanup) overlayCleanup()
      viewer.destroy()
    }
  }, [view])

  return (
    <>
      <nav className="view-switcher">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            className={`view-switcher-btn${view === v.id ? ' view-switcher-btn--active' : ''}`}
            onClick={() => setView(v.id)}
          >
            {v.label}
          </button>
        ))}
      </nav>

      {view === '2d' && (
        <FloorPlan2D activePanoramaId={activePanoramaId} onSelectPanorama={openPanorama} />
      )}
      {view === '3d' && (
        <Scene3D activePanoramaId={activePanoramaId} onSelectPanorama={openPanorama} />
      )}
      {view === '360' && (
        <>
          <div className="viewer" ref={containerRef} />
          <h1 className="title">Vista 360 Prototype · {currentLabel}</h1>
        </>
      )}
    </>
  )
}
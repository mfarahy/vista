import { useEffect, useRef, useState } from 'react'
import 'pannellum/build/pannellum.js'
import 'pannellum/build/pannellum.css'
import { panoramaById } from './panoramas.js'
import {
  FADE_TRANSITION_MS,
  buildScenesConfig,
  navigateToPanorama,
} from './spatialNavigation.js'
import { attachWindowAnnotation } from './spatialAnnotation.js'

const pannellum = window.pannellum

export default function App() {
  const containerRef = useRef(null)
  const [currentLabel, setCurrentLabel] = useState(
    () => panoramaById('living-room').label,
  )

  useEffect(() => {
    let viewer
    let annotationCleanup

    // One Pannellum scene per panorama; navigation arrows are part of each
    // scene's hotspot configuration.
    const scenes = buildScenesConfig((link) => navigateToPanorama(viewer, link))

    viewer = pannellum.viewer(containerRef.current, {
      type: 'equirectangular',
      firstScene: 'living-room',
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

      // The window annotation (Phase 3) only exists in the living room.
      // Navigation arrows are created by Pannellum from the scene config.
      if (annotationCleanup) {
        annotationCleanup()
        annotationCleanup = undefined
      }
      if (sceneId === 'living-room') {
        annotationCleanup = attachWindowAnnotation(
          viewer,
          containerRef.current,
        )
      }
    }
    viewer.on('load', handleSceneLoad)

    return () => {
      viewer.off('load', handleSceneLoad)
      if (annotationCleanup) annotationCleanup()
      viewer.destroy()
    }
  }, [])

  return (
    <>
      <div className="viewer" ref={containerRef} />
      <h1 className="title">Vista 360 Prototype · {currentLabel}</h1>
    </>
  )
}
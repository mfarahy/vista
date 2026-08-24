import { useEffect, useRef } from 'react'
import 'pannellum/build/pannellum.js'
import 'pannellum/build/pannellum.css'
import {
  WINDOW_ANNOTATION,
  attachWindowAnnotation,
} from './spatialAnnotation.js'

const pannellum = window.pannellum

const PANORAMA_URL = `${import.meta.env.BASE_URL}pano/rheingauer-dom.jpg`

export default function App() {
  const containerRef = useRef(null)

  useEffect(() => {
    const viewer = pannellum.viewer(containerRef.current, {
      type: 'equirectangular',
      panorama: PANORAMA_URL,
      autoLoad: true,
      // Start looking directly at the annotation so the fade behavior is
      // immediately verifiable (rotate away → fades out, rotate back → in).
      yaw: WINDOW_ANNOTATION.yaw,
      pitch: WINDOW_ANNOTATION.pitch,
      // Interaction: drag to look around, wheel + pinch to zoom.
      mouseZoom: true,
      keyboardZoom: true,
      // Keep the UI minimal: hide the built-in toolbar and compass.
      showControls: false,
      compass: false,
      tooltip: false,
    })

    let cleanupAnnotation
    viewer.on('load', () => {
      cleanupAnnotation = attachWindowAnnotation(viewer, containerRef.current)
    })

    return () => {
      if (cleanupAnnotation) cleanupAnnotation()
      viewer.destroy()
    }
  }, [])

  return (
    <>
      <div className="viewer" ref={containerRef} />
      <h1 className="title">Vista 360 Prototype</h1>
    </>
  )
}
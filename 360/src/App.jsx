import { useEffect, useRef } from 'react'
import * as pannellum from 'pannellum'
import 'pannellum/build/pannellum.css'

const PANORAMA_URL = `${import.meta.env.BASE_URL}pano/rheingauer-dom.jpg`

export default function App() {
  const containerRef = useRef(null)

  useEffect(() => {
    const viewer = pannellum.viewer(containerRef.current, {
      type: 'equirectangular',
      panorama: PANORAMA_URL,
      autoLoad: true,
      // Interaction: drag to look around, wheel + pinch to zoom.
      mouseZoom: true,
      keyboardZoom: true,
      // Keep the UI minimal: hide the built-in toolbar and compass.
      showControls: false,
      compass: false,
      tooltip: false,
    })
    return () => viewer.destroy()
  }, [])

  return (
    <>
      <div className="viewer" ref={containerRef} />
      <h1 className="title">Vista 360 Prototype</h1>
    </>
  )
}

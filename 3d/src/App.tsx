import { useMemo, useState } from "react";
import { BuildingViewer } from "./BuildingViewer";
import { demoBuilding, FLOOR_PLAN_COORDINATES } from "./floorPlan";
import { generateBuildingModel } from "./geometryGenerator";

type SelectedElement = {
  type: "floor" | "room" | "wall" | "door" | "window";
  id: string;
  floorId: string;
};

const buildingModel = generateBuildingModel(demoBuilding);
const totalFloorArea = buildingModel.floors.reduce((total, floor) => total + floor.area, 0);

export default function App() {
  const [selectedFloorId, setSelectedFloorId] = useState("all");
  const [selectedElement, setSelectedElement] = useState<SelectedElement | null>(null);

  const selectedInfo = useMemo(() => {
    if (!selectedElement) return null;

    if (selectedElement.type === "floor") {
      const floor = buildingModel.spatialElements.floors.find((entry) => entry.id === selectedElement.id);
      if (!floor) return null;
      return {
        title: "Floor",
        rows: [
          ["Name", floor.name],
          ["Elevation", `${floor.elevation.toFixed(2)} m`],
          ["Floor-to-floor", `${floor.floorToFloorHeight.toFixed(2)} m`],
        ],
      };
    }

    if (selectedElement.type === "room") {
      const room = buildingModel.spatialElements.rooms.find((entry) => entry.id === selectedElement.id);
      if (!room) return null;
      return {
        title: "Room",
        rows: [
          ["Area", `${room.area.toFixed(2)} m²`],
          ["Width", `${room.dimensions.width.toFixed(2)} m`],
          ["Length", `${room.dimensions.length.toFixed(2)} m`],
          ["Floor", demoBuilding.floors.find((floor) => floor.id === room.floorId)?.name ?? room.floorId],
        ],
      };
    }

    if (selectedElement.type === "wall") {
      const wall = buildingModel.spatialElements.walls.find((entry) => entry.id === selectedElement.id);
      if (!wall) return null;
      return {
        title: "Wall",
        rows: [
          ["Length", `${wall.length.toFixed(2)} m`],
          ["Thickness", `${wall.thickness.toFixed(2)} m`],
          ["Height", `${wall.height.toFixed(2)} m`],
          ["Floor", demoBuilding.floors.find((floor) => floor.id === wall.floorId)?.name ?? wall.floorId],
        ],
      };
    }

    if (selectedElement.type === "door") {
      const door = buildingModel.spatialElements.doors.find((entry) => entry.id === selectedElement.id);
      if (!door) return null;
      return {
        title: "Door",
        rows: [
          ["Width", `${door.width.toFixed(2)} m`],
          ["Height", `${door.height.toFixed(2)} m`],
          ["Host wall", door.hostWallId],
          ["Floor", demoBuilding.floors.find((floor) => floor.id === door.floorId)?.name ?? door.floorId],
        ],
      };
    }

    const window = buildingModel.spatialElements.windows.find((entry) => entry.id === selectedElement.id);
    if (!window) return null;
    return {
      title: "Window",
      rows: [
        ["Width", `${window.width.toFixed(2)} m`],
        ["Height", `${window.height.toFixed(2)} m`],
        ["Sill Height", `${window.sillHeight.toFixed(2)} m`],
        ["Floor", demoBuilding.floors.find((floor) => floor.id === window.floorId)?.name ?? window.floorId],
      ],
    };
  }, [selectedElement]);

  return (
    <main>
      <section className="intro">
        <p className="eyebrow">Deterministic geometry prototype</p>
        <h1>Villa, floor by floor</h1>
        <p className="summary">A deterministic residential building model, generated from three structured 2D plans and stacked at explicit elevations.</p>
        <label className="floor-selector" htmlFor="floor-select">Inspect floor
          <select id="floor-select" value={selectedFloorId} onChange={(event) => setSelectedFloorId(event.target.value)}>
            <option value="all">All Floors</option>
            {demoBuilding.floors.map((floor) => <option key={floor.id} value={floor.id}>{floor.name}</option>)}
          </select>
        </label>
        <dl className="metrics">
          <div><dt>Floors</dt><dd>{demoBuilding.floors.length}</dd></div>
          <div><dt>Wall boxes</dt><dd>{buildingModel.wallBoxes.length}</dd></div>
          <div><dt>Rooms</dt><dd>{buildingModel.floors.length}</dd></div>
          <div><dt>Stair treads</dt><dd>{buildingModel.stairs.length}</dd></div>
          <div><dt>Doors</dt><dd>{buildingModel.openings.filter((opening) => opening.type === "door").length}</dd></div>
          <div><dt>Windows</dt><dd>{buildingModel.openings.filter((opening) => opening.type === "window").length}</dd></div>
          <div><dt>Openings</dt><dd>{buildingModel.openings.length}</dd></div>
          <div><dt>Roof</dt><dd>{buildingModel.roof.height.toFixed(2)} m</dd></div>
          <div><dt>Floor area</dt><dd>{totalFloorArea.toFixed(2)} m²</dd></div>
        </dl>
        <div className="legend" aria-label="Geometry legend">
          <p><span className="swatch swatch-exterior" />Exterior walls</p>
          <p><span className="swatch swatch-interior" />Interior walls</p>
          <p><span className="swatch swatch-door" />Door openings</p>
          <p><span className="swatch swatch-window" />Window openings</p>
          <p><span className="swatch swatch-floor" />Floor surfaces</p>
        </div>
        <div className="selection-panel" aria-live="polite">
          {selectedInfo ? (
            <>
              <h2>{selectedInfo.title}</h2>
              <dl>
                {selectedInfo.rows.map(([label, value]) => (
                  <div key={`${selectedInfo.title}-${label}`}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </>
          ) : (
            <>
              <h2>Selection</h2>
              <p>Click a floor, room, wall, door, or window in the 3D model.</p>
            </>
          )}
        </div>
        <p className="summary coordinate-note">
          2D axes: X east-west, Y north-south. 3D mapping: X maps to X, Y maps to -Z, and height maps to Y. Each plan origin is the same south-west global corner; elevation is explicit.
          Units are {FLOOR_PLAN_COORDINATES.unit}. Measurements are derived from canonical geometry, not rendered pixels.
        </p>
      </section>
      <BuildingViewer model={buildingModel} selectedFloorId={selectedFloorId} selectedElement={selectedElement} onSelectElement={setSelectedElement} />
    </main>
  );
}
import { useState } from "react";
import { BuildingViewer } from "./BuildingViewer";
import { demoBuilding, FLOOR_PLAN_COORDINATES } from "./floorPlan";
import { generateBuildingModel } from "./geometryGenerator";

const buildingModel = generateBuildingModel(demoBuilding);
const totalFloorArea = buildingModel.floors.reduce((total, floor) => total + floor.area, 0);

export default function App() {
  const [selectedFloorId, setSelectedFloorId] = useState("all");

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
        <p className="summary coordinate-note">
          2D axes: X east-west, Y north-south. 3D mapping: X maps to X, Y maps to -Z, and height maps to Y. Each plan origin is the same south-west global corner; elevation is explicit.
          Units are {FLOOR_PLAN_COORDINATES.unit}.
        </p>
      </section>
      <BuildingViewer model={buildingModel} selectedFloorId={selectedFloorId} />
    </main>
  );
}
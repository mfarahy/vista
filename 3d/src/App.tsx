import { BuildingViewer } from "./BuildingViewer";
import { demoFloorPlan, FLOOR_PLAN_COORDINATES } from "./floorPlan";
import { generateBuildingModel } from "./geometryGenerator";

const buildingModel = generateBuildingModel(demoFloorPlan);
const totalFloorArea = buildingModel.floors.reduce((total, floor) => total + floor.area, 0);

export default function App() {
  return (
    <main>
      <section className="intro">
        <p className="eyebrow">Deterministic geometry prototype</p>
        <h1>2D Floor Plan to 3D Building</h1>
        <p className="summary">Structured meter-based data is converted into exact wall segments with real door/window openings and room floor surfaces.</p>
        <dl className="metrics">
          <div><dt>Walls</dt><dd>{demoFloorPlan.walls.length}</dd></div>
          <div><dt>Wall boxes</dt><dd>{buildingModel.wallBoxes.length}</dd></div>
          <div><dt>Rooms</dt><dd>{demoFloorPlan.rooms.length}</dd></div>
          <div><dt>Doors</dt><dd>{demoFloorPlan.doors.length}</dd></div>
          <div><dt>Windows</dt><dd>{demoFloorPlan.windows.length}</dd></div>
          <div><dt>Openings</dt><dd>{buildingModel.openings.length}</dd></div>
          <div><dt>Wall height</dt><dd>{demoFloorPlan.walls[0].height.toFixed(2)} m</dd></div>
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
          2D axes: X east-west, Y north-south. 3D mapping: X maps to X, Y maps to -Z, and height maps to Y. Origin at the south-west floor corner.
          Units are {FLOOR_PLAN_COORDINATES.unit}.
        </p>
      </section>
      <BuildingViewer model={buildingModel} />
    </main>
  );
}
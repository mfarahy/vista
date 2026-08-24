import { BuildingViewer } from "./BuildingViewer";
import { demoFloorPlan } from "./floorPlan";
import { generateBuildingModel } from "./geometryGenerator";

const buildingModel = generateBuildingModel(demoFloorPlan);
const totalFloorArea = buildingModel.floors.reduce((total, floor) => total + floor.area, 0);

export default function App() {
  return (
    <main>
      <section className="intro">
        <p className="eyebrow">Deterministic geometry prototype</p>
        <h1>2D Floor Plan to 3D Building</h1>
        <p className="summary">Structured metric data is converted into exact wall boxes, opening gaps, and room floor surfaces.</p>
        <dl className="metrics">
          <div><dt>Walls</dt><dd>{demoFloorPlan.walls.length}</dd></div>
          <div><dt>Rooms</dt><dd>{demoFloorPlan.rooms.length}</dd></div>
          <div><dt>Doors</dt><dd>{demoFloorPlan.doors.length}</dd></div>
          <div><dt>Windows</dt><dd>{demoFloorPlan.windows.length}</dd></div>
          <div><dt>Wall height</dt><dd>{demoFloorPlan.walls[0].height.toFixed(2)} m</dd></div>
          <div><dt>Floor area</dt><dd>{totalFloorArea.toFixed(2)} m²</dd></div>
        </dl>
      </section>
      <BuildingViewer model={buildingModel} />
    </main>
  );
}
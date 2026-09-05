import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  clonePlan,
  planAddDoor,
  planAddWall,
  planAddWindow,
  planDeleteOpenings,
  planDeleteWalls,
  planMoveDoor,
  planMoveWall,
  planMoveWindow,
  planRenameRoom,
  planSetDoorSwing,
  planSetDoorWidth,
  planSetWallEndpoint,
  planSetWallLength,
  planSetWindowWidth,
  planSplitWall,
  pushHistory,
  redoStep,
  undoStep,
  withRooms,
} from './plan-ops.js';
import { openingEndpoints } from './geometry.js';
import { createWall, emptyFloorPlan, type FloorPlan } from './model.js';

function rectPlan(): FloorPlan {
  let plan = emptyFloorPlan();
  const walls = [
    createWall({ x: 0, y: 0 }, { x: 4, y: 0 }),
    createWall({ x: 4, y: 0 }, { x: 4, y: 3 }),
    createWall({ x: 4, y: 3 }, { x: 0, y: 3 }),
    createWall({ x: 0, y: 3 }, { x: 0, y: 0 }),
  ];
  for (const wall of walls) plan = planAddWall(plan, wall);
  return plan;
}

describe('plan operations', () => {
  it('detects rooms when walls close', () => {
    const plan = rectPlan();
    assert.equal(plan.rooms.length, 1);
    assert.equal(plan.rooms[0].areaM2, 12);
  });

  it('drags a shared endpoint and keeps connected walls joined', () => {
    const plan = rectPlan();
    const topWall = plan.walls[0];
    const moved = planSetWallEndpoint(plan, topWall.id, 'end', { x: 5, y: 0 });
    assert.ok(moved);
    // The right wall shared that corner: it stretched along.
    const right = moved.walls.find((wall) => wall.id === plan.walls[1].id);
    assert.ok(right);
    assert.deepEqual(right.start, { x: 5, y: 0 });
    assert.deepEqual(right.end, { x: 4, y: 3 });
    // Room detection re-ran on the new geometry.
    assert.equal(moved.rooms.length, 1);
  });

  it('rejects endpoint drags that would collapse a wall', () => {
    const plan = rectPlan();
    assert.equal(planSetWallEndpoint(plan, plan.walls[0].id, 'end', { x: 0.01, y: 0 }), null);
  });

  it('resizes a wall to an exact length and keeps the corner closed', () => {
    const plan = rectPlan();
    const resized = planSetWallLength(plan, plan.walls[0].id, 6);
    assert.ok(resized);
    assert.deepEqual(resized.walls[0].end, { x: 6, y: 0 });
    const right = resized.walls.find((wall) => wall.id === plan.walls[1].id);
    assert.deepEqual(right?.start, { x: 6, y: 0 });
    assert.equal(planSetWallLength(plan, plan.walls[0].id, 0.01), null);
  });

  it('attaches doors to walls and moves them along the wall', () => {
    const plan = rectPlan();
    const added = planAddDoor(plan, plan.walls[0].id, 0.25, 0.9, 'left');
    assert.ok(added);
    assert.equal(added.plan.doors.length, 1);
    const door = added.door;
    let ends = openingEndpoints(plan.walls[0], door.centerT, door.width);
    assert.deepEqual([ends.p1.x, ends.p2.x], [0.55, 1.45]);
    const slid = planMoveDoor(added.plan, door.id, 0.75);
    assert.ok(slid);
    ends = openingEndpoints(plan.walls[0], slid.doors[0].centerT, door.width);
    assert.deepEqual([ends.p1.x, ends.p2.x], [2.55, 3.45]);
  });

  it('edits door width and swing', () => {
    const plan = rectPlan();
    const added = planAddDoor(plan, plan.walls[0].id, 0.5);
    assert.ok(added);
    const widened = planSetDoorWidth(added.plan, added.door.id, 1.2);
    assert.ok(widened);
    assert.equal(widened.doors[0].width, 1.2);
    const swung = planSetDoorSwing(widened, added.door.id, 'right');
    assert.ok(swung);
    assert.equal(swung.doors[0].swing, 'right');
  });

  it('attaches windows and keeps them on wall edits', () => {
    const plan = rectPlan();
    const added = planAddWindow(plan, plan.walls[0].id, 0.5, 1.2);
    assert.ok(added);
    const widened = planSetWindowWidth(added.plan, added.window.id, 2);
    assert.ok(widened);
    assert.equal(widened.windows[0].width, 2);
    const slid = planMoveWindow(widened, added.window.id, 0.1);
    assert.ok(slid);
    assert.equal(slid.windows[0].centerT, 0.1);
  });

  it('moves a wall and stretches only exactly-shared endpoints', () => {
    // Documented limitation: a wall that merely crosses another wall
    // mid-segment (T-touch without a shared endpoint) does not follow.
    let plan = emptyFloorPlan();
    const through = createWall({ x: 0, y: 0 }, { x: 4, y: 0 });
    const tee = createWall({ x: 2, y: 0 }, { x: 2, y: 3 });
    plan = planAddWall(plan, through);
    plan = planAddWall(plan, tee);
    const moved = planMoveWall(plan, tee.id, { x: 1, y: 0 });
    assert.ok(moved);
    const stayed = moved.walls.find((wall) => wall.id === through.id);
    assert.deepEqual(stayed?.start, { x: 0, y: 0 });
    assert.deepEqual(stayed?.end, { x: 4, y: 0 });
  });

  it('moves a wall and keeps attached doors/windows positioned', () => {    let plan = rectPlan();
    const wallId = plan.walls[0].id;
    const doorAdded = planAddDoor(plan, wallId, 0.5, 1);
    assert.ok(doorAdded);
    plan = doorAdded.plan;
    const windowAdded = planAddWindow(plan, wallId, 0.25, 1);
    assert.ok(windowAdded);
    plan = windowAdded.plan;
    const moved = planMoveWall(plan, wallId, { x: 10, y: 0 });
    assert.ok(moved);
    const wall = moved.walls.find((w) => w.id === wallId);
    assert.ok(wall);
    // Fractional attachment is unchanged; absolute geometry follows the wall.
    assert.equal(moved.doors[0].centerT, 0.5);
    const doorEnds = openingEndpoints(wall, moved.doors[0].centerT, moved.doors[0].width);
    assert.deepEqual([doorEnds.p1.x, doorEnds.p2.x], [11.5, 12.5]);
    const windowEnds = openingEndpoints(wall, moved.windows[0].centerT, moved.windows[0].width);
    assert.deepEqual([windowEnds.p1.x, windowEnds.p2.x], [10.5, 11.5]);
  });

  it('deletes a wall together with its attached openings', () => {
    let plan = rectPlan();
    const wallId = plan.walls[0].id;
    const doorAdded = planAddDoor(plan, wallId, 0.5);
    assert.ok(doorAdded);
    plan = doorAdded.plan;
    const removed = planDeleteWalls(plan, [wallId]);
    assert.equal(removed.walls.length, 3);
    assert.equal(removed.doors.length, 0);
    assert.equal(removed.rooms.length, 0);
  });

  it('deletes openings directly and renames rooms', () => {
    let plan = rectPlan();
    const doorAdded = planAddDoor(plan, plan.walls[0].id, 0.5);
    assert.ok(doorAdded);
    plan = doorAdded.plan;
    plan = planDeleteOpenings(plan, [doorAdded.door.id], []);
    assert.equal(plan.doors.length, 0);
    const renamed = planRenameRoom(plan, plan.rooms[0].id, 'Living Room');
    assert.ok(renamed);
    assert.equal(renamed.rooms[0].name, 'Living Room');
    assert.equal(planRenameRoom(plan, 'missing', 'X'), null);
  });

  it('supports undo/redo over mixed operations', () => {    let current = emptyFloorPlan();
    let past: FloorPlan[] = [];
    let future: FloorPlan[] = [];
    const commit = (next: FloorPlan) => {
      past = pushHistory(past, clonePlan(current), 100);
      future = [];
      current = next;
    };
    commit(planAddWall(current, createWall({ x: 0, y: 0 }, { x: 2, y: 0 })));
    const withDoor = planAddDoor(current, current.walls[0].id, 0.5);
    assert.ok(withDoor);
    commit(withDoor.plan);
    assert.equal(current.doors.length, 1);
    const undone = undoStep(past, future, clonePlan(current));
    assert.ok(undone);
    past = undone.past;
    future = undone.future;
    current = undone.current;
    assert.equal(current.doors.length, 0);
    assert.equal(current.walls.length, 1);
    const redone = redoStep(past, future, clonePlan(current));
    assert.ok(redone);
    current = redone.current;
    assert.equal(current.doors.length, 1);
    assert.equal(undoStep([], [], current), null);
    assert.equal(redoStep(past, [], current), null);
  });
});

describe('phase 5 correction operations', () => {
  it('splits a wall into two segments at the midpoint', () => {
    const plan = rectPlan();
    const wallId = plan.walls[0].id;
    const result = planSplitWall(plan, wallId, 0.5);
    assert.ok(result);
    assert.equal(result.plan.walls.length, 5);
    const [first, second] = result.walls;
    assert.equal(first.id, `${wallId}-a`);
    assert.equal(second.id, `${wallId}-b`);
    assert.deepEqual(first.start, { x: 0, y: 0 });
    assert.deepEqual(first.end, { x: 2, y: 0 });
    assert.deepEqual(second.start, { x: 2, y: 0 });
    assert.deepEqual(second.end, { x: 4, y: 0 });
    assert.equal(first.thickness, plan.walls[0].thickness);
    // The room stays closed across the split.
    assert.equal(result.plan.rooms.length, 1);
    assert.equal(result.plan.rooms[0].areaM2, 12);
  });

  it('redistributes openings deterministically on split', () => {
    let plan = rectPlan();
    const wallId = plan.walls[0].id;
    const doorAdded = planAddDoor(plan, wallId, 0.25, 1.0, 'right');
    assert.ok(doorAdded);
    plan = doorAdded.plan;
    const windowAdded = planAddWindow(plan, wallId, 0.75, 1.2);
    assert.ok(windowAdded);
    plan = windowAdded.plan;
    const result = planSplitWall(plan, wallId, 0.5);
    assert.ok(result);
    // Door center (1m) falls on segment A, window center (3m) on segment B.
    assert.equal(result.plan.doors.length, 1);
    assert.equal(result.plan.doors[0].wallId, `${wallId}-a`);
    assert.ok(Math.abs(result.plan.doors[0].centerT - 0.5) < 1e-9);
    assert.equal(result.plan.doors[0].width, 1.0);
    assert.equal(result.plan.doors[0].swing, 'right');
    assert.equal(result.plan.windows.length, 1);
    assert.equal(result.plan.windows[0].wallId, `${wallId}-b`);
    assert.ok(Math.abs(result.plan.windows[0].centerT - 0.5) < 1e-9);
    assert.equal(result.plan.windows[0].width, 1.2);
  });

  it('rejects splits that would create degenerate segments', () => {
    const plan = rectPlan();
    const wallId = plan.walls[0].id;
    assert.equal(planSplitWall(plan, wallId, 0), null);
    assert.equal(planSplitWall(plan, wallId, 1), null);
    assert.equal(planSplitWall(plan, wallId, 0.001), null);
    assert.equal(planSplitWall(plan, wallId, 0.999), null);
    assert.equal(planSplitWall(plan, wallId, Number.NaN), null);
    assert.equal(planSplitWall(plan, 'missing', 0.5), null);
  });

  it('carries room names across a wall split', () => {
    let plan = rectPlan();
    const renamed = planRenameRoom(plan, plan.rooms[0].id, 'Bedroom');
    assert.ok(renamed);
    plan = renamed;
    const result = planSplitWall(plan, plan.walls[0].id, 0.5);
    assert.ok(result);
    assert.equal(result.plan.rooms.length, 1);
    assert.equal(result.plan.rooms[0].name, 'Bedroom');
  });

  it('deletes a wall and recreates the room with a replacement', () => {
    const plan = rectPlan();
    const removed = planDeleteWalls(plan, [plan.walls[0].id]);
    assert.equal(removed.walls.length, 3);
    assert.equal(removed.rooms.length, 0);
    // Draw the replacement wall: the room closes again with recalculated area.
    const recreated = planAddWall(removed, createWall({ x: 0, y: 0 }, { x: 4, y: 0 }));
    assert.equal(recreated.rooms.length, 1);
    assert.equal(recreated.rooms[0].areaM2, 12);
  });

  it('resizes a wall to a typed metric length', () => {
    const plan = rectPlan();
    const resized = planSetWallLength(plan, plan.walls[0].id, 4.2);
    assert.ok(resized);
    assert.deepEqual(resized.walls[0].end, { x: 4.2, y: 0 });
  });

  it('recalculates room area after wall modification', () => {
    const plan = rectPlan();
    // Drag the shared bottom-right corner outwards.
    const moved = planSetWallEndpoint(plan, plan.walls[1].id, 'end', { x: 6, y: 3 });
    assert.ok(moved);
    assert.equal(moved.rooms.length, 1);
    assert.equal(moved.rooms[0].areaM2, 15);
  });

  it('keeps room names when a wall moves without topology change', () => {
    let plan = rectPlan();
    const renamed = planRenameRoom(plan, plan.rooms[0].id, 'Bedroom');
    assert.ok(renamed);
    plan = renamed;
    const moved = planMoveWall(plan, plan.walls[1].id, { x: 1, y: 0 });
    assert.ok(moved);
    assert.equal(moved.rooms.length, 1);
    assert.equal(moved.rooms[0].name, 'Bedroom');
    assert.equal(moved.rooms[0].areaM2, 15);
  });

  it('splits a named room deterministically with a divider wall', () => {
    let plan = rectPlan();
    const renamed = planRenameRoom(plan, plan.rooms[0].id, 'Bedroom');
    assert.ok(renamed);
    plan = renamed;
    const divided = planAddWall(plan, createWall({ x: 2, y: 0 }, { x: 2, y: 3 }));
    assert.equal(divided.rooms.length, 2);
    const areas = divided.rooms.map((room) => room.areaM2).sort((a, b) => a - b);
    assert.deepEqual(areas, [6, 6]);
    // Deterministic carryover: both children inherit the containing name.
    assert.ok(divided.rooms.every((room) => room.name === 'Bedroom'));
  });

  it('reversing a door swing keeps its position and width', () => {
    const plan = rectPlan();
    const added = planAddDoor(plan, plan.walls[0].id, 0.3, 1.0, 'left');
    assert.ok(added);
    const swung = planSetDoorSwing(added.plan, added.door.id, 'right');
    assert.ok(swung);
    assert.equal(swung.doors[0].swing, 'right');
    assert.equal(swung.doors[0].centerT, 0.3);
    assert.equal(swung.doors[0].width, 1.0);
  });

  it('deleting a door keeps the wall and the room', () => {
    let plan = rectPlan();
    const wallsBefore = plan.walls.map((wall) => ({ ...wall }));
    const added = planAddDoor(plan, plan.walls[0].id, 0.5);
    assert.ok(added);
    plan = added.plan;
    const removed = planDeleteOpenings(plan, [added.door.id], []);
    assert.equal(removed.doors.length, 0);
    assert.deepEqual(removed.walls, wallsBefore);
    assert.equal(removed.rooms.length, 1);
  });

  it('moving a door or window never moves its host wall', () => {
    let plan = rectPlan();
    const wallsBefore = plan.walls.map((wall) => ({ ...wall }));
    const doorAdded = planAddDoor(plan, plan.walls[0].id, 0.2, 0.9, 'left');
    assert.ok(doorAdded);
    plan = doorAdded.plan;
    const windowAdded = planAddWindow(plan, plan.walls[0].id, 0.8, 1.2);
    assert.ok(windowAdded);
    plan = windowAdded.plan;
    const slidDoor = planMoveDoor(plan, doorAdded.door.id, 0.7);
    assert.ok(slidDoor);
    assert.deepEqual(slidDoor.walls, wallsBefore);
    assert.equal(slidDoor.doors[0].centerT, 0.7);
    const slidWindow = planMoveWindow(slidDoor, windowAdded.window.id, 0.4);
    assert.ok(slidWindow);
    assert.deepEqual(slidWindow.walls, wallsBefore);
    assert.equal(slidWindow.windows[0].centerT, 0.4);
    // Resizing openings also leaves wall geometry untouched.
    const widenedDoor = planSetDoorWidth(slidWindow, doorAdded.door.id, 1.2);
    assert.ok(widenedDoor);
    assert.deepEqual(widenedDoor.walls, wallsBefore);
    const widenedWindow = planSetWindowWidth(widenedDoor, windowAdded.window.id, 2.0);
    assert.ok(widenedWindow);
    assert.deepEqual(widenedWindow.walls, wallsBefore);
  });

  it('deleting a window keeps the wall and the room', () => {
    let plan = rectPlan();
    const wallsBefore = plan.walls.map((wall) => ({ ...wall }));
    const added = planAddWindow(plan, plan.walls[0].id, 0.5, 1.2);
    assert.ok(added);
    plan = added.plan;
    const removed = planDeleteOpenings(plan, [], [added.window.id]);
    assert.equal(removed.windows.length, 0);
    assert.deepEqual(removed.walls, wallsBefore);
    assert.equal(removed.rooms.length, 1);
  });

  it('deleting one wall keeps openings on other walls', () => {
    let plan = rectPlan();
    const keptWallId = plan.walls[1].id;
    const doorOnDeleted = planAddDoor(plan, plan.walls[0].id, 0.5);
    assert.ok(doorOnDeleted);
    plan = doorOnDeleted.plan;
    const doorOnKept = planAddDoor(plan, keptWallId, 0.5);
    assert.ok(doorOnKept);
    plan = doorOnKept.plan;
    const removed = planDeleteWalls(plan, [plan.walls[0].id]);
    assert.equal(removed.walls.length, 3);
    assert.equal(removed.doors.length, 1);
    assert.equal(removed.doors[0].id, doorOnKept.door.id);
  });

  it('keeps imported fallback rooms until real detection finds rooms', () => {
    const fallback = {
      id: 'room-imported-1',
      name: 'Bedroom',
      polygon: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 3 },
        { x: 0, y: 3 },
      ],
      areaM2: 12,
      wallIds: [],
    };
    const plan = withRooms({
      ...emptyFloorPlan(),
      walls: [createWall({ x: 0, y: 0 }, { x: 4, y: 0 })],
      rooms: [fallback],
    });
    assert.equal(plan.rooms.length, 1);
    assert.equal(plan.rooms[0].name, 'Bedroom');
  });
});

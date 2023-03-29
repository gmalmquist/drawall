class DrawRoomTool extends Tool {
  private drawingRoom: Room | null = null;

  constructor() {
    super('room tool');

    this.events.addDragListener<Room>({
      onStart: e => {
        const start = App.ui.snapPoint(e.start);
        const walls: Wall[] = Array(4).fill(0)
          .map(_ => App.ecs.createEntity().add(Wall));
        for (let i = 0; i < walls.length; i++) {
          walls[i].src.pos = start;
          walls[i].dst = walls[(i + 1) % walls.length].src;
        }
        const room = App.ecs.createEntity().add(Room);
        this.drawingRoom = room;
        walls.forEach(wall => room.addWall(wall));
        return room;
      },
      onUpdate: (e, room) => {
        const diagonal = new SpaceEdge(
          App.ui.snapPoint(e.start),
          App.ui.snapPoint(e.position),
        );
        const horizontal = diagonal.vector.onAxis(Vector(Axis.X, 'screen'));
        const vertical = diagonal.vector.onAxis(Vector(Axis.Y, 'screen'));

        const negH = horizontal.get('screen').dot(Axis.X) < 0;
        const negV = vertical.get('screen').dot(Axis.Y) < 0;

        // allow drawing walls inside-out (for e.g. interior partitions) if
        // the mouse is dragged to the up-left. 
        const reversed = negH && negV;

        for (let i = 0; i < room.walls.length; i++) {
          let pos = diagonal.src;
          const rightEdge = (i === 1 || i === 2);
          const bottomEdge = (i >= 2);
          if (rightEdge !== negH) pos = pos.plus(horizontal);
          if (bottomEdge !== negV) pos = pos.plus(vertical);
          if (reversed) {
            room.walls[room.walls.length - i - 1].dst.pos = pos;
          } else {
            room.walls[i].src.pos = pos;
          }
        }
      },
      onEnd: (e, room) => {
        this.drawingRoom = null;
        this.mergeIntersectingRooms(room);
      },
    });
  }

  override get icon(): URL {
    return Icons.roomTool;
  }

  override onToolSelected() {
    App.ui.clearSelection();
  }

  get cursor(): Cursor {
    return 'crosshair';
  }

  override setup() {}

  override update() {
    const room = this.drawingRoom;
    if (room === null) return;
    for (const other of App.ecs.getComponents(Room)) {
      if (other === room) continue;
      const intersections = this.getIntersections(room, other);
      for (const hit of intersections) {
        App.canvas.strokeStyle = 'blue';
        App.canvas.lineWidth = 1;
        App.canvas.strokeCircle(hit.position, Distance(10, 'screen'));
      }
    }
  }

  private mergeIntersectingRooms(room: Room) {
    let operand = room;
    for (const other of App.ecs.getComponents(Room)) {
      if (other === operand) continue;
      const result = this.mergeRooms(other, operand);
      operand = result.room;
      if (operand === null) {
        return;
      }
    }
  }

  private getIntersections(one: Room, two: Room): RoomIntersectionPoint[] {
    const results = [];
    for (const wall1 of one.walls) {
      for (const wall2 of two.walls) {
        const position = wall1.getEdge().intersection(wall2.getEdge());
        if (position === null) continue;
        results.push({
          position,
          wall1,
          wall2
        });
      }
    }
    return results;
  }

  private mergeLoops(loopA: Wall[], loopB: Wall[]): LoopMergeResult {
    const polyB = new Polygon(loopB.map(w => w.src.pos));
    const insideB = new Set(loopA.filter(w => polyB.contains(w.src.pos)));

    const frontier = [...loopA];
    const loopAWalls = new Set<Wall>(loopA);
    const loopBWalls = new Set<Wall>(loopB);

    let intersectionCount = 0;

    while (frontier.length > 0) {
      const wa = frontier.pop()!;
      loopAWalls.add(wa);
      const ea = wa.getEdge();

      for (const wb of new Set(loopBWalls)) {
        const hit = ea.intersection(wb.getEdge());
        if (hit === null) {
          continue;
        }

        const splitA = wa.splitWall(hit);
        if (splitA === null) continue;
        const [wa0, wa1] = splitA;

        const splitB = wb.splitWall(hit);
        if (splitB === null) {
          // awkwardly, we have to un-split A now.
          wa0.dst.elideJoint();
          continue;
        }
        const [wb0, wb1] = splitB;

        intersectionCount++;

        loopAWalls.delete(wa);
        // splits of `wa` will be added
        // in next loop of the frontier

        loopBWalls.delete(wb);
        loopBWalls.add(wb0);
        loopBWalls.add(wb1);

        if (insideB.has(wa)) {
          insideB.add(wa0);
          wb0.dst = wa1.src;
          wa0.dst = wb1.src;
        } else {
          insideB.add(wa1);
          wa0.dst = wb1.src;
          wb0.dst = wa1.src;
        }

        frontier.push(wa0);
        frontier.push(wa1);

        // don't break more than one wall
        // at a time this way
        break;
      }
    }

    if (intersectionCount === 0) {
      if (insideB.size === loopA.length) {
        // A is fully inside B
        console.log('A fully inside B');
        loopA.forEach(w => w.entity.destroy());
        return { outcome: 'keep b', walls: loopB, };
      }
      const polyA = new Polygon(loopA.map(w => w.src.pos));
      if (loopB.every(w => polyA.contains(w.src.pos))) {
        // B is fully inside A
        console.log('B fully inside A');
        loopB.forEach(w => w.entity.destroy());
        return { outcome: 'keep a', walls: loopA, };
      }
      console.log('fully disjoint');
      // no intersection 
      return { outcome: 'keep both', walls: [] };
    }

    const rootAWalls = [...loopAWalls].filter(a => !insideB.has(a));

    // only choose the first loop
    const loop = rootAWalls[0]!.getConnectedLoop();
    const chosen = new Set(loop);
    for (const w of loopAWalls) {
      if (!chosen.has(w)) {
        w.entity.destroy();
      }
    }
    for (const w of loopBWalls) {
      if (!chosen.has(w)) {
        w.entity.destroy();
      }
    }
    console.log('loop:', loop);
    return { outcome: 'keep a', walls: loop };
  }

  private mergeRooms(one: Room, two: Room): RoomMergeResult {
    console.log(`mergeRooms(${one.name}, ${two.name})`);
    const { outcome, walls } = this.mergeLoops(one.loop, two.loop);
    if (outcome === 'keep both') {
      return { outcome, room: two };
    }
    if (outcome === 'keep a') {
      walls.forEach(w => one.addWall(w));
      two.entity.destroy();
      return { outcome, room: one };
    }
    if (outcome === 'keep b') {
      walls.forEach(w => two.addWall(w));
      one.entity.destroy();
      return { outcome, room: two };
    }
    return impossible(outcome);
  }

  wallClosure(starting: Wall[]): Set<Wall> {
    const frontier = [...starting];
    const visited = new Set<Wall>();
    while (frontier.length > 0) {
      const w = frontier.pop()!;
      if (visited.has(w)) {
        continue;
      }
      visited.add(w);
      const src = w.src.incoming;
      const dst = w.dst.outgoing;
      if (src !== null && !visited.has(src)) {
        frontier.push(src);
      }
      if (dst !== null && !visited.has(dst)) {
        frontier.push(dst);
      }
    }
    return visited;
  }
}

interface RoomMergeResult {
  outcome: 'keep a' | 'keep b' | 'keep both';
  room: Room;
}

interface LoopMergeResult {
  outcome: 'keep a' | 'keep b' | 'keep both';
  walls: Wall[];
}

interface RoomIntersectionPoint {
  position: Position;
  wall1: Wall;
  wall2: Wall;
}

App.tools.register(DrawRoomTool);

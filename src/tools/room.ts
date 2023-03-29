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

  private mergeRooms(roomA: Room, roomB: Room): RoomMergeResult {
    const eps = 0.001;
    const loopA = roomA.loop;
    const loopB = roomB.loop;
    const polyA = roomA.polygon;
    const polyB = roomB.polygon;
    if (loopA === null || polyA === null) {
      return { outcome: 'keep b', room: roomB };
    }
    if (loopB === null || polyB === null) {
      return { outcome: 'keep a', room: roomA };
    }
    const wallSetA = new Set(loopA);
    const wallSetB = new Set(loopB);

    const outsideWallsA = new Set(loopA.filter(w => !polyB.contains(w.src.pos)));
    const outsideWallsB = new Set(loopB.filter(w => !polyA.contains(w.src.pos)));

    const frontier = [...loopA];

    let intersectionCount = 0;

    const connect = (a: Wall, b: Wall) => {
      a.dst = b.src.shallowDup();
      b.src = a.dst;
    };

    const splitDepth = new Counter();
    const spliceCount = { val: 0 };

    const splice = (a0: Wall, a1: Wall, b0: Wall, b1: Wall) => {
      spliceCount.val++;

      connect(a0, b1);
      connect(b0, a1);

      const arrow = (w: Wall, l: string, c: string) => {
        const offset = w.outsideNormal.unit()
          .scale(Distance(5 * (1 + splitDepth.get(w.name)), 'screen'));
        const tangent = w.tangent.unit();
        const shrink = Distance(10, 'screen')
          .min(w.length.scale(0.25));
        const src = w.src.pos.splus(shrink, tangent).plus(offset);
        const dst = w.dst.pos.splus(shrink.neg(), tangent).plus(offset);
        App.ecs.createEntity().add(Arrow, src, dst, c, `${spliceCount.val}.${l}`);
      };

      arrow(a0, 'a0', 'blue');
      arrow(b1, 'b1', 'blue');

      arrow(b0, 'b0', 'red');
      arrow(a1, 'a1', 'red');
    };

    const verticesOverlap = (one: Wall[], two: Wall[]): boolean => {
      const dEps = Distance(eps, 'screen');
      return one.some(w => two.some(
        v => Distances.between(w.src.pos, v.src.pos).lt(dEps)
      ));
    };

    while (frontier.length > 0) {
      const wa = frontier.pop()!;
      wallSetA.add(wa);
      const ea = wa.getEdge();

      for (const wb of new Set(wallSetB)) {
        const eb = wb.getEdge();
        const hit = ea.intersection(eb);
        if (hit === null) {
          continue;
        }

        const sa = ea.unlerp(hit);
        if (sa < eps || sa > 1-eps) continue;

        const sb = eb.unlerp(hit);
        if (sb < eps || sb > 1-eps) continue;

        const splitA = wa.splitWall(hit);
        if (splitA === null) continue;
        const [wa0, wa1] = splitA;

        splitDepth.add(wa1.name, splitDepth.inc(wa0.name));  

        const splitB = wb.splitWall(hit);
        if (splitB === null) {
          // awkwardly, we have to un-split A now.
          wa0.dst.elideJoint();
          continue;
        }
        const [wb0, wb1] = splitB;

        splitDepth.add(wb1.name, splitDepth.inc(wb0.name));  

        intersectionCount++;

        splice(wa0, wa1, wb0, wb1);

        frontier.push(wa0);
        frontier.push(wa1);

        wallSetB.add(wb0);
        wallSetB.add(wb1);

        // don't break more than one wall
        // at a time this way
        break;
      }
    }

    if (intersectionCount === 0) {
      return { outcome: 'keep both', room: roomB };
    }

    const loops: Array<Wall[]> = [];
    const allWalls = [...wallSetA, ...wallSetB].filter(w => w.entity.isAlive);
    const seen = new Set<Wall>();

    for (const wall of allWalls) {
      if (seen.has(wall)) continue;
      const loop = wall.getConnectedLoop();
      loop.forEach(w => seen.add(w));
      loops.push(loop);
    }
    if (loops.length === 0) {
      // how ??? should be handled by intersections = 0 above.
      roomB.entity.destroy();
      return { outcome: 'keep a', room: roomA };
    }
    if (loops.length === 1) {
      loops[0].forEach(w => roomA.addWall(w));
      roomB.entity.destroy();
      return { outcome: 'keep a', room: roomA };
    }
    let iA = -1;
    let iB = -1;
    for (let i = 0; i < loops.length; i++) {
      if (loops[i].some(w => outsideWallsA.has(w))) {
        iA = i;
        break;
      }
    }
    for (let i = 0; i < loops.length; i++) {
      if (i !== iA && loops[i].some(w => outsideWallsB.has(w))) {
        iB = i;
        break;
      }
    }
    if (iA < 0) {
      iA = iB === 0 ? 1 : 0;
    }
    if (iB < 0) {
      iB = iA === 0 ? 1 : 0;
    }
  
    const keepB = !verticesOverlap(loops[iA], loops[iB]);

    for (let i = 0; i < loops.length; i++) {
      if (i === iA) {
        loops[i].forEach(w => roomA.addWall(w));
      } else if (i === iB) {
        loops[i].forEach(w => roomB.addWall(w));
      } else if (verticesOverlap(loops[i], loops[iA]) 
        || (keepB && verticesOverlap(loops[i], loops[iB]))) {
        loops[i].forEach(w => w.entity.destroy());
      } else {
        const room = App.ecs.createEntity().add(Room);
        loops[i].forEach(w => room.addWall(w));
      }
    }

    if (!keepB) {
      roomB.entity.destroy();
      return { outcome: 'keep a', room: roomA };
    }

    return { outcome: 'keep both', room: roomA };
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

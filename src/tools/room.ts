class DrawRoomTool extends Tool {
  private drawingRoom: Room | null = null;

  constructor() {
    super('room tool');

    this.events.addDragListener<Room>({
      onStart: e => {
        const walls: Wall[] = Array(4).fill(0)
          .map(_ => App.ecs.createEntity().add(Wall));
        for (let i = 0; i < walls.length; i++) {
          walls[i].src.pos = e.start;
          walls[i].dst = walls[(i + 1) % walls.length].src;
        }
        const room = App.ecs.createEntity().add(Room);
        this.drawingRoom = room;
        walls.forEach(wall => room.addWall(wall));
        return room;
      },
      onUpdate: (e, room) => {
        const diagonal = new SpaceEdge(e.start, e.position);
        const horizontal = diagonal.vector.onAxis(Vector(Axis.X, 'screen'));
        const vertical = diagonal.vector.onAxis(Vector(Axis.Y, 'screen'));

        const negH = horizontal.get('screen').dot(Axis.X) < 0;
        const negV = vertical.get('screen').dot(Axis.Y) < 0;

        // need to flip the walls around to keep the outsides on the outside. 
        const reversed = negH !== negV;

        for (let i = 0; i < room.walls.length; i++) {
          let pos = e.start;
          const rightEdge = (i === 1 || i === 2);
          const bottomEdge = (i >= 2);
          if (rightEdge !== negH) pos = pos.plus(horizontal);
          if (bottomEdge !== negV) pos = pos.plus(vertical);
          room.walls[i].src.pos = pos;
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
    for (const other of App.ecs.getComponents(Room)) {
      if (other === room) continue;
      this.mergeRooms(other, room);
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

  private mergeRooms(one: Room, two: Room) {
    // find wall joints that are guaranteed to be part of the new boundary.
    // NB: the second room will be the one we just drew, which is
    // conveniently guaranteed to be convex, so we just find all the points
    // in the first room that stick outside of the second one.
    const keepJoints = one.walls.map(wall => wall.src)
      .filter(joint => !two.containsConvex(joint.pos));
    if (keepJoints.length === 0) {
      // second room completely encloses the first one
      // (do we want to delete the first one in this case?)
      return; 
    }

    const norm = (w: Wall): Vector => w.getEdge().normal.to('screen').unit();
    const tan = (w: Wall): Vector => w.getEdge().vector.to('screen').unit();
    const intersections = this.getIntersections(one, two);
    if (intersections.length === 0) return;

    const splits = new DefaultMap<string, Set<Wall>>(() => new Set());

    const spliceWalls = (wall1: Wall, wall2: Wall, position: Position): boolean => {
      const split1 = wall1.splitWall(position);
      const split2 = wall2.splitWall(position);
      if (split1 === null || split2 === null) {
        return false;
      }
      const [a1, a2] = split1;
      const [b1, b2] = split2;

      [a1, a2].forEach(w => splits.get(wall1.name).add(w));
      [b1, b2].forEach(w => splits.get(wall2.name).add(w));

      // oke this is gonna be some indecipherable math to see how things
      // are oriented to know which things to connect to what.
      if (norm(a1).dot(tan(b2)).sign > 0) {
        // what we care about
        a1.dst = b2.src; 

        // leftovers
        b1.dst = b1.dst.shallowDup();
        a2.src = b1.dst;
      } else {
        // what we care about
        b1.dst = a2.src;

        // leftovers
        a1.dst = a1.dst.shallowDup();
        b2.src = a1.dst;
      }

      return true;
    };

    const spliceWallSplices = (wall1: Wall, wall2: Wall): boolean => {
      const wallsA = splits.has(wall1.name) ? splits.get(wall1.name) : [wall1];
      const wallsB = splits.has(wall2.name) ? splits.get(wall2.name) : [wall2];
      for (const wallA of wallsA) {
        for (const wallB of wallsB) {
          const e1 = wallA.getEdge();
          const e2 = wallB.getEdge();
          const point = e1.intersection(e2);
          if (point === null) continue;
          return spliceWalls(wallA, wallB, point);
        }
      }
      return false;
    };

    for (const hit of intersections) {
      if (splits.has(hit.wall1.name) || splits.has(hit.wall2.name)) {
        // have to retry the splitting the cross product of the previous splits.
        spliceWallSplices(hit.wall1, hit.wall2);
        continue;
      }
      spliceWalls(hit.wall1, hit.wall2, hit.position);
    }

    // this will have created a couple loops; find the outer one, and discard the
    // other.
    const loops: Array<Array<Wall>> = [];
    const goodWalls = new Set<Wall>();
    for (const joint of keepJoints) {
      if (joint.incoming === null || joint.outgoing === null) {
        console.warn('cannot keep bad joint:', joint);
        continue;
      }
      if (goodWalls.has(joint.incoming) || goodWalls.has(joint.outgoing)) {
        continue; // already found this joint in another loop.
      }
      const loop = joint.outgoing!.getConnectedLoop();
      loops.push(loop);
      loop.forEach(wall => goodWalls.add(wall));
    }

    const allWalls = new Set<Wall>();
    one.walls.forEach(w => allWalls.add(w));
    two.walls.forEach(w => allWalls.add(w));

    // discard extraneous walls
    for (const wall of allWalls) {
      if (!goodWalls.has(wall)) {
        wall.entity.destroy(); // >:3
      }
    }

    // make sure all walls are associated with the first room.
    for (const loop of loops) {
      for (const wall of loop) {
        one.addWall(wall);
      }
    }

    // destroy the now-empty second room.
    two.entity.destroy();
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

interface RoomIntersectionPoint {
  position: Position;
  wall1: Wall;
  wall2: Wall;
}

App.tools.register(DrawRoomTool);

import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const TMP_DIR = path.join("/tmp", "xor_bomb_rooms");

// In-Memory Fast Cache เลเยอร์แรก เพื่อลด I/O Disk
const memoryCache: Record<string, any> = {};

async function ensureDir() {
  try {
    await fs.mkdir(TMP_DIR, { recursive: true });
  } catch {}
}
ensureDir();

// บันทึกสถานะห้องทั้ง Memory และ Disk แบบ Asynchronous
async function saveRoom(roomId: string, data: any) {
  memoryCache[roomId] = data;
  try {
    const filePath = path.join(TMP_DIR, `${roomId}.json`);
    await fs.writeFile(filePath, JSON.stringify(data), "utf8");
  } catch (err) {
    console.error("Save room disk error:", err);
  }
}

// อ่านสถานะห้องจาก Memory ก่อน หากไม่มีค่อยดึงจาก Disk
async function getRoom(roomId: string) {
  if (memoryCache[roomId]) return memoryCache[roomId];
  try {
    const filePath = path.join(TMP_DIR, `${roomId}.json`);
    const content = await fs.readFile(filePath, "utf8");
    const data = JSON.parse(content);
    memoryCache[roomId] = data;
    return data;
  } catch {
    return null;
  }
}

const noCacheHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  "Pragma": "no-cache",
  "Expires": "0",
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const roomId = searchParams.get("roomId")?.toUpperCase().trim();

  if (!roomId) {
    return NextResponse.json({ error: "Missing roomId" }, { status: 400, headers: noCacheHeaders });
  }

  const room = await getRoom(roomId);
  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404, headers: noCacheHeaders });
  }

  return NextResponse.json(room, { headers: noCacheHeaders });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, roomId: rawRoomId, data } = body;
    const roomId = rawRoomId?.toUpperCase().trim();

    if (!roomId) {
      return NextResponse.json({ error: "Missing roomId" }, { status: 400, headers: noCacheHeaders });
    }

    let room = await getRoom(roomId);

    if (action === "CREATE") {
      room = {
        id: roomId,
        status: "LOBBY",
        defuserJoined: false,
        targetWord: data?.targetWord || "CAT",
        secretKey: data?.secretKey || "BAT",
        cipherHex: data?.cipherHex || "",
        timeLimit: Number(data?.timeLimit) || 120,
        startTime: null,
        lastUpdate: Date.now(),
      };
      await saveRoom(roomId, room);
      return NextResponse.json({ success: true, room }, { headers: noCacheHeaders });
    }

    if (action === "JOIN") {
      if (!room) {
        return NextResponse.json({ error: "Room not found" }, { status: 404, headers: noCacheHeaders });
      }
      room.defuserJoined = true;
      room.lastUpdate = Date.now();
      await saveRoom(roomId, room);
      return NextResponse.json({ success: true, room }, { headers: noCacheHeaders });
    }

    if (action === "ARM") {
      if (!room) {
        return NextResponse.json({ error: "Room not found" }, { status: 404, headers: noCacheHeaders });
      }
      room = {
        ...room,
        ...data,
        status: "PLAYING",
        startTime: Date.now(),
        lastUpdate: Date.now(),
      };
      await saveRoom(roomId, room);
      return NextResponse.json({ success: true, room }, { headers: noCacheHeaders });
    }

    if (action === "SET_STATUS") {
      if (!room) {
        return NextResponse.json({ error: "Room not found" }, { status: 404, headers: noCacheHeaders });
      }
      room.status = data?.status || "EXPLODED";
      room.lastUpdate = Date.now();
      await saveRoom(roomId, room);
      return NextResponse.json({ success: true, room }, { headers: noCacheHeaders });
    }

    if (action === "EXPLODE") {
      if (!room) {
        return NextResponse.json({ error: "Room not found" }, { status: 404, headers: noCacheHeaders });
      }
      room.status = "EXPLODED";
      room.lastUpdate = Date.now();
      await saveRoom(roomId, room);
      return NextResponse.json({ success: true, room }, { headers: noCacheHeaders });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400, headers: noCacheHeaders });
  } catch (error) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500, headers: noCacheHeaders });
  }
}
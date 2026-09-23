import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const TMP_DIR = path.join("/tmp", "xor_bomb_rooms");

// ใช้ globalThis เพื่อแชร์ Memory ให้ครอบคลุมทุก scope ใน Node process เดียวกัน
const globalObj = globalThis as unknown as {
  __GAME_ROOMS_CACHE__?: Record<string, any>;
};

if (!globalObj.__GAME_ROOMS_CACHE__) {
  globalObj.__GAME_ROOMS_CACHE__ = {};
}

const memoryRooms = globalObj.__GAME_ROOMS_CACHE__;

async function saveRoomToStorage(roomId: string, data: any) {
  memoryRooms[roomId] = data;
  try {
    await fs.mkdir(TMP_DIR, { recursive: true });
    const filePath = path.join(TMP_DIR, `${roomId}.json`);
    await fs.writeFile(filePath, JSON.stringify(data), "utf8");
  } catch (err) {
    // Non-fatal error fallback
  }
}

async function loadRoomFromStorage(roomId: string) {
  if (memoryRooms[roomId]) {
    return memoryRooms[roomId];
  }
  try {
    const filePath = path.join(TMP_DIR, `${roomId}.json`);
    const content = await fs.readFile(filePath, "utf8");
    const data = JSON.parse(content);
    memoryRooms[roomId] = data;
    return data;
  } catch {
    return null;
  }
}

const noCacheHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
  "CDN-Cache-Control": "no-store",
  "Surrogate-Control": "no-store",
  "Pragma": "no-cache",
  "Expires": "0",
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const roomId = searchParams.get("roomId")?.toUpperCase().trim();

  if (!roomId) {
    return NextResponse.json({ error: "Missing roomId" }, { status: 400, headers: noCacheHeaders });
  }

  const room = await loadRoomFromStorage(roomId);
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

    let room = await loadRoomFromStorage(roomId);

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
      await saveRoomToStorage(roomId, room);
      return NextResponse.json({ success: true, room }, { headers: noCacheHeaders });
    }

    if (action === "JOIN") {
      if (!room) {
        return NextResponse.json({ error: "Room not found" }, { status: 404, headers: noCacheHeaders });
      }
      room.defuserJoined = true;
      room.lastUpdate = Date.now();
      await saveRoomToStorage(roomId, room);
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
      await saveRoomToStorage(roomId, room);
      return NextResponse.json({ success: true, room }, { headers: noCacheHeaders });
    }

    // ยืนยันสถานะชนะ/แพ้ พร้อมบันทึก Timestamp ล่าสุด
    if (action === "SET_STATUS") {
      if (!room) {
        return NextResponse.json({ error: "Room not found" }, { status: 404, headers: noCacheHeaders });
      }
      room.status = data?.status || "EXPLODED";
      room.lastUpdate = Date.now();
      await saveRoomToStorage(roomId, room);
      return NextResponse.json({ success: true, room, status: room.status }, { headers: noCacheHeaders });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400, headers: noCacheHeaders });
  } catch (error) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500, headers: noCacheHeaders });
  }
}
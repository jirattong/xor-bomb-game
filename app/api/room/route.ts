import { NextResponse } from "next/server";

// Fallback In-memory
const globalObj = globalThis as unknown as {
  __GAME_ROOMS_CACHE__?: Record<string, any>;
};
if (!globalObj.__GAME_ROOMS_CACHE__) {
  globalObj.__GAME_ROOMS_CACHE__ = {};
}
const localCache = globalObj.__GAME_ROOMS_CACHE__;

// ใช้ Global Storage Relay สาธารณะความเร็วสูง เพื่อให้ทุกเครื่องทั่วโลกเห็นข้อมูลเดียวกัน
const RELAY_BASE = "https://api.restful-api.dev/objects";

async function fetchFromGlobalRelay(roomId: string) {
  try {
    const res = await fetch(`https://kvstore-free.deno.dev/get/${roomId}`, {
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.id) {
        localCache[roomId] = data;
        return data;
      }
    }
  } catch {}
  return localCache[roomId] || null;
}

async function saveToGlobalRelay(roomId: string, data: any) {
  localCache[roomId] = data;
  try {
    await fetch(`https://kvstore-free.deno.dev/set/${roomId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      cache: "no-store",
    });
  } catch {}
}

const noCacheHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0",
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

  const room = await fetchFromGlobalRelay(roomId);
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

    let room = await fetchFromGlobalRelay(roomId);

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
      await saveToGlobalRelay(roomId, room);
      return NextResponse.json({ success: true, room }, { headers: noCacheHeaders });
    }

    if (action === "JOIN") {
      if (!room) {
        return NextResponse.json({ error: "Room not found" }, { status: 404, headers: noCacheHeaders });
      }
      room.defuserJoined = true;
      room.lastUpdate = Date.now();
      await saveToGlobalRelay(roomId, room);
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
      await saveToGlobalRelay(roomId, room);
      return NextResponse.json({ success: true, room }, { headers: noCacheHeaders });
    }

    if (action === "SET_STATUS") {
      if (!room) {
        return NextResponse.json({ error: "Room not found" }, { status: 404, headers: noCacheHeaders });
      }
      room.status = data?.status || "EXPLODED";
      room.lastUpdate = Date.now();
      await saveToGlobalRelay(roomId, room);
      return NextResponse.json({ success: true, room, status: room.status }, { headers: noCacheHeaders });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400, headers: noCacheHeaders });
  } catch (error) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500, headers: noCacheHeaders });
  }
}